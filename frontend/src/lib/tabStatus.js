export const BASE_TITLE = "RTDS Data Collection Audit";

/** Favicon per session state — the tab is often too narrow to show any title at all. */
export const TAB_ICONS = {
  idle: "./favicon.svg",
  running: "./favicon-running.svg",
  done: "./favicon-done.svg",
  error: "./favicon-error.svg",
};

const compactCount = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function runningLabel({ stopping, progress }) {
  if (stopping) return "Stopping…";
  if (progress?.phase && progress.phase !== "download") return "Building the plan…";
  const events = progress?.linesWritten ?? progress?.coverage?.events ?? 0;
  return events > 0 ? `${compactCount.format(events)} events` : "Connecting…";
}

/**
 * What the browser tab should report for a capture session. A real-time capture
 * runs for hours in a background tab, so the title and the favicon are what the
 * user actually watches — the leading marker stays first so it survives the
 * truncation a narrow tab applies.
 */
export function captureTabStatus({ active, stopping, progress, status, report, error } = {}) {
  if (active) {
    return { state: "running", title: `● ${runningLabel({ stopping, progress })} · ${BASE_TITLE}` };
  }
  if (error) {
    return { state: "error", title: `⚠️ Capture failed · ${BASE_TITLE}` };
  }
  if (report) {
    return { state: "done", title: `✅ Audit complete · ${BASE_TITLE}` };
  }
  // The capture is over but the report is still being hydrated: the session only
  // carries a status line at that point, and it clears as soon as the report lands.
  if (status) {
    return { state: "running", title: `● Finishing… · ${BASE_TITLE}` };
  }
  return { state: "idle", title: BASE_TITLE };
}
