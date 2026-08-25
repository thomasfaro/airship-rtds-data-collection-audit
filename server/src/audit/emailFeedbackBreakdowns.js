import { formatSparkpostBounceClassLabel, getSparkpostBounceClassDetail } from "./sparkpostBounceClasses.js";
import { getUnsubscribeEventTypeDetail } from "./emailUnsubscribeEventTypes.js";

const DIMENSION_LIMIT = 24;

export const EMAIL_FEEDBACK_DIMENSION_META = {
  delivery: [
    { id: "transactional", title: "By transactional flag" },
    { id: "sender", title: "By sender" },
  ],
  delay: [
    { id: "transactional", title: "By transactional flag" },
    { id: "sender", title: "By sender" },
    { id: "emailDomain", title: "By recipient email domain" },
  ],
  initial_open: [
    { id: "isPrefetched", title: "By prefetch flag (is_prefetched)" },
    { id: "prefetchedDetail", title: "Prefetch detail — OS family · mobile" },
    { id: "mobileOsFamily", title: "Mobile opens — OS family" },
    { id: "mobileDeviceBrand", title: "Mobile opens — device brand" },
  ],
  bounce: [{ id: "bounceClass", title: "By bounce class (SparkPost)" }],
  unsubscribe: [{ id: "unsubscribeEventType", title: "By unsubscribe event type" }],
};

function inc(map, key, amount = 1) {
  if (key == null || key === "") return;
  map[key] = (map[key] ?? 0) + amount;
}

function ensureBreakdownMap(bucket, dimId) {
  if (!bucket.breakdowns) bucket.breakdowns = {};
  if (!bucket.breakdowns[dimId]) bucket.breakdowns[dimId] = {};
  return bucket.breakdowns[dimId];
}

function trackDim(bucket, dimId, rawKey) {
  const key = rawKey == null || rawKey === "" ? "(missing)" : String(rawKey);
  inc(ensureBreakdownMap(bucket, dimId), key);
}

function normalizeBool(value) {
  if (value === true || value === "true" || value === 1 || value === "1") return "true";
  if (value === false || value === "false" || value === 0 || value === "0") return "false";
  if (value == null || value === "") return "(missing)";
  return String(value);
}

function normalizeTransactional(value) {
  if (value === true || value === "true" || value === 1 || value === "1") return "transactional";
  if (value === false || value === "false" || value === 0 || value === "0") return "commercial";
  if (value == null || value === "") return "(missing)";
  const lower = String(value).trim().toLowerCase();
  if (lower === "transactional" || lower === "commercial") return lower;
  return String(value).slice(0, 80);
}

function normalizeString(value) {
  if (value == null || value === "") return "(missing)";
  return String(value).slice(0, 120);
}

function normalizeBounceClass(value) {
  if (value == null || value === "") return "(missing)";
  const code = Number.parseInt(String(value), 10);
  return Number.isFinite(code) ? String(code) : String(value).slice(0, 40);
}

/** Extract domain from properties.email (recipient address). */
export function parseEmailDomain(email) {
  const raw = String(email ?? "").trim().toLowerCase();
  if (!raw) return "(missing)";
  const at = raw.lastIndexOf("@");
  if (at <= 0 || at === raw.length - 1) return "(invalid)";
  return raw.slice(at + 1);
}

function dimensionLabel(dimId, key) {
  if (dimId === "bounceClass") return formatSparkpostBounceClassLabel(key);
  return key;
}

function dimensionDetail(dimId, key) {
  if (dimId === "bounceClass") return getSparkpostBounceClassDetail(key);
  if (dimId === "unsubscribeEventType") return getUnsubscribeEventTypeDetail(key);
  return null;
}

function mapToRows(map, total, dimId) {
  return Object.entries(map ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, DIMENSION_LIMIT)
    .map(([key, count]) => ({
      key,
      label: dimensionLabel(dimId, key),
      detail: dimensionDetail(dimId, key) ?? undefined,
      count,
      pct: total ? Math.round((count / total) * 1000) / 10 : 0,
    }));
}

/**
 * Track per-event-type property breakdowns during audit scan.
 */
export function trackEmailFeedbackBreakdowns(bucket, eventName, body) {
  const props = body?.properties ?? {};
  const name = String(eventName ?? "").toLowerCase();

  if (name === "delivery") {
    trackDim(bucket, "transactional", normalizeTransactional(props.transactional));
    trackDim(bucket, "sender", normalizeString(props.sender));
    return;
  }

  if (name === "delay") {
    trackDim(bucket, "transactional", normalizeTransactional(props.transactional));
    trackDim(bucket, "sender", normalizeString(props.sender));
    trackDim(bucket, "emailDomain", parseEmailDomain(props.email));
    return;
  }

  if (name === "initial_open") {
    const prefetched = normalizeBool(props.is_prefetched);
    trackDim(bucket, "isPrefetched", prefetched);

    if (prefetched === "true") {
      const os = normalizeString(props.os_family);
      const mobile = normalizeBool(props.is_mobile);
      trackDim(bucket, "prefetchedDetail", `${os} · mobile=${mobile}`);
    }

    if (normalizeBool(props.is_mobile) === "true") {
      trackDim(bucket, "mobileOsFamily", normalizeString(props.os_family));
      trackDim(bucket, "mobileDeviceBrand", normalizeString(props.device_brand));
    }
    return;
  }

  if (name === "bounce") {
    trackDim(bucket, "bounceClass", normalizeBounceClass(props.bounce_class));
    return;
  }

  if (name === "unsubscribe") {
    trackDim(bucket, "unsubscribeEventType", normalizeString(props.unsubscribe_event_type));
  }
}

export function buildEmailFeedbackDimensions(eventName, bucketData, eventCount) {
  const specs = EMAIL_FEEDBACK_DIMENSION_META[eventName] ?? [];
  const raw = bucketData?.breakdowns ?? {};
  const dimensions = [];

  for (const spec of specs) {
    const rows = mapToRows(raw[spec.id], eventCount, spec.id);
    if (!rows.length) continue;
    dimensions.push({
      id: spec.id,
      title: spec.title,
      total: eventCount,
      rows,
    });
  }

  return dimensions.length ? dimensions : undefined;
}
