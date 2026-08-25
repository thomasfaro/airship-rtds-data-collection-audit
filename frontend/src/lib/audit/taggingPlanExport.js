/**
 * RTDS tagging plan Excel (.xlsx) export from an audit report.
 *
 * Three layers:
 *   - buildTaggingPlanWorkbookModel(report): pure model (sheets, columns, rows).
 *   - collectValueExtracts(...): async value histograms from the paginated endpoints
 *     (with concurrency pool, global cap and fallback to report samples).
 *   - generateTaggingPlanXlsx(report, opts): assembles the exceljs workbook, applies
 *     readability conventions, and triggers a Blob download.
 *
 * exceljs is imported lazily inside generateTaggingPlanXlsx so the pure model /
 * collection helpers can be unit-tested under `node --test` without the dependency.
 */

import { formatDurationDaysHours } from "../formatTimeSpan.js";
import { buildProcessedRange } from "../processedHours.js";
import { filterMismatchWarnings } from "./auditMismatchWarnings.js";
import {
  groupAuditWarnings,
  flattenGroupedAuditWarnings,
  MISMATCH_LABELS,
  WARNING_CATEGORY_LABELS,
} from "./auditWarningGroups.js";
import {
  BAR_COLUMN_WIDTH,
  groupValueRows,
  PALETTE,
  shareBar,
  shareColumn,
  TAB_COLORS,
  withShares,
} from "./taggingPlanStyle.js";

const VALUE_TRUNCATE = 200;
const ANALYSE_SCOPE_SHEET = "Analyse scope";

/* ------------------------------------------------------------------ */
/* Platform helpers                                                    */
/* ------------------------------------------------------------------ */

/** Canonical, human-friendly platform label for a raw RTDS device_type. */
export function canonicalPlatform(deviceType) {
  const dt = String(deviceType ?? "").toUpperCase();
  if (["IOS", "IPHONE", "IPAD", "TVOS"].includes(dt)) return "iOS";
  if (dt === "ANDROID") return "Android";
  if (dt === "AMAZON") return "Amazon";
  if (["WEB", "WEB_PUSH"].includes(dt)) return "Web";
  if (dt === "SMS") return "SMS";
  if (dt === "EMAIL") return "Email";
  if (dt === "API_NAMED_USER_EVENTS") return "API";
  if (!dt) return "Unknown";
  if (dt === "UNKNOWN") return "Unknown";
  return dt;
}

const PLATFORM_ORDER = ["iOS", "Android", "Amazon", "Web", "SMS", "Email", "API", "Unknown"];

function orderPlatforms(labels) {
  const set = new Set(labels);
  const ordered = PLATFORM_ORDER.filter((p) => set.has(p));
  const extras = [...set].filter((p) => !PLATFORM_ORDER.includes(p)).sort();
  return [...ordered, ...extras];
}

/** Sum a row's byDeviceBreakdown into canonical platform counts. */
function platformCountsFromBreakdown(byDeviceBreakdown) {
  const map = {};
  for (const entry of byDeviceBreakdown ?? []) {
    const label = canonicalPlatform(entry.deviceType);
    map[label] = (map[label] ?? 0) + (entry.count ?? 0);
  }
  return map;
}

/** Derive the stable, ordered set of platform columns from all rows. */
function derivePlatformColumns(report) {
  const labels = new Set();
  const add = (rows) => {
    for (const row of rows ?? []) {
      for (const entry of row.byDeviceBreakdown ?? []) labels.add(canonicalPlatform(entry.deviceType));
    }
  };
  add(report.customEvents?.sdk?.top);
  add(report.customEvents?.api?.top);
  add(report.customEvents?.unknown?.top);
  add(report.attributes?.topKeys);
  add(report.screenViewed?.top);
  add(report.subscriptionLists?.byList);
  for (const row of report.byDeviceType ?? []) labels.add(canonicalPlatform(row.deviceType ?? row.key));
  return orderPlatforms([...labels]);
}

function platformColumnDefs(platforms) {
  return platforms.map((p) => ({ key: `plat_${p}`, label: p, type: "int", width: 11 }));
}

function platformCells(byDeviceBreakdown, platforms) {
  const counts = platformCountsFromBreakdown(byDeviceBreakdown);
  const cells = {};
  for (const p of platforms) {
    const v = counts[p] ?? 0;
    cells[`plat_${p}`] = v > 0 ? v : null;
  }
  return cells;
}
/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

function truncateValue(value) {
  if (value == null) return "";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (s.length <= VALUE_TRUNCATE) return s;
  return `${s.slice(0, VALUE_TRUNCATE)}… (+${s.length - VALUE_TRUNCATE})`;
}

function joinCounts(map) {
  return Object.entries(map ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}: ${n}`)
    .join(", ");
}

function joinList(list, max = 12) {
  const arr = list ?? [];
  if (arr.length <= max) return arr.join(", ");
  return `${arr.slice(0, max).join(", ")} (+${arr.length - max})`;
}

function platformsLabel(list) {
  return (list ?? []).map(canonicalPlatform).join(", ");
}

function resolveAnalyzedProcessedRange(report) {
  const meta = report?.meta ?? {};
  const range = meta.processedRange ?? meta.queryContext?.processedRange ?? null;
  if (!range?.from || !range?.to) return null;
  if (range.spanLabel) return range;
  return buildProcessedRange(range.from, range.to) ?? range;
}

function formatReportInstant(iso, timezone = "UTC") {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(iso);
  }
}

/** Key/value pairs describing the analysis scope, rendered above the table. */
function buildScopeInfoRows(report) {
  const timezone = report?.meta?.timezone ?? "UTC";
  const range = resolveAnalyzedProcessedRange(report);
  const spanLabel =
    range?.spanLabel ??
    (range?.spanMs != null ? formatDurationDaysHours(range.spanMs) : null) ??
    (range?.from && range?.to
      ? formatDurationDaysHours(Math.max(0, Date.parse(range.to) - Date.parse(range.from)))
      : "—");

  const rows = [
    { label: "Duration analyzed", value: spanLabel },
    { label: "Processed from", value: formatReportInstant(range?.from, timezone) },
    { label: "Processed to", value: formatReportInstant(range?.to, timezone) },
    { label: "Timezone", value: timezone },
  ];

  const qc = report?.meta?.queryContext;
  if (qc?.streamModeLabel) {
    rows.push({ label: "Stream mode", value: qc.streamModeLabel });
  }
  if (report?.meta?.totalEvents != null) {
    rows.push({ label: "Total events in scope", value: report.meta.totalEvents });
  }

  const app = report?.meta?.appVersion;
  if (app?.version) {
    rows.push({
      label: "Audited with",
      value: app.commit ? `RTDS DCA ${app.version} (${app.commit})` : `RTDS DCA ${app.version}`,
    });
  }

  return rows;
}

function obsolescenceColumns() {
  return [
    { key: "obsMaxVersion", label: "Max app version seen", type: "text", width: 18 },
    { key: "obsFlag", label: "Potentially obsolete", type: "text", width: 22, flag: "warn" },
  ];
}

/** The one column that says a platform is missing the item. */
function mismatchColumn() {
  return { key: "mismatch", label: "Platform mismatch", type: "text", width: 16, flag: "danger" };
}

function obsolescenceCells(obs) {
  const flagged = Boolean(obs?.potentiallyObsolete);
  return {
    obsMaxVersion: obs?.maxVersionSeen ?? "",
    obsFlag: flagged ? "Yes" : "No",
    __obsolete: flagged,
  };
}

/** Per-item source/version scope (SDK max app version vs API version-agnostic). */
function versionScopeColumns() {
  return [{ key: "versionScope", label: "Version scope", type: "text", width: 28 }];
}

function versionScopeCells(vs) {
  return {
    versionScope: vs?.label ?? "",
    // Passthrough for the JSON export (ignored by the .xlsx writer).
    __versionScope: vs ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Sheet builders                                                      */
/* ------------------------------------------------------------------ */

/**
 * Build lookup maps from collected value extracts so sheet builders can
 * display inline sample values without an extra async step.
 */
const MAX_INLINE_SAMPLES = 8;

function buildValueLookups(extracts) {
  const customPropValuesMap = new Map();
  for (const v of extracts?.customValues ?? []) {
    const k = `${v.source}::${v.event}::${v.property}`;
    if (!customPropValuesMap.has(k)) customPropValuesMap.set(k, []);
    const arr = customPropValuesMap.get(k);
    if (arr.length < MAX_INLINE_SAMPLES) arr.push(v.value);
  }
  const attrValuesMap = new Map();
  for (const v of extracts?.attributeValues ?? []) {
    if (!attrValuesMap.has(v.key)) attrValuesMap.set(v.key, []);
    const arr = attrValuesMap.get(v.key);
    if (arr.length < MAX_INLINE_SAMPLES) arr.push(v.value);
  }
  return { customPropValuesMap, attrValuesMap };
}

/** Property names that actually have collected values for a custom-event row (any source). */
function customRowPropertyNames(row) {
  const names = new Set();
  for (const stat of row.propertyValueStats ?? []) {
    if (stat.property) names.add(stat.property);
  }
  for (const p of row.properties ?? []) names.add(p);
  return [...names];
}

/**
 * What the plan actually contains, appended to the scope block. Reading this on
 * the first sheet answers the questions the other sheets take a scroll each to
 * answer: how much is tracked, and how much of it looks wrong.
 */
function planContentsRows(contents) {
  if (!contents) return [];
  const dataRows = (sheet) => (sheet?.rows ?? []).filter((r) => !r.__section && !r.__total).length;
  const rows = [
    { label: "Custom events tracked", value: dataRows(contents.customEvents) },
    { label: "Attributes tracked", value: dataRows(contents.attributes) },
    { label: "Tags tracked", value: dataRows(contents.tags) },
    { label: "Subscription lists tracked", value: dataRows(contents.subscriptionLists) },
    { label: "Screens tracked", value: dataRows(contents.screens) },
  ];

  // These two name the sheet that holds the detail. The label column is as wide
  // as the table's first column, so a longer sentence is simply cut off.
  rows.push({ label: "Absent from latest version", value: dataRows(contents.absentFromLatest) });
  rows.push({ label: "Platform mismatches", value: dataRows(contents.mismatches) });
  return rows;
}

function buildAnalyseScopeSheet(report, contents = null) {
  const byDevice = report.byDeviceType ?? [];

  // Union of event types across platforms, ordered by total volume desc.
  const EXCLUDED_TYPES = new Set(["SEND_REJECTED"]);
  const typeTotals = new Map();
  for (const r of byDevice) {
    for (const t of r.eventTypes ?? []) {
      if (EXCLUDED_TYPES.has(t.type)) continue;
      typeTotals.set(t.type, (typeTotals.get(t.type) ?? 0) + (t.count ?? 0));
    }
  }
  const orderedTypes = [...typeTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type]) => type);
  const keyByType = new Map(orderedTypes.map((type, i) => [type, `et_${i}`]));

  const columns = [
    { key: "platform", label: "Platform (device_type)", type: "text", width: 26 },
    { key: "total", label: "Total events", type: "int", width: 16 },
    shareColumn("% of events"),
    ...orderedTypes.map((type) => ({ key: keyByType.get(type), label: type, type: "int", width: 16 })),
  ];

  const platformRows = byDevice.map((r) => {
    const row = { platform: canonicalPlatform(r.deviceType ?? r.key), total: r.count ?? 0 };
    for (const type of orderedTypes) row[keyByType.get(type)] = null;
    for (const t of r.eventTypes ?? []) {
      const k = keyByType.get(t.type);
      if (k && (t.count ?? 0) > 0) row[k] = (row[k] ?? 0) + t.count;
    }
    return row;
  });
  platformRows.sort((a, b) => (b.total ?? 0) - (a.total ?? 0));

  if (platformRows.length > 0) {
    const totalRow = { platform: "Total", total: 0, __total: true };
    for (const type of orderedTypes) totalRow[keyByType.get(type)] = 0;
    for (const r of platformRows) {
      totalRow.total += r.total ?? 0;
      for (const type of orderedTypes) {
        const k = keyByType.get(type);
        totalRow[k] += r[k] ?? 0;
      }
    }
    for (const type of orderedTypes) {
      const k = keyByType.get(type);
      if (totalRow[k] === 0) totalRow[k] = null;
    }
    platformRows.push(totalRow);
  }

  withShares(platformRows, (r) => r.total);

  return {
    name: ANALYSE_SCOPE_SHEET,
    infoBlock: {
      title: "Capture summary",
      rows: [...buildScopeInfoRows(report), ...planContentsRows(contents)],
    },
    note: "Event volume by platform (rows) and event type (columns). Blank cells mean no events of that type were seen on the platform.",
    columns,
    rows: platformRows,
  };
}

function buildCustomEventsSheet(report, platforms, lookups = {}) {
  const platCols = platformColumnDefs(platforms);
  const columns = [
    { key: "name", label: "Name", type: "text", width: 34 },
    { key: "source", label: "Source", type: "text", width: 14 },
    { key: "total", label: "Total", type: "int", width: 12 },
    shareColumn("% of events"),
    ...platCols,
    { key: "eventValues", label: "Event value samples", type: "text", width: 40, wrap: true },
    { key: "properties", label: "Properties", type: "text", width: 40, wrap: true },
    { key: "propSamples", label: "Property sample values", type: "text", width: 70, wrap: true },
    { key: "present", label: "Present platforms", type: "text", width: 22 },
    { key: "missing", label: "Missing platforms", type: "text", width: 22 },
    mismatchColumn(),
    ...versionScopeColumns(),
    ...obsolescenceColumns(),
  ];

  const sections = [
    ["SDK", report.customEvents?.sdk?.top],
    ["API", report.customEvents?.api?.top],
    ["UNKNOWN", report.customEvents?.unknown?.top],
  ];
  const rows = [];
  for (const [src, list] of sections) {
    for (const r of list ?? []) {
      // "value" is the event-level value param; surfaced in its own column.
      const eventValues = (lookups.customPropValuesMap?.get(`${src}::${r.name}::value`) ?? [])
        .slice(0, 6)
        .join(", ");

      // Real properties (any source) that carry collected values — one line each.
      const propNames = customRowPropertyNames(r).filter((p) => p !== "value");
      const propSamples = propNames
        .map((prop) => {
          const vals = lookups.customPropValuesMap?.get(`${src}::${r.name}::${prop}`);
          return vals?.length ? `${prop}: ${vals.slice(0, 5).join(", ")}` : null;
        })
        .filter(Boolean)
        .join("\n");

      rows.push({
        name: r.name,
        source: src,
        total: r.count ?? 0,
        ...platformCells(r.byDeviceBreakdown, platforms),
        eventValues,
        properties: joinList(propNames),
        propSamples,
        present: platformsLabel(r.presentPlatforms),
        missing: platformsLabel(r.missingPlatforms),
        mismatch: r.platformMismatch ? "Yes" : "No",
        __mismatch: Boolean(r.platformMismatch),
        ...versionScopeCells(r.versionScope),
        ...obsolescenceCells(r.obsolescence),
      });
    }
  }
  rows.sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
  withShares(rows, (r) => r.total);
  return { name: "Custom Events", columns, rows };
}

function buildAttributesSheet(report, platforms, lookups = {}) {
  const columns = [
    { key: "key", label: "Key", type: "text", width: 30 },
    { key: "normalized", label: "Normalized", type: "text", width: 30 },
    { key: "total", label: "Total ops", type: "int", width: 12 },
    shareColumn("% of ops"),
    { key: "actions", label: "Actions", type: "text", width: 22 },
    { key: "sources", label: "Sources", type: "text", width: 22 },
    ...platformColumnDefs(platforms),
    { key: "distinctValues", label: "Distinct values", type: "int", width: 16 },
    { key: "capped", label: "Values capped", type: "text", width: 16, flag: "warn" },
    { key: "sampleValues", label: "Sample values", type: "text", width: 60, wrap: true },
    { key: "present", label: "Present platforms", type: "text", width: 22 },
    { key: "missing", label: "Missing platforms", type: "text", width: 22 },
    mismatchColumn(),
    ...versionScopeColumns(),
    ...obsolescenceColumns(),
  ];
  const rows = (report.attributes?.topKeys ?? []).map((r) => ({
    key: r.key,
    normalized: r.normalized,
    total: r.count ?? 0,
    actions: joinCounts(r.actions),
    sources: joinCounts(r.sources),
    ...platformCells(r.byDeviceBreakdown, platforms),
    distinctValues: r.trackedValueCount ?? 0,
    capped: r.valuesCapped ? "100+" : "",
    sampleValues: (lookups.attrValuesMap?.get(r.key) ?? []).slice(0, 5).join(", "),
    present: platformsLabel(r.presentPlatforms),
    missing: platformsLabel(r.missingPlatforms),
    mismatch: r.platformMismatch ? "Yes" : "No",
    __mismatch: Boolean(r.platformMismatch),
    ...versionScopeCells(r.versionScope),
    ...obsolescenceCells(r.obsolescence),
  }));
  rows.sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
  withShares(rows, (r) => r.total);
  return { name: "Attributes", columns, rows };
}

function buildTagsSheet(report) {
  const byKey = new Map();
  const ingest = (list, field) => {
    for (const r of list ?? []) {
      if (!byKey.has(r.key)) {
        byKey.set(r.key, {
          key: r.key,
          group: r.group ?? "",
          value: r.value ?? "",
          added: 0,
          removed: 0,
          obsolescence: r.obsolescence,
          versionScope: r.versionScope,
        });
      }
      const row = byKey.get(r.key);
      row[field] = r.count ?? 0;
      if (!row.obsolescence && r.obsolescence) row.obsolescence = r.obsolescence;
      if (!row.versionScope && r.versionScope) row.versionScope = r.versionScope;
    }
  };
  ingest(report.tags?.topAdded, "added");
  ingest(report.tags?.topRemoved, "removed");

  const columns = [
    { key: "key", label: "Tag (group:value)", type: "text", width: 34 },
    { key: "group", label: "Group", type: "text", width: 22 },
    { key: "value", label: "Value", type: "text", width: 22 },
    { key: "added", label: "Added", type: "int", width: 12 },
    { key: "removed", label: "Removed", type: "int", width: 12 },
    { key: "net", label: "Net", type: "int", width: 12 },
    shareColumn("% of changes"),
    ...versionScopeColumns(),
    ...obsolescenceColumns(),
  ];
  const rows = [...byKey.values()]
    .filter((r) => r.group?.toLowerCase() !== "timezone")
    .map((r) => ({
      key: r.key,
      group: r.group,
      value: r.value === null ? "" : r.value,
      added: r.added,
      removed: r.removed,
      net: r.added - r.removed,
      ...versionScopeCells(r.versionScope),
      ...obsolescenceCells(r.obsolescence),
    }));
  rows.sort((a, b) => b.added + b.removed - (a.added + a.removed));
  withShares(rows, (r) => r.added + r.removed);
  return { name: "Tags", columns, rows };
}

function buildSubscriptionListsSheet(report, platforms) {
  const columns = [
    { key: "listId", label: "List ID", type: "text", width: 34 },
    { key: "subscribe", label: "Subscribe", type: "int", width: 12 },
    { key: "unsubscribe", label: "Unsubscribe", type: "int", width: 12 },
    { key: "net", label: "Net", type: "int", width: 12 },
    shareColumn("% of changes"),
    ...platformColumnDefs(platforms),
    { key: "scopes", label: "Scopes", type: "text", width: 22 },
    { key: "source", label: "Source", type: "text", width: 14 },
    { key: "present", label: "Present platforms", type: "text", width: 22 },
    { key: "missing", label: "Missing platforms", type: "text", width: 22 },
    mismatchColumn(),
    ...versionScopeColumns(),
    ...obsolescenceColumns(),
  ];
  const rows = (report.subscriptionLists?.byList ?? []).map((r) => ({
    listId: r.listId,
    subscribe: r.subscribe ?? 0,
    unsubscribe: r.unsubscribe ?? 0,
    net: r.net ?? 0,
    ...platformCells(r.byDeviceBreakdown, platforms),
    scopes: (r.byScope ?? []).map((s) => `${s.scope}: ${s.count}`).join(", "),
    source: r.source ?? "",
    present: platformsLabel(r.presentPlatforms),
    missing: platformsLabel(r.missingPlatforms),
    mismatch: r.platformMismatch ? "Yes" : "No",
    __mismatch: Boolean(r.platformMismatch),
    ...versionScopeCells(r.versionScope),
    ...obsolescenceCells(r.obsolescence),
  }));
  rows.sort((a, b) => (b.subscribe + b.unsubscribe) - (a.subscribe + a.unsubscribe));
  withShares(rows, (r) => r.subscribe + r.unsubscribe);
  return { name: "Subscription Lists", note: subscriptionListsNote(report, rows.length), columns, rows };
}

/** Explain an empty Subscription Lists sheet (entitlement vs. none seen). */
function subscriptionListsNote(report, rowCount) {
  if (rowCount > 0) return null;
  const excluded = report.meta?.excludedEntitlements ?? [];
  if (excluded.includes("SUBSCRIPTION_LIST")) {
    return "No data: this project's RTDS token is not entitled to SUBSCRIPTION_LIST events, so opt-ins / opt-outs were not streamed. Ask Airship to enable the SUBSCRIPTION_LIST event type for this token, then re-run the audit.";
  }
  return "No SUBSCRIPTION_LIST events were seen in this capture window. Subscription changes only appear here when the SDK/API emits SUBSCRIPTION_LIST events (channel- or contact-scoped list opt-ins / opt-outs).";
}

function buildScreensSheet(report, platforms) {
  const columns = [
    { key: "name", label: "Screen", type: "text", width: 34 },
    { key: "total", label: "Total", type: "int", width: 12 },
    shareColumn("% of views"),
    ...platformColumnDefs(platforms),
    { key: "present", label: "Present platforms", type: "text", width: 22 },
    { key: "missing", label: "Missing platforms", type: "text", width: 22 },
    mismatchColumn(),
    ...versionScopeColumns(),
    ...obsolescenceColumns(),
  ];
  const rows = (report.screenViewed?.top ?? []).map((r) => ({
    name: r.name,
    total: r.count ?? 0,
    ...platformCells(r.byDeviceBreakdown, platforms),
    present: platformsLabel(r.presentPlatforms),
    missing: platformsLabel(r.missingPlatforms),
    mismatch: r.platformMismatch ? "Yes" : "No",
    __mismatch: Boolean(r.platformMismatch),
    ...versionScopeCells(r.versionScope),
    ...obsolescenceCells(r.obsolescence),
  }));
  rows.sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
  withShares(rows, (r) => r.total);
  return { name: "Screens", columns, rows };
}

const ABSENT_TYPE_LABELS = {
  custom_event: "Custom events",
  attribute: "Attributes",
  tag: "Tags",
  screen: "Screens",
  subscription_list: "Subscription lists",
};
const ABSENT_TYPE_ORDER = ["custom_event", "attribute", "tag", "screen", "subscription_list"];

/** Every item the obsolescence rule looks at, in the same families the engine walks. */
function obsolescenceJudgedRows(report) {
  const rows = [];
  for (const section of ["sdk", "api", "unknown"]) {
    rows.push(...(report.customEvents?.[section]?.top ?? []));
  }
  rows.push(...(report.attributes?.topKeys ?? []));
  rows.push(...(report.screenViewed?.top ?? []));
  rows.push(...(report.subscriptionLists?.byList ?? []));

  // A tag appears in both the added and removed tables; the rule judges it once.
  const seenTags = new Set();
  for (const row of [...(report.tags?.topAdded ?? []), ...(report.tags?.topRemoved ?? [])]) {
    if (seenTags.has(row.key)) continue;
    seenTags.add(row.key);
    rows.push(row);
  }
  return rows;
}

/**
 * Why nothing is flagged. "No rows" has three very different causes — everything
 * is still live, nothing carried an app version, or what did carry one was too
 * thin to judge — and a sheet that states none of them reads as a hole in the
 * report rather than the clean bill of health it usually is.
 */
export function absentFromLatestVerdict(report) {
  // A report captured before the engine reported its landscape cannot be told
  // apart from one that saw no app version at all, and guessing wrong turns a
  // clean bill of health into "we could not check". Absent is not empty.
  const landscapeKnown = Array.isArray(report.obsolescence?.platforms);
  const platforms = (report.obsolescence?.platforms ?? []).filter((p) => p.currentVersion);
  const currentVersions = new Set(platforms.map((p) => p.currentVersion));

  let onCurrent = 0;
  let onOlder = 0;
  let noVersion = 0;
  for (const row of obsolescenceJudgedRows(report)) {
    const seen = row.versionScope?.maxAppVersion ?? null;
    if (!seen) noVersion += 1;
    // Set membership, not a version comparison: the engine already worked out
    // which build is current, and duplicating that arithmetic here is how the
    // two would drift apart.
    else if (currentVersions.has(seen)) onCurrent += 1;
    else onOlder += 1;
  }

  return {
    landscapeKnown,
    total: onCurrent + onOlder + noVersion,
    onCurrent,
    onOlder,
    noVersion,
    minVolume: report.obsolescence?.params?.minVolume ?? null,
    platformsLabel: platforms.map((p) => `${canonicalPlatform(p.deviceType)} ${p.currentVersion}`).join(", "),
  };
}

/** The empty-state note: the verdict, and the evidence behind it. */
function absentFromLatestEmptyNote(report) {
  const v = absentFromLatestVerdict(report);
  const n = (value) => value.toLocaleString("en-US");

  if (!v.landscapeKnown) {
    return "No tracked item appears absent from the latest app build for this capture window. Reliability improves with longer captures spanning several app versions.";
  }

  if (!v.platformsLabel) {
    return "Nothing could be judged: no tracking event in this capture carried an app version, which only device (SDK) events do. API-fed data and web channels never do, so obsolescence cannot be assessed from this window.";
  }

  const parts = [`No tracked item looks absent from the latest app build (${v.platformsLabel}).`];
  const evidence = [`${n(v.onCurrent)} of ${n(v.total)} items were last seen on a current build`];
  if (v.noVersion > 0) {
    evidence.push(`${n(v.noVersion)} carry no app version at all — API-fed data and web channels never do`);
  }
  if (v.onOlder > 0) {
    evidence.push(
      `${n(v.onOlder)} last appeared on an older build but stayed under the ${n(v.minVolume ?? 0)}-event floor the rule needs before it calls tracking dead`,
    );
  }
  parts.push(`${evidence.join("; ")}.`);
  parts.push("Reliability improves with longer captures spanning several app versions.");
  return parts.join(" ");
}

function buildAbsentFromLatestSheet(report) {
  const columns = [
    { key: "name", label: "Name / Key", type: "text", width: 34 },
    { key: "platform", label: "Platform", type: "text", width: 14 },
    { key: "source", label: "Source", type: "text", width: 10 },
    { key: "volume", label: "Volume", type: "int", width: 12 },
    { key: "maxVersion", label: "Last app version seen", type: "text", width: 20 },
    { key: "platformMax", label: "Current app version", type: "text", width: 20 },
    { key: "lastSeen", label: "Last seen (processed)", type: "text", width: 26 },
    { key: "reason", label: "Reason", type: "text", width: 70, wrap: true },
  ];

  const items = report.obsolescence?.items ?? [];

  if (items.length === 0) {
    return {
      name: "Absent from latest version",
      note: absentFromLatestEmptyNote(report),
      columns,
      rows: [],
      flagRows: false,
    };
  }

  const counts = {};
  for (const it of items) counts[it.type] = (counts[it.type] ?? 0) + 1;
  const summaryParts = [...ABSENT_TYPE_ORDER, ...Object.keys(counts).filter((t) => !ABSENT_TYPE_ORDER.includes(t))]
    .filter((t) => counts[t])
    .map((t) => `${ABSENT_TYPE_LABELS[t] ?? t}: ${counts[t]}`);

  const toRow = (it) => ({
    name: it.name,
    platform: canonicalPlatform(it.platform),
    source: it.source ?? "SDK",
    volume: it.volume ?? 0,
    maxVersion: it.maxVersionSeen ?? "",
    platformMax: it.platformMaxVersion ?? "",
    lastSeen: it.lastProcessed ?? "",
    reason: it.reason ?? "",
    __obsolete: true,
  });

  const rows = [];
  const knownTypes = new Set(ABSENT_TYPE_ORDER);
  const groupOrder = [...ABSENT_TYPE_ORDER, ...[...new Set(items.map((it) => it.type))].filter((t) => !knownTypes.has(t))];
  for (const type of groupOrder) {
    const group = items.filter((it) => it.type === type);
    if (group.length === 0) continue;
    group.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
    rows.push({ __section: ABSENT_TYPE_LABELS[type] ?? type });
    for (const it of group) rows.push(toRow(it));
  }

  return {
    name: "Absent from latest version",
    note: `Likely no longer tracked in the latest app build — ${summaryParts.join("  ·  ")}. Only SDK (on-device) data carries app versions, so API-only data is never flagged.`,
    columns,
    rows,
    flagRows: false,
  };
}

/** Families of cross-platform mismatch surfaced here (SDK version issues excluded). */
const MISMATCH_SHEET_KEYS = ["platform_coverage", "cross_platform_inconsistency"];

/** Human-readable "only on A / only on B" diff for property/value mismatches. */
function mismatchDetails(w) {
  const parts = [];
  if (w.deviceA && (w.onlyOnA?.length || w.onlyOnB?.length)) {
    parts.push(`${w.deviceA} only: ${w.onlyOnA?.length ? w.onlyOnA.join(", ") : "—"}`);
    parts.push(`${w.deviceB} only: ${w.onlyOnB?.length ? w.onlyOnB.join(", ") : "—"}`);
  }
  return parts.join("; ");
}

function buildMismatchSheet(report) {
  const columns = [
    { key: "dataType", label: "Data type", type: "text", width: 18 },
    { key: "issue", label: "Issue", type: "text", width: 26 },
    { key: "name", label: "Name / Key", type: "text", width: 34 },
    { key: "source", label: "Source", type: "text", width: 12 },
    { key: "present", label: "Present platforms", type: "text", width: 20 },
    { key: "missing", label: "Missing platforms", type: "text", width: 20 },
    { key: "details", label: "Details", type: "text", width: 50, wrap: true },
    { key: "message", label: "Message", type: "text", width: 70, wrap: true },
  ];

  const warnings = filterMismatchWarnings(report?.executiveSummary?.warnings ?? []);
  const flat = flattenGroupedAuditWarnings(groupAuditWarnings(warnings)).filter(
    (row) => MISMATCH_SHEET_KEYS.includes(row.mismatchKey) && typeof row.item !== "string",
  );

  if (flat.length === 0) {
    return {
      name: "Mismatches",
      note: "No cross-platform coverage or value/property mismatches were detected in this capture window. Detection improves with captures that include comparable mobile platforms (iOS and Android).",
      columns,
      rows: [],
      flagRows: false,
    };
  }

  const toRow = (w, dataTypeGroup) => ({
    dataType: dataTypeGroup ?? "",
    issue: WARNING_CATEGORY_LABELS[w.category] ?? w.category ?? "",
    name: w.name ?? w.key ?? w.screen ?? w.normalized ?? "",
    source: w.source ?? "",
    present: platformsLabel(w.presentOn),
    missing: platformsLabel(w.missingOn),
    details: mismatchDetails(w),
    message: w.message ?? "",
    __mismatch: true,
  });

  const rows = [];
  for (const key of MISMATCH_SHEET_KEYS) {
    const group = flat.filter((row) => row.mismatchKey === key);
    if (group.length === 0) continue;
    rows.push({ __section: MISMATCH_LABELS[key] ?? key });
    for (const row of group) rows.push(toRow(row.item, row.dataTypeGroup));
  }

  return {
    name: "Mismatches",
    note: "Cross-platform inconsistencies already flagged by the audit: presence gaps between platforms and value/property differences (event properties, attribute value shapes, casing, email properties). SDK version issues are reported separately.",
    columns,
    rows,
    flagRows: false,
  };
}

/**
 * App versions live during the capture, read from the `app_version` the tracking
 * events carry themselves. A tracking-only capture never requests OPEN, so this
 * is the version signal available here.
 */
function buildAppVersionsSheet(report) {
  const byPlatform = report.appVersions ?? [];
  const columns = [
    { key: "os", label: "OS", type: "text", width: 12 },
    { key: "appVersion", label: "App version", type: "text", width: 18 },
    { key: "sdkVersion", label: "SDK version", type: "text", width: 18 },
    { key: "eventCount", label: "Tracking events", type: "int", width: 16 },
    { key: "pctOfOs", label: "% of OS events", type: "pct", width: 16, bar: true },
    { key: "pctOfAppVersion", label: "% of app version", type: "pct", width: 18 },
  ];

  const rows = [];
  let withVersionTotal = 0;
  let deviceTotal = 0;
  for (const plat of byPlatform) {
    const os = canonicalPlatform(plat.deviceType);
    const osTotal = plat.deviceEventTotal ?? 0;
    deviceTotal += osTotal;
    for (const ver of plat.versions ?? []) {
      const appTotal = ver.count ?? 0;
      withVersionTotal += appTotal;
      const sdkRows = ver.sdkVersions?.length ? [...ver.sdkVersions] : [];
      const sdkTotal = sdkRows.reduce((sum, sdk) => sum + (sdk.count ?? 0), 0);
      if (appTotal > sdkTotal) {
        // ua_sdk_version can be missing on an event that still carries app_version:
        // without this row those events would vanish from the sheet.
        const label = sdkRows.length === 0 ? (ver.sdkLabel ?? null) : null;
        sdkRows.push({ version: label, count: appTotal - sdkTotal });
      }
      for (const sdk of sdkRows) {
        const eventCount = sdk.count ?? 0;
        if (eventCount <= 0) continue;
        rows.push({
          os,
          appVersion: ver.version,
          sdkVersion: sdk.version ?? "—",
          eventCount,
          pctOfOs: osTotal ? eventCount / osTotal : 0,
          pctOfAppVersion: appTotal ? eventCount / appTotal : 0,
        });
      }
    }
  }
  rows.sort((a, b) => (b.eventCount ?? 0) - (a.eventCount ?? 0));

  const note =
    rows.length > 0
      ? `App versions carried by the tracking events in the capture window: ${withVersionTotal.toLocaleString("en-US")} of ${deviceTotal.toLocaleString("en-US")} events on device channels. SDK version is ua_sdk_version on the same device event. Events with no app version are absent from this sheet: API-fed data, which carries no device, and web channels.`
      : "No tracking event carried an app version: the capture saw API-fed data or web channels only.";

  return { name: "App Versions", note, columns, rows };
}

/**
 * Build the workbook sheet model. Pass `extracts` to populate inline sample values.
 */
export function buildTaggingPlanWorkbookModel(report, { extracts = null } = {}) {
  const platforms = derivePlatformColumns(report);
  const lookups = buildValueLookups(extracts);

  // The catalogue is built first so the scope sheet can report what it holds.
  const contents = {
    appVersions: buildAppVersionsSheet(report),
    absentFromLatest: buildAbsentFromLatestSheet(report),
    mismatches: buildMismatchSheet(report),
    customEvents: buildCustomEventsSheet(report, platforms, lookups),
    attributes: buildAttributesSheet(report, platforms, lookups),
    tags: buildTagsSheet(report),
    subscriptionLists: buildSubscriptionListsSheet(report, platforms),
    screens: buildScreensSheet(report, platforms),
  };

  return {
    platforms,
    dataSheets: [
      buildAnalyseScopeSheet(report, contents),
      contents.appVersions,
      contents.absentFromLatest,
      contents.mismatches,
      contents.customEvents,
      contents.attributes,
      contents.tags,
      contents.subscriptionLists,
      contents.screens,
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Value extraction (async)                                            */
/* ------------------------------------------------------------------ */

async function runPool(tasks, concurrency, worker, onProgress) {
  let index = 0;
  let done = 0;
  const total = tasks.length;
  const runners = Array.from({ length: Math.min(concurrency, total || 1) }, async () => {
    while (index < tasks.length) {
      const current = tasks[index];
      index += 1;
      await worker(current);
      done += 1;
      onProgress?.({ done, total });
    }
  });
  await Promise.all(runners);
}

async function paginateValues(fetchPage, baseArgs, { perKeyCap, limit, scopeId, remaining }) {
  const collected = [];
  let offset = 0;
  let capped = false;
  let total = 0;
  while (offset < perKeyCap && collected.length < remaining()) {
    let page;
    try {
      page = await fetchPage({ ...baseArgs, offset, limit, scopeId });
    } catch {
      break;
    }
    total = page.total ?? total;
    capped = capped || Boolean(page.capped);
    const values = page.values ?? [];
    for (const v of values) {
      if (collected.length >= remaining()) break;
      collected.push(v);
    }
    if (values.length < limit) break;
    offset += limit;
    if (offset >= total) break;
  }
  return { values: collected, total, capped };
}

/**
 * Collect value histograms for attributes and custom-event properties.
 * Fetchers are injected so this is testable without the browser API client.
 */
export async function collectValueExtracts({
  report,
  ndjsonFileName = null,
  scopeId = "baseline",
  fetchAttributeValues = null,
  fetchCustomPropertyValues = null,
  onProgress = null,
  perKeyCap = 200,
  concurrency = 5,
  maxValueRows = 20000,
  limit = 100,
} = {}) {
  const attributeValues = [];
  const customValues = [];

  const canFetch = Boolean(ndjsonFileName && fetchAttributeValues && fetchCustomPropertyValues);

  if (!canFetch) {
    // Fallback: whatever the report itself carries (custom event sample values).
    for (const section of [report.customEvents?.sdk?.top, report.customEvents?.api?.top]) {
      for (const ev of section ?? []) {
        for (const value of ev.sampleValues ?? []) {
          customValues.push({
            event: ev.name,
            source: ev.source ?? "",
            property: "value",
            value: truncateValue(value),
            count: null,
            deviceTypes: "",
          });
        }
      }
    }
    return { available: false, usedFallback: true, truncated: false, attributeValues, customValues };
  }

  const totalBudget = () => maxValueRows - attributeValues.length - customValues.length;

  const attrTasks = (report.attributes?.topKeys ?? [])
    .filter((k) => (k.trackedValueCount ?? 0) > 0)
    .map((k) => ({ kind: "attr", key: k.normalized ?? k.key, label: k.key }));

  const customTasks = [];
  for (const section of ["sdk", "api", "unknown"]) {
    for (const ev of report.customEvents?.[section]?.top ?? []) {
      for (const stat of ev.propertyValueStats ?? []) {
        if ((stat.trackedValueCount ?? 0) > 0) {
          customTasks.push({
            kind: "custom",
            event: ev.name,
            source: ev.source ?? section.toUpperCase(),
            property: stat.property,
          });
        }
      }
    }
  }

  const tasks = [...attrTasks, ...customTasks];
  let truncated = false;

  await runPool(
    tasks,
    concurrency,
    async (task) => {
      if (totalBudget() <= 0) {
        truncated = true;
        return;
      }
      if (task.kind === "attr") {
        const { values, capped } = await paginateValues(
          fetchAttributeValues,
          { name: ndjsonFileName, key: task.key },
          { perKeyCap, limit, scopeId, remaining: totalBudget },
        );
        for (const v of values) {
          attributeValues.push({
            key: task.label,
            value: truncateValue(v.value),
            count: v.count ?? 0,
            deviceTypes: (v.deviceTypes ?? []).map((d) => `${d.deviceType}: ${d.count}`).join(", "),
            capped: capped ? "100+" : "",
          });
        }
      } else {
        const { values, capped } = await paginateValues(
          fetchCustomPropertyValues,
          { name: ndjsonFileName, source: task.source, event: task.event, property: task.property },
          { perKeyCap, limit, scopeId, remaining: totalBudget },
        );
        for (const v of values) {
          customValues.push({
            event: task.event,
            source: task.source,
            property: task.property,
            value: truncateValue(v.value),
            count: v.count ?? 0,
            deviceTypes: (v.deviceTypes ?? []).map((d) => `${d.deviceType}: ${d.count}`).join(", "),
            capped: capped ? "100+" : "",
          });
        }
      }
      if (totalBudget() <= 0) truncated = true;
    },
    onProgress,
  );

  attributeValues.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  customValues.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

  return { available: true, usedFallback: false, truncated, attributeValues, customValues };
}

/* ------------------------------------------------------------------ */
/* Workbook generation (browser-only)                                  */
/* ------------------------------------------------------------------ */

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
 * Build the tagging-plan JSON payload (pure — no download) for the analysis skill.
 * Reuses the same workbook model as the .xlsx export, so rows carry per-item
 * source/version scope (`__versionScope`), obsolescence and value histograms.
 */
export function buildTaggingPlanJsonPayload(report, { extracts = null, profileName = null, scopeId = "baseline" } = {}) {
  const model = buildTaggingPlanWorkbookModel(report, { extracts });
  const meta = report?.meta ?? {};
  const profile = profileName ?? meta.profile ?? "audit";
  return {
    kind: "airship-rtds-tagging-plan",
    version: 1,
    generatedAt: new Date().toISOString(),
    meta: {
      profile,
      appVersion: meta.appVersion ?? null,
      reportGeneratedAt: meta.generatedAt ?? null,
      taggingPlanMode: Boolean(meta.taggingPlanMode),
      typesRequested: meta.typesRequested ?? meta.queryContext?.typesRequested ?? [],
      typesCoverage: meta.typesCoverage ?? null,
      window: {
        streamMode: meta.streamMode ?? null,
        windowHours: meta.windowHours ?? null,
        windowLabel: meta.windowLabel ?? null,
      },
      platforms: model.platforms,
      scopeId,
    },
    model,
    values: {
      available: Boolean(extracts?.available),
      truncated: Boolean(extracts?.truncated),
      attributeValues: extracts?.attributeValues ?? [],
      customValues: extracts?.customValues ?? [],
    },
  };
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
