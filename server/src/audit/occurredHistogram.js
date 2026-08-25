import { createReadStream } from "node:fs";
import readline from "node:readline";
import { parseProcessedMs } from "./auditWindow.js";
import { parseTimestampMs } from "./analysisScope.js";

const MAX_BUCKETS = 48;
const SAMPLE_TARGET_LINES = 300_000;

function chooseBucketWidthMs(spanMs) {
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const candidates = [
    1 * minute,
    5 * minute,
    15 * minute,
    30 * minute,
    hour,
    2 * hour,
    6 * hour,
    12 * hour,
    day,
    2 * day,
    7 * day,
    14 * day,
    30 * day,
  ];
  for (const width of candidates) {
    if (Math.ceil(spanMs / width) <= MAX_BUCKETS) return width;
  }
  return Math.ceil(spanMs / MAX_BUCKETS);
}

export function formatBucketInstant(iso, timezone) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone ?? "UTC",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 16);
  }
}

/**
 * Build processed-time histogram for scoped analysis range picker.
 * Uses regex line scan; samples large files and scales counts (estimated).
 */
export async function buildProcessedHistogram(
  filePath,
  processedRange,
  { timezone = "UTC", estimatedLines = null } = {},
) {
  const rangeFromMs = parseTimestampMs(processedRange?.from);
  const rangeToMs = parseTimestampMs(processedRange?.to);
  if (rangeFromMs == null || rangeToMs == null || rangeToMs <= rangeFromMs) {
    return { buckets: [], estimated: false, bucketWidthMs: null, totalInRange: 0 };
  }

  const spanMs = rangeToMs - rangeFromMs;
  const bucketWidthMs = chooseBucketWidthMs(spanMs);
  const bucketCount = Math.max(1, Math.ceil(spanMs / bucketWidthMs));
  const counts = new Array(bucketCount).fill(0);

  const sampleEvery =
    estimatedLines != null && estimatedLines > SAMPLE_TARGET_LINES
      ? Math.ceil(estimatedLines / SAMPLE_TARGET_LINES)
      : 1;

  let lineIndex = 0;
  let parsed = 0;

  const rl = readline.createInterface({
    input: createReadStream(filePath, { highWaterMark: 1024 * 1024, encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    lineIndex += 1;
    if (sampleEvery > 1 && (lineIndex - 1) % sampleEvery !== 0) continue;

    const trimmed = line.trim();
    if (!trimmed) continue;

    const ms = parseProcessedMs(trimmed);
    if (ms == null || ms < rangeFromMs || ms > rangeToMs) continue;

    const idx = Math.min(bucketCount - 1, Math.floor((ms - rangeFromMs) / bucketWidthMs));
    counts[idx] += sampleEvery;
    parsed += sampleEvery;
  }

  const buckets = [];
  for (let i = 0; i < bucketCount; i += 1) {
    const fromMs = rangeFromMs + i * bucketWidthMs;
    const toMs = Math.min(rangeToMs, fromMs + bucketWidthMs);
    const count = counts[i];
    buckets.push({
      index: i,
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
      count,
      label: formatBucketInstant(new Date(fromMs).toISOString(), timezone),
    });
  }

  return {
    buckets,
    bucketWidthMs,
    estimated: sampleEvery > 1,
    sampleEvery,
    totalInRange: parsed,
    rangeFrom: processedRange.from,
    rangeTo: processedRange.to,
  };
}
