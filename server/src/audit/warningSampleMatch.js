import {
  auditDeviceType,
  extractAttributeOpsDetailed,
  extractCustomPropertyKeys,
  extractScreenName,
  inferCustomEventSource,
  normalizeAttrKey,
} from "./analyzeInsights.js";
import { isAirshipAutoAttributeKey } from "./airshipAutoAttributes.js";
import { isAirshipAutoTag, tagGroupKey } from "./airshipAutoTags.js";
import { extractTagChanges } from "./audienceTags.js";
import {
  eventSampleDedupeKey,
  kpiId,
  MAX_EVENT_SAMPLE_BUCKETS,
  MAX_EVENT_SAMPLES_PER_DEVICE_TYPE,
  MAX_EVENT_SAMPLES_PER_KPI,
  normalizeSampleDeviceType,
  slimEventForSample,
} from "./eventSamples.js";
import { iterateNdjsonLines } from "./ndjsonLineIterator.js";
import { collectBackfillSampleKpiIds } from "./warningKpiIds.js";
import { canOpenSampleBucket } from "./sampleBucketPriority.js";

function normalizeCustomSourceKey(source) {
  return source === "SDK" || source === "API" ? source : "UNKNOWN";
}

function customEventName(body) {
  return body?.name || "(unnamed)";
}

function tagMatchesKpi(tag, kpiTagPart) {
  const normalized = String(tag ?? "").replace(/[^a-zA-Z0-9._-]/g, "_");
  return normalized === kpiTagPart || tag === kpiTagPart;
}

/**
 * Whether an RTDS event should be stored under this warning KPI id.
 */
export function eventMatchesKpiId(event, kpiId, auditDt) {
  if (!event || !kpiId) return false;
  const parts = String(kpiId).split(".");
  const type = String(event.type ?? "").toUpperCase();
  const body = event.body ?? {};
  const dt = auditDt ?? auditDeviceType(event, type);

  if (parts[0] === "custom") {
    if (type !== "CUSTOM") return false;
    if (parts[1] === "prop") {
      const sourceKey = parts[2];
      const name = parts[3];
      const deviceType = parts[4];
      const prop = parts.slice(5).join(".");
      if (normalizeCustomSourceKey(inferCustomEventSource(body, event)) !== sourceKey) return false;
      if (customEventName(body) !== name) return false;
      if (dt !== deviceType) return false;
      return extractCustomPropertyKeys(body).some(
        (p) => String(p).replace(/[^a-zA-Z0-9._-]/g, "_") === prop || p === prop,
      );
    }
    const sourceKey = parts[1];
    const name = parts[2];
    const deviceType = parts[3];
    if (normalizeCustomSourceKey(inferCustomEventSource(body, event)) !== sourceKey) return false;
    if (customEventName(body) !== name) return false;
    return dt === deviceType;
  }

  if (parts[0] === "attr") {
    if (type !== "ATTRIBUTE_OPERATION") return false;
    if (parts[1] === "key") {
      const normalized = parts[2];
      const deviceType = parts[3];
      return (
        dt === deviceType &&
        extractAttributeOpsDetailed(body).some((op) => normalizeAttrKey(op.key) === normalized)
      );
    }
    if (parts[1] === "case") {
      const normalized = parts[2];
      return extractAttributeOpsDetailed(body).some(
        (op) => normalizeAttrKey(op.key) === normalized && op.key !== normalized,
      );
    }
    if (parts[1] === "value") {
      const normalized = parts[2];
      const deviceType = parts[3];
      return (
        dt === deviceType &&
        extractAttributeOpsDetailed(body).some((op) => normalizeAttrKey(op.key) === normalized)
      );
    }
    return false;
  }

  if (parts[0] === "airship_attrs") {
    if (type !== "ATTRIBUTE_OPERATION") return false;
    if (parts[1] === "key") {
      const normalized = parts[2];
      const deviceType = parts[3];
      return (
        dt === deviceType &&
        extractAttributeOpsDetailed(body).some(
          (op) => isAirshipAutoAttributeKey(op.key) && normalizeAttrKey(op.key) === normalized,
        )
      );
    }
    if (parts[1] === "case") {
      const normalized = parts[2];
      return extractAttributeOpsDetailed(body).some(
        (op) => isAirshipAutoAttributeKey(op.key) && normalizeAttrKey(op.key) === normalized,
      );
    }
    if (parts[1] === "value") {
      const normalized = parts[2];
      const deviceType = parts[3];
      return (
        dt === deviceType &&
        extractAttributeOpsDetailed(body).some(
          (op) => isAirshipAutoAttributeKey(op.key) && normalizeAttrKey(op.key) === normalized,
        )
      );
    }
    return false;
  }

  if (parts[0] === "screen") {
    if (type !== "SCREEN_VIEWED") return false;
    const name = parts[1];
    const deviceType = parts[2];
    return extractScreenName(body) === name && dt === deviceType;
  }

  if (parts[0] === "open") {
    if (type !== "OPEN") return false;
    if (parts[1] === "triggering_push") return body.triggering_push != null;
    if (parts[1] === "last_delivered") return body.last_delivered != null;
    return false;
  }

  if (parts[0] === "messaging") {
    const reason = String(body.reason || body.status || body.error_code || body.error || "unknown").replace(
      /[^a-zA-Z0-9._-]/g,
      "_",
    );
    if (parts[1] === "send_rejected" && type === "SEND_REJECTED") {
      return parts[2] === reason;
    }
    if (parts[1] === "send_aborted" && type === "SEND_ABORTED") {
      return parts[2] === reason;
    }
    return false;
  }

  if (parts[0] === "contact") {
    if (type !== "CONTACT_CHANGE") return false;
    const changeType = String(body?.change_type ?? body?.changeType ?? "(unknown)")
      .trim()
      .toUpperCase();
    if (parts[1] === "change") return parts[2] === changeType;
    const deviceType = parts[1];
    const changePart = parts[2];
    return dt === deviceType && changePart === changeType;
  }

  if (parts[0] === "email_custom") {
    if (type !== "CUSTOM" || dt !== "EMAIL") return false;
    if (parts[1] === "prop") {
      const name = parts[2];
      const deviceType = parts[3];
      const prop = parts.slice(4).join(".");
      if (customEventName(body) !== name || dt !== deviceType) return false;
      return extractCustomPropertyKeys(body).some(
        (p) => String(p).replace(/[^a-zA-Z0-9._-]/g, "_") === prop || p === prop,
      );
    }
    const name = parts[1];
    const deviceType = parts[2];
    return customEventName(body) === name && dt === deviceType;
  }

  if (parts[0] === "sdk" || parts[0] === "app") {
    const deviceType = parts[1];
    const version = parts.slice(2).join(".");
    if (dt !== deviceType) return false;
    const attr = parts[0] === "sdk" ? "ua_sdk_version" : "app_version";
    return String(event.device?.attributes?.[attr] ?? "") === version;
  }

  if (parts[0] === "tags") {
    if (type !== "TAG_CHANGE") return false;
    const { added, removed } = extractTagChanges(body);
    if (parts[1] === "added") {
      const tag = parts.slice(2).join(".");
      return added.some((t) => tagMatchesKpi(t, tag));
    }
    if (parts[1] === "removed") {
      const tag = parts.slice(2).join(".");
      return removed.some((t) => tagMatchesKpi(t, tag));
    }
    return false;
  }

  if (parts[0] === "airship_tags") {
    if (type !== "TAG_CHANGE") return false;
    const { added, removed } = extractTagChanges(body);
    if (parts[1] === "added") {
      return added.some((t) => isAirshipAutoTag(t) && tagGroupKey(t) === parts[2]);
    }
    if (parts[1] === "removed") {
      return removed.some((t) => isAirshipAutoTag(t) && tagGroupKey(t) === parts[2]);
    }
    return false;
  }

  if (parts[0] === "by_device") {
    return dt === parts[1];
  }

  return false;
}

/**
 * Forward map: all warning KPI ids this event could illustrate (mirrors eventMatchesKpiId).
 */
export function deriveWarningKpiIdsFromEvent(event, auditDt) {
  if (!event || typeof event !== "object") return [];
  const type = String(event.type ?? "").toUpperCase();
  const body = event.body ?? {};
  const dt = auditDt ?? auditDeviceType(event, type);
  const ids = [];

  if (type === "CUSTOM") {
    const sourceKey = normalizeCustomSourceKey(inferCustomEventSource(body, event));
    const name = customEventName(body);
    ids.push(kpiId("custom", sourceKey, name, dt));
    for (const prop of extractCustomPropertyKeys(body)) {
      ids.push(kpiId("custom", "prop", sourceKey, name, dt, prop));
    }
    if (dt === "EMAIL") {
      ids.push(kpiId("email_custom", name, dt));
      for (const prop of extractCustomPropertyKeys(body)) {
        ids.push(kpiId("email_custom", "prop", name, dt, prop));
      }
    }
  }

  if (type === "ATTRIBUTE_OPERATION") {
    for (const op of extractAttributeOpsDetailed(body)) {
      const normalized = normalizeAttrKey(op.key);
      ids.push(kpiId("attr", "key", normalized, dt));
      ids.push(kpiId("attr", "value", normalized, dt));
      if (op.key !== normalized) {
        ids.push(kpiId("attr", "case", normalized));
      }
      if (isAirshipAutoAttributeKey(op.key)) {
        ids.push(kpiId("airship_attrs", "key", normalized, dt));
        ids.push(kpiId("airship_attrs", "value", normalized, dt));
        ids.push(kpiId("airship_attrs", "case", normalized));
      }
    }
  }

  if (type === "SCREEN_VIEWED") {
    ids.push(kpiId("screen", extractScreenName(body), dt));
  }

  if (type === "OPEN") {
    if (body.triggering_push != null) ids.push(kpiId("open", "triggering_push"));
    if (body.last_delivered != null) ids.push(kpiId("open", "last_delivered"));
  }

  if (type === "SEND_REJECTED") {
    const reason = String(body.reason || body.status || body.error_code || body.error || "unknown").replace(
      /[^a-zA-Z0-9._-]/g,
      "_",
    );
    ids.push(kpiId("messaging", "send_rejected", reason));
  }

  if (type === "SEND_ABORTED") {
    const reason = String(body.reason || body.status || body.error_code || body.error || "unknown").replace(
      /[^a-zA-Z0-9._-]/g,
      "_",
    );
    ids.push(kpiId("messaging", "send_aborted", reason));
  }

  if (type === "CONTACT_CHANGE") {
    const changeType = String(body?.change_type ?? body?.changeType ?? "(unknown)")
      .trim()
      .toUpperCase();
    ids.push(kpiId("contact", "change", changeType));
    ids.push(kpiId("contact", dt, changeType));
  }

  const sdkVersion = event.device?.attributes?.ua_sdk_version;
  if (sdkVersion != null && String(sdkVersion) !== "") {
    ids.push(kpiId("sdk", dt, sdkVersion));
  }
  const appVersion = event.device?.attributes?.app_version;
  if (appVersion != null && String(appVersion) !== "") {
    ids.push(kpiId("app", dt, appVersion));
  }

  if (type === "TAG_CHANGE") {
    const { added, removed } = extractTagChanges(body);
    for (const tag of added) {
      ids.push(kpiId("tags", "added", tag));
      if (isAirshipAutoTag(tag)) {
        ids.push(kpiId("airship_tags", "added", tagGroupKey(tag)));
      }
    }
    for (const tag of removed) {
      ids.push(kpiId("tags", "removed", tag));
      if (isAirshipAutoTag(tag)) {
        ids.push(kpiId("airship_tags", "removed", tagGroupKey(tag)));
      }
    }
  }

  ids.push(kpiId("by_device", dt));
  return ids;
}

function bucketMapFromSamples(existingSamples) {
  const map = new Map();
  for (const group of existingSamples ?? []) {
    map.set(group.kpiId, {
      kpiId: group.kpiId,
      title: group.title ?? group.kpiId,
      description: group.description ?? null,
      events: [...(group.events ?? [])],
    });
  }
  return map;
}

function ensureBucket(map, kpiIdKey) {
  if (!map.has(kpiIdKey)) {
    if (!canOpenSampleBucket(map, kpiIdKey, MAX_EVENT_SAMPLE_BUCKETS)) return null;
    map.set(kpiIdKey, { kpiId: kpiIdKey, title: kpiIdKey, description: null, events: [] });
  }
  return map.get(kpiIdKey);
}

function createWarningSampleDedupeState() {
  /** @type {Map<string, Set<string>>} */
  const seenByKpiDevice = new Map();
  /** @type {Map<string, number>} */
  const countByKpiDevice = new Map();

  const canAddForKpiDevice = (kpiIdKey, event, deviceType) => {
    const key = eventSampleDedupeKey(event);
    if (!key) return false;

    const bucketKey = `${kpiIdKey}|${deviceType}`;
    let seen = seenByKpiDevice.get(bucketKey);
    if (!seen) {
      seen = new Set();
      seenByKpiDevice.set(bucketKey, seen);
    }
    if (seen.has(key)) return false;

    const used = countByKpiDevice.get(bucketKey) ?? 0;
    if (used >= MAX_EVENT_SAMPLES_PER_DEVICE_TYPE) return false;

    countByKpiDevice.set(bucketKey, used + 1);
    seen.add(key);
    return true;
  };

  return { canAddForKpiDevice };
}

function recordWarningSampleForKpiIds(buckets, dedupe, event, auditDt, kpiIdKeys, { verifyMatch = true } = {}) {
  const type = String(event.type ?? "").toUpperCase();
  const deviceType = normalizeSampleDeviceType(auditDt ?? auditDeviceType(event, type), event);

  for (const kpiIdKey of kpiIdKeys) {
    const bucket = ensureBucket(buckets, kpiIdKey);
    if (!bucket) continue;
    if (bucket.events.length >= MAX_EVENT_SAMPLES_PER_KPI) continue;
    if (verifyMatch && !eventMatchesKpiId(event, kpiIdKey, auditDt)) continue;
    if (!dedupe.canAddForKpiDevice(kpiIdKey, event, deviceType)) continue;
    bucket.events.push(slimEventForSample(event));
    bucket.description = bucket.description ?? `Illustrates warning (${kpiIdKey})`;
  }
}

function sortSampleBuckets(buckets) {
  return [...buckets.values()]
    .filter((b) => b.events.length > 0)
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** True when warning-linked KPI ids still need event samples after the analyze pass. */
export function hasWarningSampleGaps(report, eventSamples = []) {
  const kpiIds = collectBackfillSampleKpiIds(report);
  if (!kpiIds.length) return false;
  const buckets = bucketMapFromSamples(eventSamples);
  return kpiIds.some((id) => (buckets.get(id)?.events.length ?? 0) < MAX_EVENT_SAMPLES_PER_KPI);
}

const BACKFILL_PROGRESS_INTERVAL = 5_000;
const BACKFILL_PROGRESS_MS = 400;

/**
 * Second pass over NDJSON when the analyze pass did not collect enough warning samples.
 * Yields { linesProcessed } for progress UI; return value is the sample bucket array.
 */
export async function* backfillWarningEventSamplesWithProgress(
  filePath,
  report,
  { existingSamples = [], totalLines = null } = {},
) {
  const kpiIds = collectBackfillSampleKpiIds(report);
  if (!kpiIds.length || !filePath) {
    return existingSamples;
  }

  const buckets = bucketMapFromSamples(existingSamples);
  const needed = kpiIds.filter((id) => (buckets.get(id)?.events.length ?? 0) < MAX_EVENT_SAMPLES_PER_KPI);
  if (!needed.length) {
    return sortSampleBuckets(buckets);
  }

  const dedupe = createWarningSampleDedupeState();
  let linesProcessed = 0;
  let lastProgressLines = 0;
  let lastProgressMs = Date.now();

  yield { linesProcessed: 0, totalLines };

  for await (const trimmed of iterateNdjsonLines(filePath)) {
    linesProcessed += 1;
    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }

    const type = String(event.type ?? "").toUpperCase();
    const auditDt = auditDeviceType(event, type);
    recordWarningSampleForKpiIds(buckets, dedupe, event, auditDt, needed);

    const now = Date.now();
    if (
      linesProcessed - lastProgressLines >= BACKFILL_PROGRESS_INTERVAL ||
      now - lastProgressMs >= BACKFILL_PROGRESS_MS
    ) {
      lastProgressLines = linesProcessed;
      lastProgressMs = now;
      yield { linesProcessed, totalLines };
    }

    if (needed.every((id) => (buckets.get(id)?.events.length ?? 0) >= MAX_EVENT_SAMPLES_PER_KPI)) {
      break;
    }
  }

  return sortSampleBuckets(buckets);
}
