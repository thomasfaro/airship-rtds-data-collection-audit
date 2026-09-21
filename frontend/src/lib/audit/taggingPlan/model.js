/**
 * The tagging plan as data: sheets, columns and rows, derived from an audit report.
 *
 * Pure, so the JSON deliverable and the workbook are the same model rendered twice,
 * and so it can be tested under `node --test` without exceljs or a DOM.
 */

import { formatDurationDaysHours } from "../../formatTimeSpan.js";
import { buildProcessedRange } from "../../processedHours.js";
import { filterMismatchWarnings } from "../auditMismatchWarnings.js";
import {
  groupAuditWarnings,
  flattenGroupedAuditWarnings,
  MISMATCH_LABELS,
  WARNING_CATEGORY_LABELS,
} from "../auditWarningGroups.js";
import { shareColumn, withShares } from "../taggingPlanStyle.js";

export const ANALYSE_SCOPE_SHEET = "Analyse scope";

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
