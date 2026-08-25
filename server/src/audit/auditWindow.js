/** Allowed audit lookback windows (hours). */
export const AUDIT_WINDOW_HOURS = [1, 2, 6, 12, 24];

export const DEFAULT_AUDIT_WINDOW_HOURS = 24;

export const AUDIT_STREAM_MODES = {
  earliest_manual: {
    id: "earliest_manual",
    rtdsStart: "EARLIEST",
    stopMode: "manual",
    useLatency: false,
    label: "EARLIEST — manual stop",
  },
  latest_manual: {
    id: "latest_manual",
    rtdsStart: "LATEST",
    stopMode: "manual",
    useLatency: false,
    label: "LATEST — manual stop",
  },
};

export function resolveAuditStreamMode(query) {
  const raw = String(query?.stream_mode ?? "earliest_manual").trim();
  const mode = AUDIT_STREAM_MODES[raw];
  if (!mode) {
    throw new Error(`stream_mode must be one of: ${Object.keys(AUDIT_STREAM_MODES).join(", ")}`);
  }
  return mode;
}

export function queryHasWindowHours(query) {
  const raw = query?.window_hours ?? query?.duration_hours;
  return raw != null && String(raw).trim() !== "";
}

/**
 * Whether to run in analysis-only mode (no raw NDJSON file written).
 * Accepts analysis_only=1/true/yes (case-insensitive). Defaults to false.
 */
export function resolveAnalysisOnly(query) {
  const raw = query?.analysis_only ?? query?.analysisOnly;
  if (raw == null) return false;
  const v = String(raw).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * Real time option (data collection audit): auto-stop the RTDS capture once the
 * distinct-key coverage plateaus. Only meaningful when the client sends data in
 * real time (no daily API batch). Accepts real_time=1/true/yes/on. Defaults to false.
 */
export function resolveRealTime(query) {
  const raw = query?.real_time ?? query?.realTime;
  if (raw == null) return false;
  const v = String(raw).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** @returns {boolean} Whether the RTDS connect body should include filter.latency */
export function auditWindowUsesLatency(auditWindow) {
  return auditWindow?.latencyMs != null && auditWindow.latencyMs > 0;
}

export function resolveAuditLatencyMs(_streamMode, auditWindow) {
  return auditWindowUsesLatency(auditWindow) ? auditWindow.latencyMs : null;
}

/**
 * Resolve lookback window for an audit stream.
 * EARLIEST + manual stop accepts optional window_hours to set RTDS filter.latency.
 */
export function resolveAuditWindowForStream(streamMode, query) {
  if (streamMode.useLatency !== false) {
    return resolveAuditWindow(query);
  }
  if (streamMode.id === "earliest_manual" && queryHasWindowHours(query)) {
    return resolveAuditWindow(query);
  }
  return { hours: null, latencyMs: null, label: "no latency" };
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

/** Human-readable span between two instants (e.g. processed earliest → latest). */
export function formatTimeSpanMs(ms) {
  if (ms == null || ms < 0) return null;
  const days = Math.floor(ms / 86_400_000);
  if (days >= 2) {
    const restMs = ms - days * 86_400_000;
    const rest = formatElapsedMs(restMs);
    return rest === "0s" ? `${days}d` : `${days}d ${rest}`;
  }
  return formatElapsedMs(ms);
}

/** @returns {{ from: string, to: string, spanMs: number, spanLabel: string } | null} */
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
    spanLabel: formatTimeSpanMs(spanMs),
  };
}

export function resolveAuditWindow(query) {
  const raw = query?.window_hours ?? query?.duration_hours ?? DEFAULT_AUDIT_WINDOW_HOURS;
  const hours = Number.parseInt(String(raw), 10);
  if (!AUDIT_WINDOW_HOURS.includes(hours)) {
    throw new Error(`window_hours must be one of: ${AUDIT_WINDOW_HOURS.join(", ")}`);
  }
  return {
    hours,
    latencyMs: hours * 60 * 60 * 1000,
    label: hours === 1 ? "1 hour" : `${hours} hours`,
  };
}

const PROCESSED_RE = /"processed"\s*:\s*"([^"]+)"/;
const OCCURRED_RE = /"occurred"\s*:\s*"([^"]+)"/;

export function extractProcessedIso(line) {
  const match = String(line).match(PROCESSED_RE);
  return match ? match[1] : null;
}

export function extractOccurredIso(line) {
  const match = String(line).match(OCCURRED_RE);
  return match ? match[1] : null;
}

export function parseProcessedMs(line) {
  const iso = extractProcessedIso(line);
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

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

/** Hour buckets covering [windowStartMs, windowEndMs] in the report timezone (oldest → newest). */
export function buildExpectedHourKeys(windowStartMs, windowEndMs, timeZone) {
  const hourMs = 60 * 60 * 1000;
  const seen = new Set();
  const keys = [];
  let t = windowStartMs;
  while (t <= windowEndMs + hourMs) {
    const key = msToHourKey(t, timeZone);
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
    t += hourMs;
  }
  return keys;
}

export function hourKeysBetweenMs(oldestMs, newestMs, timeZone) {
  if (oldestMs == null || newestMs == null) return [];
  const seen = new Set();
  const keys = [];
  const hourMs = 60 * 60 * 1000;
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

/**
 * Track download progress. Modes:
 * - earliest_manual: EARLIEST without latency, manual stop; show elapsed + event counts
 * - latest_manual: LATEST without latency, manual stop; show elapsed + event counts
 */
export function createDownloadProgressTracker(
  latencyMs,
  timeZone,
  streamMode = AUDIT_STREAM_MODES.earliest_manual,
) {
  const requestStartedMs = Date.now();
  const isManualStop = streamMode.stopMode === "manual";
  const useLatencyWindow = latencyMs != null && latencyMs > 0;
  const windowEndMs = requestStartedMs;
  const windowStartMs = useLatencyWindow ? windowEndMs - latencyMs : null;
  const hoursExpected = useLatencyWindow
    ? buildExpectedHourKeys(windowStartMs, windowEndMs, timeZone)
    : [];
  const hoursExpectedSet = new Set(hoursExpected);

  let oldestProcessedMs = null;
  let newestProcessedMs = null;
  let linesWithProcessed = 0;
  const hoursWithEvents = new Set();
  let lastEmittedPct = -1;
  let lastScannedHourCount = 0;

  const isAtOrAfterRequestTime = (ms) => useLatencyWindow && ms != null && ms >= windowEndMs;
  const isBeforeWindowStart = (ms) => useLatencyWindow && ms != null && ms < windowStartMs;

  const checkLine = (line) => {
    const processedMs = parseProcessedMs(line);
    return {
      processedMs,
      atOrAfterRequestTime: isAtOrAfterRequestTime(processedMs),
      beforeWindowStart: isBeforeWindowStart(processedMs),
    };
  };

  const noteLine = (line) => {
    const processedMs = parseProcessedMs(line);
    if (processedMs == null) return false;
    linesWithProcessed += 1;
    if (oldestProcessedMs === null || processedMs < oldestProcessedMs) oldestProcessedMs = processedMs;
    if (newestProcessedMs === null || processedMs > newestProcessedMs) newestProcessedMs = processedMs;
    const key = msToHourKey(processedMs, timeZone);
    if (useLatencyWindow && key && processedMs >= windowStartMs && processedMs < windowEndMs) {
      hoursWithEvents.add(key);
    }
    return true;
  };

  /**
   * @returns {'stop'|'skip'|'ok'}
   */
  const ingestLine = (line) => {
    if (isManualStop) {
      const processedMs = parseProcessedMs(line);
      if (processedMs != null) noteLine(line);
      return "ok";
    }
    const { atOrAfterRequestTime, beforeWindowStart, processedMs } = checkLine(line);
    if (atOrAfterRequestTime) return "stop";
    if (beforeWindowStart) return "skip";
    if (processedMs != null) {
      noteLine(line);
      return "ok";
    }
    return "skip";
  };

  const computeDownloadProgressPct = () => {
    if (isManualStop || !useLatencyWindow) return null;
    if (newestProcessedMs == null) return 0;
    const coveredMs = newestProcessedMs - windowStartMs;
    return Math.min(100, Math.max(0, Math.round((coveredMs / latencyMs) * 1000) / 10));
  };

  const hasReachedRequestTime = () => newestProcessedMs != null && newestProcessedMs >= windowEndMs;

  const snapshotVolume = ({ linesWritten = 0 } = {}) => {
    const elapsedMs = Date.now() - requestStartedMs;
    const oldestProcessedIso =
      oldestProcessedMs != null ? new Date(oldestProcessedMs).toISOString() : null;
    const newestProcessedIso =
      newestProcessedMs != null ? new Date(newestProcessedMs).toISOString() : null;

    return {
      streamMode: streamMode.id,
      streamModeLabel: streamMode.label,
      rtdsStart: streamMode.rtdsStart,
      stopMode: streamMode.stopMode,
      useLatency: useLatencyWindow,
      requestStartedMs,
      requestLaunchedAt: new Date(requestStartedMs).toISOString(),
      elapsedMs,
      elapsedLabel: formatElapsedMs(elapsedMs),
      linesWritten,
      oldestProcessed: oldestProcessedIso,
      newestProcessed: newestProcessedIso,
      processedRange: buildProcessedRange(oldestProcessedIso, newestProcessedIso),
      oldestOccurred: oldestProcessedIso,
      newestOccurred: newestProcessedIso,
      linesWithProcessed,
    };
  };

  const snapshot = ({ complete = false, stoppedAtRequestTime = false, linesWritten = 0 } = {}) => {
    const elapsedMs = Date.now() - requestStartedMs;
    const downloadProgressPct = isManualStop
      ? null
      : complete || stoppedAtRequestTime || hasReachedRequestTime()
        ? 100
        : computeDownloadProgressPct();
    const anchorOldest = oldestProcessedMs ?? windowStartMs ?? requestStartedMs;
    const anchorNewest = newestProcessedMs ?? anchorOldest;
    const hoursScanned = useLatencyWindow
      ? hourKeysBetweenMs(anchorOldest, anchorNewest, timeZone).filter((key) => hoursExpectedSet.has(key))
      : [];
    const oldestProcessedIso =
      oldestProcessedMs != null ? new Date(oldestProcessedMs).toISOString() : null;
    const newestProcessedIso =
      newestProcessedMs != null ? new Date(newestProcessedMs).toISOString() : null;

    return {
      streamMode: streamMode.id,
      streamModeLabel: streamMode.label,
      rtdsStart: streamMode.rtdsStart,
      stopMode: streamMode.stopMode,
      useLatency: useLatencyWindow,
      requestStartedMs,
      requestLaunchedAt: new Date(requestStartedMs).toISOString(),
      elapsedMs,
      elapsedLabel: formatElapsedMs(elapsedMs),
      linesWritten,
      windowStart: windowStartMs != null ? new Date(windowStartMs).toISOString() : null,
      windowEnd: new Date(windowEndMs).toISOString(),
      oldestProcessed: oldestProcessedIso,
      newestProcessed: newestProcessedIso,
      processedRange: buildProcessedRange(oldestProcessedIso, newestProcessedIso),
      oldestOccurred: oldestProcessedMs != null ? new Date(oldestProcessedMs).toISOString() : null,
      newestOccurred: newestProcessedMs != null ? new Date(newestProcessedMs).toISOString() : null,
      hoursExpected,
      hoursWithEvents: [...hoursWithEvents].filter((k) => hoursExpectedSet.has(k)).sort(),
      hoursScanned,
      hoursScannedCount: hoursScanned.length,
      hoursExpectedCount: hoursExpected.length,
      downloadProgressPct,
      timeProgressPct: downloadProgressPct,
      linesWithProcessed,
      stoppedAtRequestTime: stoppedAtRequestTime || hasReachedRequestTime(),
      stoppedAtWindowStart: stoppedAtRequestTime || hasReachedRequestTime(),
    };
  };

  const shouldEmit = () => {
    if (isManualStop || !useLatencyWindow) return false;
    const { downloadProgressPct, hoursScannedCount } = snapshot();
    const pctFloor = Math.floor(downloadProgressPct ?? 0);
    const lastPctFloor = Math.floor(lastEmittedPct);
    if (pctFloor > lastPctFloor || hoursScannedCount > lastScannedHourCount) {
      lastEmittedPct = downloadProgressPct ?? 0;
      lastScannedHourCount = hoursScannedCount;
      return true;
    }
    return false;
  };

  return {
    ingestLine,
    noteLine,
    checkLine,
    hasReachedRequestTime,
    snapshot,
    snapshotVolume,
    shouldEmit,
    hoursExpected,
    windowStartMs,
    windowEndMs,
  };
}
