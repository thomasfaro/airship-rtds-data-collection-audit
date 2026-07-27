/** Collect RTDS event payloads for the audit report (deduped, capped per KPI + device_type). */

import { canOpenSampleBucket } from "./sampleBucketPriority.js";

export const MAX_EVENT_SAMPLES_PER_KPI = 10;
export const MAX_EVENT_SAMPLES_PER_DEVICE_TYPE = 10;
/** Hard cap on distinct KPI buckets — prod captures with high-cardinality tags can exceed V8 JSON limits. */
export const MAX_EVENT_SAMPLE_BUCKETS = 500;
/** @deprecated Reserved label; quota is per KPI + device_type, not a separate pool. */
export const MAX_ILLUSTRATIVE_SAMPLES_PER_DEVICE_TYPE = 10;

const MAX_SAMPLE_BODY_STRING = 2_000;

export function slimEventForSample(event) {
  if (!event || typeof event !== "object") return event;

  const device = event.device;
  const attrs = device?.attributes;
  const slimDevice = device
    ? {
        device_type: device.device_type,
        channel: device.channel ?? device.ios_channel ?? device.android_channel,
        named_user_id: device.named_user_id,
        attributes: attrs
          ? {
              app_version: attrs.app_version,
              ua_sdk_version: attrs.ua_sdk_version,
            }
          : undefined,
      }
    : undefined;

  let slimBody = event.body;
  if (slimBody && typeof slimBody === "object" && !Array.isArray(slimBody)) {
    slimBody = {};
    for (const [key, value] of Object.entries(event.body)) {
      if (typeof value === "string" && value.length > MAX_SAMPLE_BODY_STRING) {
        slimBody[key] = `${value.slice(0, MAX_SAMPLE_BODY_STRING)}…`;
      } else {
        slimBody[key] = value;
      }
    }
  }

  const slim = {
    type: event.type,
    occurred: event.occurred,
    processed: event.processed,
    id: event.id ?? event.event_id ?? event.uuid,
    device: slimDevice,
    user: event.user?.named_user_id ? { named_user_id: event.user.named_user_id } : undefined,
    body: slimBody,
  };
  if (event._auditSampleNote) slim._auditSampleNote = event._auditSampleNote;
  return slim;
}

export function normalizeSampleDeviceType(deviceType, event) {
  const raw = deviceType ?? event?.device?.device_type ?? "UNKNOWN";
  return String(raw).trim().toUpperCase() || "UNKNOWN";
}

export function eventSampleDedupeKey(event) {
  if (!event || typeof event !== "object") return "";
  const id = event.id ?? event.event_id ?? event.uuid;
  if (id != null && String(id) !== "") return `id:${id}`;
  return [
    event.type,
    event.occurred,
    event.processed,
    event.device?.channel ?? event.device?.ios_channel ?? event.device?.android_channel,
    event.user?.named_user_id ?? event.device?.named_user_id,
    event.body?.name,
  ]
    .map((p) => (p == null ? "" : String(p)))
    .join("|");
}

function kpiDeviceKey(kpiId, deviceType) {
  return `${kpiId}|${deviceType}`;
}

export function createEventSampleCollector() {
  /** @type {Map<string, { kpiId: string, title: string, description?: string, events: object[] }>} */
  const buckets = new Map();
  /** @type {Map<string, Set<string>>} */
  const seenKeysByKpiDevice = new Map();
  /** @type {Map<string, number>} */
  const countByKpiDevice = new Map();
  let bucketsCapped = false;

  function reserveKpiDeviceSlot(kpiId, deviceType, event) {
    const dt = normalizeSampleDeviceType(deviceType, event);
    const key = eventSampleDedupeKey(event);
    if (!key) return false;

    const bucketKey = kpiDeviceKey(kpiId, dt);
    let seen = seenKeysByKpiDevice.get(bucketKey);
    if (!seen) {
      seen = new Set();
      seenKeysByKpiDevice.set(bucketKey, seen);
    }
    if (seen.has(key)) return false;

    const used = countByKpiDevice.get(bucketKey) ?? 0;
    if (used >= MAX_EVENT_SAMPLES_PER_DEVICE_TYPE) return false;
    countByKpiDevice.set(bucketKey, used + 1);
    seen.add(key);
    return true;
  }

  function add(
    kpiId,
    title,
    event,
    {
      description,
      note,
      deviceType,
      /** @deprecated Ignored — each KPI keeps its own per-device quota. */
      countTowardDeviceQuota = true,
      /** @deprecated Ignored — same quota model as other KPI buckets. */
      illustrative = false,
    } = {},
  ) {
    if (!event || !kpiId) return;
    void countTowardDeviceQuota;
    void illustrative;

    if (!reserveKpiDeviceSlot(kpiId, deviceType, event)) return;

    let bucket = buckets.get(kpiId);
    if (!bucket) {
      if (!canOpenSampleBucket(buckets, kpiId, MAX_EVENT_SAMPLE_BUCKETS)) {
        bucketsCapped = true;
        return;
      }
      bucket = { kpiId, title, description: description ?? null, events: [] };
      buckets.set(kpiId, bucket);
    }
    if (bucket.events.length >= MAX_EVENT_SAMPLES_PER_KPI) return;
    const raw = note ? { ...event, _auditSampleNote: note } : event;
    bucket.events.push(slimEventForSample(raw));
  }

  function count(kpiId) {
    return buckets.get(kpiId)?.events.length ?? 0;
  }

  function toArray() {
    return [...buckets.values()]
      .filter((b) => b.events.length > 0)
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  function stats() {
    return {
      bucketCount: buckets.size,
      bucketsCapped,
      maxBuckets: MAX_EVENT_SAMPLE_BUCKETS,
    };
  }

  /** Record warning KPI ids derived from the event (same buckets/dedupe as illustrative samples). */
  function recordWarningKpiIds(event, auditDt, kpiIdKeys) {
    if (!event || !kpiIdKeys?.length) return;
    const type = String(event.type ?? "").toUpperCase();
    const deviceType = normalizeSampleDeviceType(auditDt, event);
    for (const kpiIdKey of kpiIdKeys) {
      add(kpiIdKey, kpiIdKey, event, {
        description: `Illustrates warning (${kpiIdKey})`,
        deviceType,
      });
    }
  }

  return { add, count, recordWarningKpiIds, toArray, stats };
}

export function kpiId(...parts) {
  return parts
    .filter((p) => p != null && p !== "")
    .map((p) => String(p).replace(/[^a-zA-Z0-9._-]/g, "_"))
    .join(".");
}
