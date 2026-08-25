/**
 * SUBSCRIPTION_LIST parsing and grouped report.
 *
 * The extractor is tolerant of several body forms. The real RTDS shape uses
 * `enrolled` / `canceled` arrays (confirmed against live GMF data):
 *   { enrolled: ["list_a"], scope: "APP" }            // opt-in
 *   { canceled: ["list_b"], scope: "APP" }            // opt-out
 *   { subscribe: ["list_a"], unsubscribe: ["list_b"], scope: "app" }
 *   { action: "subscribe", list_ids: ["a", "b"], scope: "app" }
 *   { action: "subscribe", list_id: "a" }
 *   { lists: [{ list_id: "a", action: "subscribe", scope: "app" }] }
 *   { subscription_lists: [{ id: "a", action: "unsubscribe" }] }
 */

import { enrichScreenRowPlatforms, inferEventSource, platformLabelForEventBreakdown } from "./analyzeInsights.js";
import { trackAppVersionCoverage } from "./appVersionCoverage.js";
import { kpiId as sampleKpiId } from "./eventSamples.js";
import { AUDIT_REPORT_TOP_LIST_LIMIT } from "./reportTopLimits.js";

/** Max distinct subscription lists retained in the accumulator. */
export const MAX_SUBSCRIPTION_LISTS = 2_000;

const SUBSCRIBE_ACTIONS = new Set([
  "subscribe",
  "subscribed",
  "opt_in",
  "opt-in",
  "optin",
  "add",
  "added",
  "enroll",
  "enrolled",
]);
const UNSUBSCRIBE_ACTIONS = new Set([
  "unsubscribe",
  "unsubscribed",
  "opt_out",
  "opt-out",
  "optout",
  "remove",
  "removed",
  "cancel",
  "canceled",
  "cancelled",
]);

function normalizeAction(raw) {
  const a = String(raw ?? "").trim().toLowerCase();
  if (SUBSCRIBE_ACTIONS.has(a)) return "subscribe";
  if (UNSUBSCRIBE_ACTIONS.has(a)) return "unsubscribe";
  return null;
}

function normalizeScope(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  return s || null;
}

function listIdOf(entry) {
  if (entry == null) return null;
  if (typeof entry === "string" || typeof entry === "number") {
    const id = String(entry).trim();
    return id || null;
  }
  if (typeof entry === "object") {
    const raw = entry.list_id ?? entry.listId ?? entry.id ?? entry.list ?? entry.name;
    const id = raw == null ? "" : String(raw).trim();
    return id || null;
  }
  return null;
}

/**
 * @returns {{ listId: string, action: "subscribe"|"unsubscribe"|"change", scope: string|null }[]}
 */
export function extractSubscriptionListChanges(body) {
  if (!body || typeof body !== "object") return [];
  const out = [];
  const topScope = normalizeScope(body.scope);

  const pushSimple = (value, action, scope) => {
    const listId = listIdOf(value);
    if (!listId) return;
    out.push({ listId, action, scope: scope ?? topScope ?? null });
  };

  // Form A: subscribe / unsubscribe arrays (or scalars). Includes the real RTDS
  // `enrolled` (opt-in) / `canceled` (opt-out) shape.
  for (const [field, action] of [
    ["enrolled", "subscribe"],
    ["canceled", "unsubscribe"],
    ["cancelled", "unsubscribe"],
    ["subscribe", "subscribe"],
    ["unsubscribe", "unsubscribe"],
  ]) {
    const raw = body[field];
    if (Array.isArray(raw)) {
      for (const item of raw) pushSimple(item, action, normalizeScope(item?.scope));
    } else if (raw != null) {
      pushSimple(raw, action, null);
    }
  }

  // Form B: explicit list arrays of objects.
  for (const field of ["lists", "subscription_lists", "subscriptionLists", "changes"]) {
    const raw = body[field];
    if (!Array.isArray(raw)) continue;
    for (const item of raw) {
      const listId = listIdOf(item);
      if (!listId) continue;
      const action = normalizeAction(item?.action ?? item?.operation ?? item?.state ?? body.action) ?? "change";
      out.push({ listId, action, scope: normalizeScope(item?.scope) ?? topScope ?? null });
    }
  }

  // Form C: top-level action + list_id(s).
  const topAction = normalizeAction(body.action ?? body.operation ?? body.state);
  if (topAction) {
    if (Array.isArray(body.list_ids ?? body.listIds)) {
      for (const item of body.list_ids ?? body.listIds) pushSimple(item, topAction, null);
    }
    if (body.list_id != null || body.listId != null || body.list != null) {
      pushSimple(body.list_id ?? body.listId ?? body.list, topAction, null);
    }
  }

  return out;
}

export function createSubscriptionListsAccumulator() {
  return { total: 0, listsCapped: false, byList: {} };
}

function getListBucket(acc, listId) {
  if (!acc.byList[listId]) {
    if (Object.keys(acc.byList).length >= MAX_SUBSCRIPTION_LISTS) {
      acc.listsCapped = true;
      return null;
    }
    acc.byList[listId] = {
      listId,
      subscribe: 0,
      unsubscribe: 0,
      change: 0,
      byDevice: {},
      byScope: {},
      sources: { SDK: 0, API: 0, UNKNOWN: 0 },
    };
  }
  return acc.byList[listId];
}

/**
 * Update the accumulator for a single SUBSCRIPTION_LIST event.
 */
export function processSubscriptionListEvent(acc, event, dt, body, samples) {
  const changes = extractSubscriptionListChanges(body);
  if (!changes.length) return;

  const source = inferEventSource("SUBSCRIPTION_LIST", body, event);
  const sourceKey = source === "SDK" || source === "API" ? source : "UNKNOWN";
  const appVer = event?.device?.attributes?.app_version;
  const processedIso = event?.processed ?? null;

  for (const change of changes) {
    const bucket = getListBucket(acc, change.listId);
    if (!bucket) continue;

    acc.total += 1;
    if (change.action === "subscribe") bucket.subscribe += 1;
    else if (change.action === "unsubscribe") bucket.unsubscribe += 1;
    else bucket.change += 1;

    bucket.byDevice[dt] = (bucket.byDevice[dt] ?? 0) + 1;
    if (change.scope) bucket.byScope[change.scope] = (bucket.byScope[change.scope] ?? 0) + 1;
    bucket.sources[sourceKey] += 1;
    trackAppVersionCoverage(bucket, dt, appVer, processedIso);

    samples?.add(
      sampleKpiId("subscription_list", change.action, change.listId, dt),
      `SUBSCRIPTION_LIST ${change.action}: ${change.listId} on ${dt}`,
      event,
      {
        note: `scope=${change.scope ?? "—"}, source=${sourceKey}`,
        deviceType: dt,
        illustrative: true,
      },
    );
  }
}

function dominantSource(sources) {
  const entries = Object.entries(sources ?? {}).filter(([, n]) => n > 0);
  if (!entries.length) return "UNKNOWN";
  if (entries.length === 1) return entries[0][0];
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

export function buildSubscriptionListsReport(acc, { expectedPlatforms = [] } = {}) {
  const lists = Object.values(acc?.byList ?? {});
  const total = acc?.total ?? 0;

  const scopeTotals = {};
  const byList = lists
    .map((bucket) => {
      const count = bucket.subscribe + bucket.unsubscribe + bucket.change;
      const byDeviceBreakdown = Object.entries(bucket.byDevice ?? {})
        .sort((a, b) => b[1] - a[1])
        .map(([deviceType, c]) => ({
          deviceType,
          count: c,
          pct: count ? Math.round((c / count) * 1000) / 10 : 0,
          sampleKpiId: sampleKpiId("subscription_list", "subscribe", bucket.listId, deviceType),
        }));

      for (const [scope, c] of Object.entries(bucket.byScope ?? {})) {
        scopeTotals[scope] = (scopeTotals[scope] ?? 0) + c;
      }

      const platformMeta = enrichScreenRowPlatforms({ byDevice: bucket.byDevice, count }, expectedPlatforms);
      const byScope = Object.entries(bucket.byScope ?? {})
        .sort((a, b) => b[1] - a[1])
        .map(([scope, c]) => ({ scope, count: c }));

      return {
        listId: bucket.listId,
        subscribe: bucket.subscribe,
        unsubscribe: bucket.unsubscribe,
        change: bucket.change,
        count,
        net: bucket.subscribe - bucket.unsubscribe,
        source: dominantSource(bucket.sources),
        sources: bucket.sources,
        byDevice: bucket.byDevice,
        byDeviceBreakdown,
        byScope,
        ...platformMeta,
        sampleKpiId: byDeviceBreakdown[0]?.sampleKpiId ?? null,
      };
    })
    .sort((a, b) => b.count - a.count);

  return {
    description:
      "Subscription list opt-ins / opt-outs from SUBSCRIPTION_LIST events, by list, platform and scope.",
    maxListsTracked: MAX_SUBSCRIPTION_LISTS,
    total,
    uniqueLists: lists.length,
    listsCapped: Boolean(acc?.listsCapped),
    byScope: Object.entries(scopeTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([scope, count]) => ({ scope, count })),
    byList: byList.slice(0, AUDIT_REPORT_TOP_LIST_LIMIT),
  };
}

export { platformLabelForEventBreakdown };
