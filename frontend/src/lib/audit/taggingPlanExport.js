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
    { key: "obsFlag", label: "Potentially obsolete", type: "text", width: 22 },
  ];
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

function buildAnalyseScopeSheet(report) {
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

  return {
    name: ANALYSE_SCOPE_SHEET,
    infoBlock: { title: "Analysis scope", rows: buildScopeInfoRows(report) },
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
    ...platCols,
    { key: "eventValues", label: "Event value samples", type: "text", width: 40, wrap: true },
    { key: "properties", label: "Properties", type: "text", width: 40, wrap: true },
    { key: "propSamples", label: "Property sample values", type: "text", width: 70, wrap: true },
    { key: "present", label: "Present platforms", type: "text", width: 22 },
    { key: "missing", label: "Missing platforms", type: "text", width: 22 },
    { key: "mismatch", label: "Platform mismatch", type: "text", width: 16 },
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
  return { name: "Custom Events", columns, rows };
}

function buildAttributesSheet(report, platforms, lookups = {}) {
  const columns = [
    { key: "key", label: "Key", type: "text", width: 30 },
    { key: "normalized", label: "Normalized", type: "text", width: 30 },
    { key: "total", label: "Total ops", type: "int", width: 12 },
    { key: "actions", label: "Actions", type: "text", width: 22 },
    { key: "sources", label: "Sources", type: "text", width: 22 },
    ...platformColumnDefs(platforms),
    { key: "distinctValues", label: "Distinct values", type: "int", width: 16 },
    { key: "capped", label: "Values capped", type: "text", width: 16 },
    { key: "sampleValues", label: "Sample values", type: "text", width: 60, wrap: true },
    { key: "present", label: "Present platforms", type: "text", width: 22 },
    { key: "missing", label: "Missing platforms", type: "text", width: 22 },
    { key: "mismatch", label: "Platform mismatch", type: "text", width: 16 },
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
  return { name: "Tags", columns, rows };
}

function buildSubscriptionListsSheet(report, platforms) {
  const columns = [
    { key: "listId", label: "List ID", type: "text", width: 34 },
    { key: "subscribe", label: "Subscribe", type: "int", width: 12 },
    { key: "unsubscribe", label: "Unsubscribe", type: "int", width: 12 },
    { key: "net", label: "Net", type: "int", width: 12 },
    ...platformColumnDefs(platforms),
    { key: "scopes", label: "Scopes", type: "text", width: 22 },
    { key: "source", label: "Source", type: "text", width: 14 },
    { key: "present", label: "Present platforms", type: "text", width: 22 },
    { key: "missing", label: "Missing platforms", type: "text", width: 22 },
    { key: "mismatch", label: "Platform mismatch", type: "text", width: 16 },
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
    ...platformColumnDefs(platforms),
    { key: "present", label: "Present platforms", type: "text", width: 22 },
    { key: "missing", label: "Missing platforms", type: "text", width: 22 },
    { key: "mismatch", label: "Platform mismatch", type: "text", width: 16 },
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
      note: "No custom events, attributes, tags, or screens appear absent from the latest app version for this capture window. Reliability improves with longer captures spanning multiple app versions.",
      columns,
      rows: [],
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
  };
}

function buildAppOpensByVersionSheet(report) {
  const byPlatform = report.openEvents?.byAppVersion ?? [];
  const columns = [
    { key: "os", label: "OS", type: "text", width: 12 },
    { key: "appVersion", label: "App version", type: "text", width: 18 },
    { key: "sdkVersion", label: "SDK version", type: "text", width: 18 },
    { key: "openCount", label: "OPEN count", type: "int", width: 14 },
    { key: "pctOfOs", label: "% of OS OPENs", type: "pct", width: 16 },
    { key: "pctOfAppVersion", label: "% of app version OPENs", type: "pct", width: 22 },
  ];

  const rows = [];
  for (const plat of byPlatform) {
    const os = canonicalPlatform(plat.deviceType);
    const osOpenTotal = plat.deviceEventTotal ?? 0;
    for (const ver of plat.versions ?? []) {
      const appOpenTotal = ver.count ?? 0;
      const sdkRows = ver.sdkVersions?.length
        ? ver.sdkVersions
        : [{ version: ver.sdkLabel ?? null, count: appOpenTotal }];
      for (const sdk of sdkRows) {
        const openCount = sdk.count ?? 0;
        if (openCount <= 0) continue;
        rows.push({
          os,
          appVersion: ver.version,
          sdkVersion: sdk.version ?? "—",
          openCount,
          pctOfOs: osOpenTotal ? openCount / osOpenTotal : 0,
          pctOfAppVersion: appOpenTotal ? openCount / appOpenTotal : 0,
        });
      }
    }
  }
  rows.sort((a, b) => (b.openCount ?? 0) - (a.openCount ?? 0));

  const openTotal = report.openEvents?.total ?? 0;
  const note =
    rows.length > 0
      ? `OPEN events with app_version in the capture window (total OPEN: ${openTotal.toLocaleString("en-US")}). SDK version is ua_sdk_version on the same device event.`
      : openTotal > 0
        ? "OPEN events were seen but none carried app_version on the device payload."
        : "No OPEN events in this capture window.";

  return { name: "App Opens by Version", note, columns, rows };
}

/**
 * Build the workbook sheet model. Pass `extracts` to populate inline sample values.
 */
export function buildTaggingPlanWorkbookModel(report, { extracts = null } = {}) {
  const platforms = derivePlatformColumns(report);
  const lookups = buildValueLookups(extracts);
  return {
    platforms,
    dataSheets: [
      buildAnalyseScopeSheet(report),
      buildAppOpensByVersionSheet(report),
      buildAbsentFromLatestSheet(report),
      buildMismatchSheet(report),
      buildCustomEventsSheet(report, platforms, lookups),
      buildAttributesSheet(report, platforms, lookups),
      buildTagsSheet(report),
      buildSubscriptionListsSheet(report, platforms),
      buildScreensSheet(report, platforms),
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

const BANNER_FILL = "FF0B1B33"; // deep navy banner
const HEADER_FILL = "FF12263A"; // Airship navy
const HEADER_FONT = "FFFFFFFF";
const OBSOLETE_FILL = "FFFFF1C2"; // amber
const MISMATCH_FILL = "FFFFE0E0"; // light red
const ZEBRA_FILL = "FFF4F6F9"; // very light gray
const SECTION_FILL = "FFE4E9F2"; // light blue-gray band
const BORDER_ARGB = "FFD9DEE8"; // subtle cell border
const NOTE_FONT = "FF8A6D3B"; // muted amber for notes

function solidFill(argb) {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function applyCellBorder(cell) {
  cell.border = {
    top: { style: "thin", color: { argb: BORDER_ARGB } },
    left: { style: "thin", color: { argb: BORDER_ARGB } },
    bottom: { style: "thin", color: { argb: BORDER_ARGB } },
    right: { style: "thin", color: { argb: BORDER_ARGB } },
  };
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
 * Render an optional key/value "scope" block (title banner + label/value rows)
 * above the table. Returns the number of rows consumed so the caller can place
 * the table header beneath it.
 */
function renderInfoBlock(ws, colCount, infoBlock, startRow) {
  const infoRows = infoBlock?.rows ?? [];
  let cursor = startRow;

  cursor += 1;
  const bannerRow = ws.getRow(cursor);
  bannerRow.height = 24;
  ws.mergeCells(cursor, 1, cursor, colCount);
  const bannerCell = bannerRow.getCell(1);
  bannerCell.value = infoBlock.title ?? "Analysis scope";
  bannerCell.fill = solidFill(BANNER_FILL);
  bannerCell.font = { bold: true, size: 13, color: { argb: HEADER_FONT } };
  bannerCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  for (const info of infoRows) {
    cursor += 1;
    const row = ws.getRow(cursor);
    row.height = 18;

    const labelCell = row.getCell(1);
    labelCell.value = info.label;
    labelCell.fill = solidFill(SECTION_FILL);
    labelCell.font = { bold: true, color: { argb: HEADER_FILL } };
    labelCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

    if (colCount > 1) ws.mergeCells(cursor, 2, cursor, colCount);
    const valueCell = row.getCell(2);
    valueCell.value = info.value;
    if (typeof info.value === "number") valueCell.numFmt = "#,##0";
    valueCell.fill = solidFill(ZEBRA_FILL);
    valueCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  }

  // Blank spacer row separates the block from the table below.
  cursor += 1;
  return cursor - startRow;
}

function styleHeaderRow(row, colCount) {
  for (let i = 1; i <= colCount; i += 1) {
    const cell = row.getCell(i);
    cell.fill = solidFill(HEADER_FILL);
    cell.font = { bold: true, color: { argb: HEADER_FONT } };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    applyCellBorder(cell);
  }
}

function addDataSheet(workbook, used, sheetModel) {
  const { columns, rows, note, infoBlock } = sheetModel;
  const colCount = columns.length;
  const ws = workbook.addWorksheet(sanitizeSheetName(sheetModel.name, used));

  ws.columns = columns.map((c) => ({ header: c.label, key: c.key, width: c.width ?? 16 }));

  // Banner title, optional scope block, then optional note sit above the header.
  const infoLines = infoBlock ? (infoBlock.rows?.length ?? 0) + 2 : 0; // banner + rows + spacer
  const preRows = 1 + infoLines + (note ? 1 : 0);
  ws.spliceRows(1, 0, ...Array.from({ length: preRows }, () => []));
  const headerRowNum = preRows + 1;

  const titleRow = ws.getRow(1);
  titleRow.height = 26;
  ws.mergeCells(1, 1, 1, colCount);
  const titleCell = titleRow.getCell(1);
  titleCell.value = sheetModel.title ?? sheetModel.name;
  titleCell.fill = solidFill(BANNER_FILL);
  titleCell.font = { bold: true, size: 14, color: { argb: HEADER_FONT } };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  let cursor = 1;
  if (infoBlock) {
    cursor += renderInfoBlock(ws, colCount, infoBlock, cursor);
  }

  if (note) {
    cursor += 1;
    const noteRow = ws.getRow(cursor);
    noteRow.height = 30;
    ws.mergeCells(cursor, 1, cursor, colCount);
    const noteCell = noteRow.getCell(1);
    noteCell.value = note;
    noteCell.font = { italic: true, color: { argb: NOTE_FONT } };
    noteCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
  }

  const headerRow = ws.getRow(headerRowNum);
  headerRow.height = 26;
  styleHeaderRow(headerRow, colCount);

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
      sc.fill = solidFill(SECTION_FILL);
      sc.font = { bold: true, color: { argb: HEADER_FILL } };
      sc.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      sectionRow.height = 20;
      zebra = 0;
      continue;
    }

    const added = ws.addRow(row);
    const isTotal = Boolean(row.__total);
    const isObsolete = Boolean(row.__obsolete);
    const isMismatch = Boolean(row.__mismatch);
    const rowFill = isObsolete
      ? OBSOLETE_FILL
      : isMismatch
        ? MISMATCH_FILL
        : isTotal
          ? SECTION_FILL
          : zebra % 2 === 1
            ? ZEBRA_FILL
            : null;

    for (let i = 0; i < colCount; i += 1) {
      const c = columns[i];
      const cell = added.getCell(i + 1);
      const fmt = numFmtForType(c.type);
      if (fmt) cell.numFmt = fmt;
      cell.alignment = c.wrap ? { wrapText: true, vertical: "top" } : { vertical: "top" };
      if (c.type === "text" && (cell.value == null || cell.value === "")) cell.value = "—";
      applyCellBorder(cell);
      if (rowFill) cell.fill = solidFill(rowFill);
      if (isTotal) cell.font = { bold: true };
    }

    if (!isTotal && !isObsolete && !isMismatch) zebra += 1;
  }

  ws.views = [{ state: "frozen", xSplit: 1, ySplit: headerRowNum }];

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
  return addDataSheet(workbook, used, { name, columns, rows, note });
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

  addDataSheet(workbook, used, byName[ANALYSE_SCOPE_SHEET]);
  addDataSheet(workbook, used, byName["App Opens by Version"]);
  addDataSheet(workbook, used, byName["Absent from latest version"]);
  addDataSheet(workbook, used, byName["Custom Events"]);

  const customValueNote = extracts.available
    ? extracts.truncated
      ? "Extract capped (total value row count limited)."
      : null
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
      { key: "deviceTypes", label: "Device types", type: "text", width: 30 },
      { key: "capped", label: "Capped", type: "text", width: 10 },
    ],
    extracts.customValues,
    customValueNote,
  );

  addDataSheet(workbook, used, byName["Attributes"]);
  addValuesSheet(
    workbook,
    used,
    "Attribute Values",
    [
      { key: "key", label: "Key", type: "text", width: 30 },
      { key: "value", label: "Value", type: "text", width: 50, wrap: true },
      { key: "count", label: "Count", type: "int", width: 12 },
      { key: "deviceTypes", label: "Device types", type: "text", width: 30 },
      { key: "capped", label: "Capped", type: "text", width: 10 },
    ],
    extracts.attributeValues,
    extracts.available ? null : "Raw file not kept: no detailed attribute values available.",
  );

  addDataSheet(workbook, used, byName["Tags"]);
  addDataSheet(workbook, used, byName["Subscription Lists"]);
  addDataSheet(workbook, used, byName["Screens"]);

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
