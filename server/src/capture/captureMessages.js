/**
 * Every string a capture shows the user, in one place.
 *
 * Two reasons it is worth a module of its own: the "English only" rule has a single
 * file to review, and none of this needs a stream to be tested.
 */

import { auditWindowUsesLatency, formatTimeSpanMs } from "../audit/auditWindow.js";
import { formatRtdsStreamError } from "../rtds/rtdsStreamErrors.js";

export const CAPTURE_MESSAGES = {
  noProfile: "No project selected",
  cancelled: "Capture cancelled",
  alreadyRunning:
    "A capture is already running for this project. Stop it first or wait for it to finish.",
  stoppedBeforeAnyEvent: "Capture stopped before any event was analyzed",
  noEvents: "No events analyzed",
  analysisCancelled: "Analysis cancelled",
  failed: "Capture failed",
};

export function startStatusMessage({ stopMode, startPosition, captureWindow }) {
  const start = startPosition === "latest" ? "LATEST" : "EARLIEST";
  const window = auditWindowUsesLatency(captureWindow) ? `, latency ${captureWindow.label}` : "";
  const ending =
    stopMode === "realtime"
      ? "will stop automatically once tracking coverage is complete"
      : "click Stop when ready";
  return `Capturing tracking events from RTDS (${start}${window}) — ${ending}…`;
}

/** Shown when the token turns out not to be entitled to some of the requested types. */
export function entitlementStatusMessage({ excludedTypes, typesCount }) {
  return `Adjusted RTDS filters (token not entitled to: ${excludedTypes.join(", ")}). Capturing ${typesCount} event types…`;
}

/** Shown when the plateau checks all pass and a real-time capture ends itself. */
export function autoStopMessage({ events, spanMs }) {
  return `Coverage complete — ${events.toLocaleString("en-US")} events over ${formatTimeSpanMs(spanMs)} of processed time, no new tracking keys. Stopping automatically.`;
}

export function analyzeStatusMessage(events) {
  return `Building the tagging plan from ${events.toLocaleString("en-US")} events…`;
}

export function captureErrorMessage(error) {
  const formatted = formatRtdsStreamError(error, { phase: "download" });
  return {
    kind: "error",
    message: formatted.message,
    detail: formatted.detail ?? String(error),
    causeHint: formatted.causeHint,
  };
}
