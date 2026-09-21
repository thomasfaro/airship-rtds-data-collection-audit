/**
 * Rendering the model into an .xlsx, and handing the file to the browser.
 *
 * The only layer that needs a DOM and exceljs, which is imported lazily so the
 * model and the value collection stay testable without it. Every decoration is a
 * static fill or a bar drawn from block characters: the workbook has to import
 * into Google Sheets, which drops data bars, icon sets and tables in silence.
 */

import {
  BAR_COLUMN_WIDTH,
  groupValueRows,
  PALETTE,
  shareBar,
  shareColumn,
  TAB_COLORS,
} from "../taggingPlanStyle.js";
import { ANALYSE_SCOPE_SHEET, buildTaggingPlanJsonPayload, buildTaggingPlanWorkbookModel } from "./model.js";
import { collectValueExtracts } from "./values.js";

function solidFill(argb) {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function thin(argb = PALETTE.border) {
  return { style: "thin", color: { argb } };
}

function applyCellBorder(cell) {
  cell.border = { top: thin(), left: thin(), bottom: thin(), right: thin() };
}

/**
 * A flag column ("Platform mismatch", "Potentially obsolete", "Values capped")
 * says nothing when it says "No". Only the answer that costs the reader
 * something gets coloured.
 */
function isRaisedFlag(value) {
  if (value == null) return false;
  const text = String(value).trim();
  return text !== "" && text !== "No" && text !== "—";
}

/**
 * A column marked `bar: true` gets a text bar rendered right after it. The bar
 * is a writer concern, so it never reaches the model the JSON export ships.
 */
function renderColumnsFor(columns) {
  return columns.flatMap((c) =>
    c.bar
      ? [c, { key: `${c.key}__bar`, label: "vs top", type: "bar", from: c.key, width: BAR_COLUMN_WIDTH }]
      : [c],
  );
}

function sanitizeSheetName(name, used) {
  let base = String(name ?? "Sheet").replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet";
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    const suffix = ` (${n})`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

function numFmtForType(type) {
  if (type === "int") return "#,##0";
  if (type === "pct") return "0.0%";
  if (type === "date") return "yyyy-mm-dd hh:mm";
  return null;
}

/**
 * Height for the note band, which is one merged cell across the whole table.
 * A fixed height silently cut the third line off the longest notes — and those
 * are the ones explaining why a sheet looks empty, so they are the ones that
 * have to be readable.
 */
function noteHeight(note, columns) {
  const tableWidth = columns.reduce((sum, c) => sum + (c.width ?? 16), 0);
  const perLine = Math.max(40, Math.floor(tableWidth * 0.95));
  const lines = Math.max(1, Math.ceil(String(note).length / perLine));
  return Math.min(90, 16 + lines * 14);
}

function alignmentFor(column) {
  // Top, like every other cell: a bar centred in a row made tall by a wrapped
  // sample-values column floats away from the number it belongs to.
  if (column.type === "bar") return { vertical: "top", horizontal: "left" };
  if (column.type === "int" || column.type === "pct") {
    return { vertical: "top", horizontal: "right" };
  }
  return column.wrap ? { wrapText: true, vertical: "top" } : { vertical: "top" };
}

/**
 * Render an optional key/value "scope" block (title banner + label/value rows)
 * above the table. Returns the number of rows consumed so the caller can place
 * the table header beneath it.
 */
function renderInfoBlock(ws, colCount, infoBlock, startRow) {
  const infoRows = infoBlock?.rows ?? [];
  let cursor = startRow;

  cursor += 1;
  const bannerRow = ws.getRow(cursor);
  bannerRow.height = 22;
  ws.mergeCells(cursor, 1, cursor, colCount);
  const bannerCell = bannerRow.getCell(1);
  bannerCell.value = infoBlock.title ?? "Analysis scope";
  bannerCell.fill = solidFill(PALETTE.blueLight);
  bannerCell.font = { bold: true, size: 12, color: { argb: PALETTE.blueDark } };
  bannerCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  for (const info of infoRows) {
    cursor += 1;
    const row = ws.getRow(cursor);
    row.height = 18;

    const labelCell = row.getCell(1);
    labelCell.value = info.label;
    labelCell.font = { bold: true, color: { argb: PALETTE.navySoft } };
    labelCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    labelCell.border = { bottom: thin() };

    if (colCount > 1) ws.mergeCells(cursor, 2, cursor, colCount);
    const valueCell = row.getCell(2);
    valueCell.value = info.value;
    if (typeof info.value === "number") valueCell.numFmt = "#,##0";
    valueCell.font = { color: { argb: PALETTE.body } };
    valueCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    valueCell.border = { bottom: thin() };
  }

  // Blank spacer row separates the block from the table below.
  cursor += 1;
  return cursor - startRow;
}

function styleHeaderRow(row, columns) {
  columns.forEach((column, index) => {
    const cell = row.getCell(index + 1);
    cell.fill = solidFill(PALETTE.navySoft);
    cell.font = { bold: true, color: { argb: PALETTE.white } };
    cell.alignment = {
      vertical: "middle",
      wrapText: true,
      horizontal: column.type === "int" || column.type === "pct" ? "right" : "left",
    };
    // An accent rule under the header reads as the edge of the table, which is
    // what tells a reader the rows below are data and the rows above are not.
    cell.border = {
      top: thin(PALETTE.navySoft),
      left: thin(PALETTE.navySoft),
      right: thin(PALETTE.navySoft),
      bottom: { style: "medium", color: { argb: PALETTE.blue } },
    };
  });
}

function addDataSheet(workbook, used, sheetModel, { tabColor = null } = {}) {
  const { rows, note, infoBlock, flagRows = true } = sheetModel;
  const columns = renderColumnsFor(sheetModel.columns);
  const colCount = columns.length;
  const ws = workbook.addWorksheet(sanitizeSheetName(sheetModel.name, used));
  if (tabColor) ws.properties.tabColor = { argb: tabColor };

  ws.columns = columns.map((c) => ({ header: c.label, key: c.key, width: c.width ?? 16 }));

  // Banner title, optional scope block, then optional note sit above the header.
  const infoLines = infoBlock ? (infoBlock.rows?.length ?? 0) + 2 : 0; // banner + rows + spacer
  const preRows = 1 + infoLines + (note ? 1 : 0);
  ws.spliceRows(1, 0, ...Array.from({ length: preRows }, () => []));
  const headerRowNum = preRows + 1;

  const bodyRowCount = rows.filter((r) => !r.__section && !r.__total).length;
  // Bars are drawn against the largest value on the sheet, the way a bar chart
  // scales its axis. Against a fixed 0-100% these sheets would be a column of
  // slivers: a tagging plan is a long tail, and the exact share sits in the
  // number beside the bar anyway.
  const barScale = new Map();
  for (const column of columns) {
    if (column.type !== "bar") continue;
    const values = rows
      .filter((r) => !r.__section && !r.__total)
      .map((r) => Number(r[column.from]))
      .filter((v) => Number.isFinite(v) && v > 0);
    barScale.set(column.key, values.length ? Math.max(...values) : 0);
  }
  const titleRow = ws.getRow(1);
  titleRow.height = 28;
  ws.mergeCells(1, 1, 1, colCount);
  const titleCell = titleRow.getCell(1);
  const heading = sheetModel.title ?? sheetModel.name;
  // The count belongs in the banner: "how many events does this plan have" is
  // the first question asked of a catalogue sheet. The scope sheet counts
  // platforms, which nobody is asking, and reports its own tallies below.
  titleCell.value =
    bodyRowCount > 0 && !infoBlock
      ? `${heading}  ·  ${bodyRowCount.toLocaleString("en-US")} rows`
      : heading;
  titleCell.fill = solidFill(PALETTE.navy);
  titleCell.font = { bold: true, size: 14, color: { argb: PALETTE.white } };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  let cursor = 1;
  if (infoBlock) {
    cursor += renderInfoBlock(ws, colCount, infoBlock, cursor);
  }

  if (note) {
    cursor += 1;
    const noteRow = ws.getRow(cursor);
    noteRow.height = noteHeight(note, columns);
    ws.mergeCells(cursor, 1, cursor, colCount);
    const noteCell = noteRow.getCell(1);
    noteCell.value = note;
    // Notes explain, they do not warn. In amber they read as a problem on every
    // sheet that carries one, which is most of them.
    noteCell.fill = solidFill(PALETTE.blueLight);
    noteCell.font = { italic: true, color: { argb: PALETTE.navySoft } };
    noteCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
  }

  const headerRow = ws.getRow(headerRowNum);
  headerRow.height = 28;
  styleHeaderRow(headerRow, columns);

  let zebra = 0;
  let hasSections = false;

  for (const row of rows) {
    if (row.__section) {
      hasSections = true;
      const sectionRow = ws.addRow([]);
      const n = sectionRow.number;
      ws.mergeCells(n, 1, n, colCount);
      const sc = sectionRow.getCell(1);
      sc.value = row.__section;
      sc.fill = solidFill(PALETTE.blueLight);
      sc.font = { bold: true, color: { argb: PALETTE.blueDark } };
      sc.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      sectionRow.height = 20;
      zebra = 0;
      continue;
    }

    // Each group of collected values starts unshaded, so the banding reads
    // inside a group rather than straight through it.
    if (row.__groupStart) zebra = 0;

    const added = ws.addRow(row);
    const isTotal = Boolean(row.__total);
    // A flag earns a hairline in the margin and a coloured word in its own
    // column — nothing more. Filling the row is tempting until a real capture
    // flags nine rows out of ten, and the fill becomes the wallpaper. On a sheet
    // whose every row is flagged by definition, even the hairline says nothing
    // the sheet name has not already said.
    const isObsolete = flagRows && Boolean(row.__obsolete);
    const isMismatch = flagRows && Boolean(row.__mismatch);
    const rowFill = isTotal
      ? PALETTE.surfaceMuted
      : zebra % 2 === 1
        ? PALETTE.offWhite
        : null;
    const accent = isObsolete ? PALETTE.warnText : isMismatch ? PALETTE.dangerText : null;

    for (let i = 0; i < colCount; i += 1) {
      const c = columns[i];
      const cell = added.getCell(i + 1);

      if (c.type === "bar") {
        const scale = barScale.get(c.key) || 0;
        cell.value = scale > 0 ? shareBar(Number(row[c.from]) / scale) : "";
        cell.font = { color: { argb: PALETTE.blue } };
      }

      const fmt = numFmtForType(c.type);
      if (fmt) cell.numFmt = fmt;
      cell.alignment = alignmentFor(c);
      if (c.type === "text" && (cell.value == null || cell.value === "")) cell.value = "—";
      applyCellBorder(cell);
      if (rowFill) cell.fill = solidFill(rowFill);
      if (isTotal) cell.font = { bold: true, color: { argb: PALETTE.navy } };
      if (c.flag && isRaisedFlag(cell.value)) {
        cell.font = {
          bold: true,
          color: { argb: c.flag === "danger" ? PALETTE.dangerText : PALETTE.warnText },
        };
      }
      // A rule above the row separates a total from its rows, and one group of
      // collected values from the next, without merging anything away.
      if (isTotal) cell.border = { ...cell.border, top: { style: "medium", color: { argb: PALETTE.blue } } };
      else if (row.__groupStart) {
        cell.border = { ...cell.border, top: { style: "medium", color: { argb: PALETTE.blueMid } } };
      }
      if (accent && i === 0) cell.border = { ...cell.border, left: thin(accent) };
    }

    if (!isTotal) zebra += 1;
  }

  ws.views = [{ state: "frozen", xSplit: 1, ySplit: headerRowNum, showGridLines: false }];

  // AutoFilter only when the body is a flat table (merged section bands break filters).
  const dataRowCount = rows.filter((r) => !r.__section).length;
  if (!hasSections && dataRowCount > 0) {
    ws.autoFilter = {
      from: { row: headerRowNum, column: 1 },
      to: { row: headerRowNum, column: colCount },
    };
  }
  return ws;
}

function addValuesSheet(workbook, used, name, columns, rows, note) {
  return addDataSheet(workbook, used, { name, columns, rows, note }, { tabColor: TAB_COLORS.values });
}

function downloadBuffer(buffer, filename) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerBlobDownload(blob, filename);
}

function downloadTextFile(text, filename, mime = "text/plain") {
  triggerBlobDownload(new Blob([text], { type: mime }), filename);
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Build and download the tagging-plan workbook.
 */
export async function generateTaggingPlanXlsx(
  report,
  {
    profileName = null,
    ndjsonFileName = null,
    scopeId = "baseline",
    fetchAttributeValues = null,
    fetchCustomPropertyValues = null,
    onProgress = null,
  } = {},
) {
  onProgress?.({ phase: "values", done: 0, total: 0 });
  const extracts = await collectValueExtracts({
    report,
    ndjsonFileName,
    scopeId,
    fetchAttributeValues,
    fetchCustomPropertyValues,
    onProgress: (p) => onProgress?.({ phase: "values", ...p }),
  });

  const model = buildTaggingPlanWorkbookModel(report, { extracts });

  onProgress?.({ phase: "build" });
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Airship RTDS Data Collection Audit";
  workbook.created = new Date();

  const used = new Set();
  const byName = Object.fromEntries(model.dataSheets.map((s) => [s.name, s]));
  const overview = { tabColor: TAB_COLORS.overview };
  const catalogue = { tabColor: TAB_COLORS.catalogue };

  addDataSheet(workbook, used, byName[ANALYSE_SCOPE_SHEET], overview);
  addDataSheet(workbook, used, byName["App Versions"], overview);
  addDataSheet(workbook, used, byName["Absent from latest version"], overview);
  addDataSheet(workbook, used, byName["Mismatches"], overview);
  addDataSheet(workbook, used, byName["Custom Events"], catalogue);

  const customValueNote = extracts.available
    ? extracts.truncated
      ? "Extract capped (total value row count limited). Values are grouped by event property, heaviest property first, and the share is that property's own split."
      : "Values are grouped by event property, heaviest property first. The share is that property's own split, so it reads as a distribution."
    : "Raw file not kept: values limited to report samples.";
  addValuesSheet(
    workbook,
    used,
    "Custom Event Values",
    [
      { key: "event", label: "Event", type: "text", width: 30 },
      { key: "source", label: "Source", type: "text", width: 12 },
      { key: "property", label: "Property", type: "text", width: 24 },
      { key: "value", label: "Value", type: "text", width: 50, wrap: true },
      { key: "count", label: "Count", type: "int", width: 12 },
      shareColumn("% of property"),
      { key: "deviceTypes", label: "Device types", type: "text", width: 30 },
      { key: "capped", label: "Capped", type: "text", width: 10, flag: "warn" },
    ],
    groupValueRows(extracts.customValues, (r) => `${r.source}\u0000${r.event}\u0000${r.property}`),
    customValueNote,
  );

  addDataSheet(workbook, used, byName["Attributes"], catalogue);
  addValuesSheet(
    workbook,
    used,
    "Attribute Values",
    [
      { key: "key", label: "Key", type: "text", width: 30 },
      { key: "value", label: "Value", type: "text", width: 50, wrap: true },
      { key: "count", label: "Count", type: "int", width: 12 },
      shareColumn("% of key"),
      { key: "deviceTypes", label: "Device types", type: "text", width: 30 },
      { key: "capped", label: "Capped", type: "text", width: 10, flag: "warn" },
    ],
    groupValueRows(extracts.attributeValues, (r) => r.key),
    extracts.available
      ? "Values are grouped by attribute, heaviest attribute first. The share is that attribute's own split, so it reads as a distribution."
      : "Raw file not kept: no detailed attribute values available.",
  );

  addDataSheet(workbook, used, byName["Tags"], catalogue);
  addDataSheet(workbook, used, byName["Subscription Lists"], catalogue);
  addDataSheet(workbook, used, byName["Screens"], catalogue);

  const buffer = await workbook.xlsx.writeBuffer();
  const profile = profileName ?? report?.meta?.profile ?? "audit";
  const slug = String(profile).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "audit";
  const stamp = (report?.meta?.generatedAt ?? new Date().toISOString()).slice(0, 10);
  downloadBuffer(buffer, `${slug}-tagging-plan-${stamp}.xlsx`);

  return { extracts, fileName: `${slug}-tagging-plan-${stamp}.xlsx` };
}

/**
 * Collect value extracts, build the JSON payload and trigger a `.json` download.
 * Mirrors generateTaggingPlanXlsx so the same button flow can offer both formats.
 */
export async function downloadTaggingPlanJson(
  report,
  {
    profileName = null,
    ndjsonFileName = null,
    scopeId = "baseline",
    fetchAttributeValues = null,
    fetchCustomPropertyValues = null,
    onProgress = null,
  } = {},
) {
  onProgress?.({ phase: "values", done: 0, total: 0 });
  const extracts = await collectValueExtracts({
    report,
    ndjsonFileName,
    scopeId,
    fetchAttributeValues,
    fetchCustomPropertyValues,
    onProgress: (p) => onProgress?.({ phase: "values", ...p }),
  });

  onProgress?.({ phase: "build" });
  const payload = buildTaggingPlanJsonPayload(report, { extracts, profileName, scopeId });

  const profile = payload.meta.profile;
  const slug = String(profile).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "audit";
  const stamp = (report?.meta?.generatedAt ?? new Date().toISOString()).slice(0, 10);
  const fileName = `${slug}-tagging-plan-${stamp}.json`;
  downloadTextFile(JSON.stringify(payload, null, 2), fileName, "application/json");

  return { extracts, fileName, payload };
}
