/** Priority rules for event sample buckets when MAX_EVENT_SAMPLE_BUCKETS is reached. */

const MESSAGING_PREFIXES = ["messaging.send_rejected.", "messaging.send_aborted."];

export function isPrioritySampleKpi(kpiId) {
  if (!kpiId) return false;
  const id = String(kpiId);
  if (MESSAGING_PREFIXES.some((prefix) => id.startsWith(prefix))) return true;
  // Main email feedback events (email_custom.{name}.{device}) — not per-property buckets.
  if (id.startsWith("email_custom.") && !id.includes(".prop.")) {
    const parts = id.split(".");
    return parts.length === 3;
  }
  return false;
}

export function isDeprioritizedSampleKpi(kpiId) {
  if (!kpiId) return false;
  const id = String(kpiId);
  return id.includes(".prop.") || id.startsWith("by_device.");
}

function evictionScore(kpiId, bucket) {
  const id = String(kpiId);
  const events = bucket?.events?.length ?? 0;
  if (isPrioritySampleKpi(id)) return Number.POSITIVE_INFINITY;
  if (idIncludesEmailProp(id)) return 1_000 + events;
  if (id.startsWith("by_device.")) return 2_000 + events;
  return 3_000 + events;
}

function idIncludesEmailProp(kpiId) {
  return String(kpiId).includes(".prop.");
}

/**
 * Remove one non-priority bucket to make room for a priority KPI id.
 * @param {Map<string, { events?: unknown[] }>} buckets
 * @param {{ protectKpiId?: string }} [options]
 * @returns {boolean}
 */
export function evictSampleBucketForPriority(buckets, { protectKpiId = null } = {}) {
  let victimKey = null;
  let victimScore = Number.POSITIVE_INFINITY;

  for (const [key, bucket] of buckets) {
    if (key === protectKpiId) continue;
    if (isPrioritySampleKpi(key)) continue;
    const score = evictionScore(key, bucket);
    if (score < victimScore) {
      victimScore = score;
      victimKey = key;
    }
  }

  if (!victimKey) return false;
  buckets.delete(victimKey);
  return true;
}

/**
 * @param {Map<string, unknown>} buckets
 * @param {string} kpiId
 * @param {number} maxBuckets
 * @param {number} [reserveForPriority]
 */
export function canOpenSampleBucket(buckets, kpiId, maxBuckets, reserveForPriority = 48) {
  if (buckets.has(kpiId)) return true;
  if (buckets.size < maxBuckets) {
    if (isPrioritySampleKpi(kpiId)) return true;
    return buckets.size < maxBuckets - reserveForPriority;
  }
  if (isPrioritySampleKpi(kpiId)) {
    return evictSampleBucketForPriority(buckets, { protectKpiId: kpiId });
  }
  return false;
}
