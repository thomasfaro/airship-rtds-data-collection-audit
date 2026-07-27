/**
 * Query params for `GET /api/capture/stream`. Kept pure so the mapping from the
 * capture form to the API can be tested without a browser.
 */
export function buildCaptureStreamParams({
  profile,
  timezone,
  stopMode = "manual",
  startPosition = "earliest",
  windowHours = null,
  realtimePreset = "thorough",
  excludedDeviceTypes = [],
} = {}) {
  const params = new URLSearchParams();
  if (profile) params.set("profile", profile);
  if (timezone) params.set("timezone", timezone);
  params.set("stop_mode", stopMode);
  params.set("start", startPosition);
  // A latency window only bounds the EARLIEST backlog; LATEST has none.
  if (startPosition === "earliest" && windowHours != null && windowHours !== "") {
    params.set("window_hours", String(windowHours));
  }
  if (stopMode === "realtime") {
    params.set("rt_preset", realtimePreset);
  }
  if (Array.isArray(excludedDeviceTypes) && excludedDeviceTypes.length > 0) {
    params.set("excludedDeviceTypes", encodeURIComponent(JSON.stringify(excludedDeviceTypes)));
  }
  return params;
}
