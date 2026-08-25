import { formatDurationDaysHours } from "./formatTimeSpan.js";

export function msToHourKey(ms, timeZone) {
  if (ms == null || Number.isNaN(ms)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}`;
}

/** Hour buckets from oldest processed → newest processed (inclusive). */
export function hourKeysBetweenMs(oldestMs, newestMs, timeZone) {
  if (oldestMs == null || newestMs == null) return [];
  const hourMs = 60 * 60 * 1000;
  const seen = new Set();
  const keys = [];
  let t = oldestMs;
  while (t <= newestMs + hourMs) {
    const key = msToHourKey(t, timeZone);
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
    t += hourMs;
  }
  return keys;
}

export function buildProcessedRange(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const fromMs = Date.parse(fromIso);
  const toMs = Date.parse(toIso);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return null;
  const spanMs = Math.max(0, toMs - fromMs);
  return {
    from: fromIso,
    to: toIso,
    spanMs,
    spanLabel: formatDurationDaysHours(spanMs),
  };
}

export function formatElapsedMs(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

export function shortHourLabel(hourKey) {
  if (!hourKey) return "";
  const [datePart, hourPart] = hourKey.split("T");
  if (!datePart || hourPart === undefined) return hourKey;
  const day = datePart.slice(5);
  return `${day} ${hourPart}:00`;
}

/** Compact one-line processed range for the live monitor header. */
export function formatProcessedStreamCompact(progress) {
  if (!progress?.oldestProcessed && !progress?.newestProcessed) return null;

  const from = progress.oldestProcessed ? new Date(progress.oldestProcessed) : null;
  const to = progress.newestProcessed ? new Date(progress.newestProcessed) : null;
  const short = (date) =>
    date.toLocaleString(undefined, {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  const span = progress.processedRange?.spanLabel ?? "—";

  if (from && to) {
    return {
      label: `processed ${short(from)} → ${short(to)} · ${span}`,
      title: `Processed in stream: ${from.toLocaleString()} → ${to.toLocaleString()} (${span})`,
    };
  }
  if (from) {
    return {
      label: `processed from ${short(from)}`,
      title: `Earliest processed: ${from.toLocaleString()}`,
    };
  }
  if (to) {
    return {
      label: `processed through ${short(to)}`,
      title: `Latest processed: ${to.toLocaleString()}`,
    };
  }
  return null;
}

export function createEarliestStreamProgress() {
  return {
    startedAtMs: Date.now(),
    eventCount: 0,
    oldestProcessedMs: null,
    newestProcessedMs: null,
    oldestProcessed: null,
    newestProcessed: null,
    hoursWithEvents: [],
    hoursScanned: [],
    hoursScannedCount: 0,
    processedRange: null,
  };
}

export function noteEarliestStreamEvent(progress, event, timeZone) {
  const processed = event?.processed;
  if (!processed) return progress;
  const ms = Date.parse(processed);
  if (Number.isNaN(ms)) return progress;

  const oldestMs =
    progress.oldestProcessedMs == null ? ms : Math.min(progress.oldestProcessedMs, ms);
  const newestMs =
    progress.newestProcessedMs == null ? ms : Math.max(progress.newestProcessedMs, ms);
  const hourKey = msToHourKey(ms, timeZone);
  const hoursWithEvents =
    hourKey && !progress.hoursWithEvents.includes(hourKey)
      ? [...progress.hoursWithEvents, hourKey].sort()
      : progress.hoursWithEvents;
  const hoursScanned = hourKeysBetweenMs(oldestMs, newestMs, timeZone);
  const oldestProcessed = new Date(oldestMs).toISOString();
  const newestProcessed = new Date(newestMs).toISOString();

  return {
    ...progress,
    eventCount: progress.eventCount + 1,
    oldestProcessedMs: oldestMs,
    newestProcessedMs: newestMs,
    oldestProcessed,
    newestProcessed,
    hoursWithEvents,
    hoursScanned,
    hoursScannedCount: hoursScanned.length,
    processedRange: buildProcessedRange(oldestProcessed, newestProcessed),
  };
}
