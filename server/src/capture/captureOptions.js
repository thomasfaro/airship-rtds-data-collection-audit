import {
  AUDIT_STREAM_MODES,
  AUDIT_WINDOW_HOURS,
  resolveAuditWindow,
} from "../audit/auditWindow.js";
import { parseExcludedDeviceTypesQuery } from "../audit/parseExcludedDeviceTypes.js";
import {
  DEFAULT_MIN_EVENTS,
  DEFAULT_MIN_PROCESSED_SPAN_MS,
  DEFAULT_PLATEAU_SPAN_MS,
} from "../audit/coveragePlateau.js";

/**
 * How the capture ends.
 * - manual: runs until the user clicks Stop.
 * - realtime: also auto-stops once distinct-key coverage plateaus. Only valid
 *   when the project sends data in real time (no daily API batch), otherwise a
 *   batch window could be missed.
 */
export const CAPTURE_STOP_MODES = ["manual", "realtime"];

/** Where the RTDS stream starts reading from. */
export const CAPTURE_START_POSITIONS = {
  earliest: AUDIT_STREAM_MODES.earliest_manual,
  latest: AUDIT_STREAM_MODES.latest_manual,
};

/**
 * The auto-stop guardrails, deliberately the only set on offer. A looser variant
 * used to be selectable and was removed — it ended captures early enough to miss
 * rare keys, which is the one thing a tagging plan cannot afford.
 *
 * They follow the engine defaults except for the plateau margin, lowered here from
 * 250k to 100k: paired with the 30 minutes of processed time that must also pass
 * without a new key, 100k events is enough evidence of a plateau, and the higher
 * bar mostly made low-traffic projects wait for volume they would never reach.
 * Set in this module so the ported engine keeps its own defaults untouched.
 */
export const REALTIME_THRESHOLDS = {
  minEvents: DEFAULT_MIN_EVENTS,
  minProcessedSpanMs: DEFAULT_MIN_PROCESSED_SPAN_MS,
  plateauMargin: 100_000,
  plateauSpanMs: DEFAULT_PLATEAU_SPAN_MS,
};

function parsePositiveInt(raw) {
  if (raw == null || String(raw).trim() === "") return undefined;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function queryHasValue(raw) {
  return raw != null && String(raw).trim() !== "";
}

export function resolveStopMode(query) {
  const raw = String(query?.stop_mode ?? query?.stopMode ?? "manual").trim().toLowerCase();
  if (!CAPTURE_STOP_MODES.includes(raw)) {
    throw new Error(`stop_mode must be one of: ${CAPTURE_STOP_MODES.join(", ")}`);
  }
  return raw;
}

export function resolveStartPosition(query) {
  const raw = String(query?.start ?? "earliest").trim().toLowerCase();
  const streamMode = CAPTURE_START_POSITIONS[raw];
  if (!streamMode) {
    throw new Error(`start must be one of: ${Object.keys(CAPTURE_START_POSITIONS).join(", ")}`);
  }
  return { startPosition: raw, streamMode };
}

/**
 * Optional lookback window (RTDS filter.latency). Only meaningful when starting
 * from EARLIEST — LATEST has no backlog to bound.
 */
export function resolveCaptureWindow(query, startPosition) {
  if (!queryHasValue(query?.window_hours ?? query?.windowHours)) {
    return { hours: null, latencyMs: null, label: "no latency" };
  }
  if (startPosition !== "earliest") {
    throw new Error("window_hours is only supported when start=earliest");
  }
  return resolveAuditWindow({ window_hours: query.window_hours ?? query.windowHours });
}

/** The UI never sends overrides; they exist so a single run can be tuned or tested. */
export function resolveRealtimeThresholds(query) {
  return {
    minEvents: parsePositiveInt(query?.rt_min_events) ?? REALTIME_THRESHOLDS.minEvents,
    minProcessedSpanMs:
      parsePositiveInt(query?.rt_min_span_ms) ?? REALTIME_THRESHOLDS.minProcessedSpanMs,
    plateauMargin: parsePositiveInt(query?.rt_margin) ?? REALTIME_THRESHOLDS.plateauMargin,
    plateauSpanMs:
      parsePositiveInt(query?.rt_plateau_span_ms) ?? REALTIME_THRESHOLDS.plateauSpanMs,
  };
}

/**
 * Resolve every option for a data collection capture from the request query.
 * Throws with a user-facing message on invalid input.
 */
export function resolveCaptureOptions(query) {
  const profile = String(query?.profile ?? "").trim();
  const stopMode = resolveStopMode(query);
  const { startPosition, streamMode } = resolveStartPosition(query);
  const captureWindow = resolveCaptureWindow(query, startPosition);
  return {
    profile,
    timezone: String(query?.timezone ?? "").trim() || "Europe/Paris",
    stopMode,
    realTime: stopMode === "realtime",
    startPosition,
    streamMode,
    captureWindow,
    excludedDeviceTypes: parseExcludedDeviceTypesQuery(query),
    realtimeThresholds: stopMode === "realtime" ? resolveRealtimeThresholds(query) : null,
  };
}

export { AUDIT_WINDOW_HOURS };
