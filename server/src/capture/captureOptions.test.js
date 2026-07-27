import test from "node:test";
import assert from "node:assert/strict";
import {
  REALTIME_PRESETS,
  resolveCaptureOptions,
  resolveCaptureWindow,
  resolveRealtimeThresholds,
  resolveStartPosition,
  resolveStopMode,
} from "./captureOptions.js";

test("defaults to a manual stop from the earliest available event", () => {
  const options = resolveCaptureOptions({ profile: "Demo" });
  assert.equal(options.stopMode, "manual");
  assert.equal(options.realTime, false);
  assert.equal(options.startPosition, "earliest");
  assert.equal(options.streamMode.rtdsStart, "EARLIEST");
  assert.equal(options.captureWindow.latencyMs, null);
  assert.equal(options.realtimeThresholds, null);
  assert.equal(options.timezone, "Europe/Paris");
});

test("real-time stop mode carries the resolved plateau thresholds", () => {
  const options = resolveCaptureOptions({ profile: "Demo", stop_mode: "realtime" });
  assert.equal(options.realTime, true);
  assert.deepEqual(options.realtimeThresholds, {
    preset: "thorough",
    minEvents: REALTIME_PRESETS.thorough.minEvents,
    minProcessedSpanMs: REALTIME_PRESETS.thorough.minProcessedSpanMs,
    plateauMargin: REALTIME_PRESETS.thorough.plateauMargin,
    plateauSpanMs: REALTIME_PRESETS.thorough.plateauSpanMs,
  });
});

test("the fast preset lowers every threshold", () => {
  const fast = resolveRealtimeThresholds({ rt_preset: "fast" });
  assert.equal(fast.preset, "fast");
  assert.ok(fast.minEvents < REALTIME_PRESETS.thorough.minEvents);
  assert.ok(fast.minProcessedSpanMs < REALTIME_PRESETS.thorough.minProcessedSpanMs);
  assert.ok(fast.plateauMargin < REALTIME_PRESETS.thorough.plateauMargin);
  assert.ok(fast.plateauSpanMs < REALTIME_PRESETS.thorough.plateauSpanMs);
});

test("explicit threshold overrides win over the preset", () => {
  const thresholds = resolveRealtimeThresholds({ rt_preset: "fast", rt_min_events: "4242" });
  assert.equal(thresholds.minEvents, 4242);
  assert.equal(thresholds.plateauMargin, REALTIME_PRESETS.fast.plateauMargin);
});

test("invalid threshold overrides fall back to the preset value", () => {
  const thresholds = resolveRealtimeThresholds({ rt_min_events: "-1", rt_margin: "abc" });
  assert.equal(thresholds.minEvents, REALTIME_PRESETS.thorough.minEvents);
  assert.equal(thresholds.plateauMargin, REALTIME_PRESETS.thorough.plateauMargin);
});

test("rejects unknown stop modes, start positions and presets", () => {
  assert.throws(() => resolveStopMode({ stop_mode: "eventually" }), /stop_mode must be one of/);
  assert.throws(() => resolveStartPosition({ start: "yesterday" }), /start must be one of/);
  assert.throws(() => resolveRealtimeThresholds({ rt_preset: "turbo" }), /rt_preset must be one of/);
});

test("start position maps to the matching RTDS stream mode", () => {
  assert.equal(resolveStartPosition({ start: "latest" }).streamMode.rtdsStart, "LATEST");
  assert.equal(resolveStartPosition({}).streamMode.rtdsStart, "EARLIEST");
});

test("window hours set the RTDS latency when starting from earliest", () => {
  const window = resolveCaptureWindow({ window_hours: "6" }, "earliest");
  assert.equal(window.hours, 6);
  assert.equal(window.latencyMs, 6 * 60 * 60 * 1000);
});

test("window hours are rejected for LATEST and for unsupported values", () => {
  assert.throws(
    () => resolveCaptureWindow({ window_hours: "6" }, "latest"),
    /only supported when start=earliest/,
  );
  assert.throws(() => resolveCaptureWindow({ window_hours: "5" }, "earliest"), /must be one of/);
});

test("an empty window_hours is treated as no latency filter", () => {
  assert.equal(resolveCaptureWindow({ window_hours: "" }, "earliest").latencyMs, null);
});

test("excluded device types are parsed from the query", () => {
  const options = resolveCaptureOptions({
    profile: "Demo",
    excludedDeviceTypes: JSON.stringify(["ios", "web"]),
  });
  assert.deepEqual(options.excludedDeviceTypes, ["IOS", "WEB"]);
});
