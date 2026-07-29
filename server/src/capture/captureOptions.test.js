import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MIN_EVENTS,
  DEFAULT_MIN_PROCESSED_SPAN_MS,
  DEFAULT_PLATEAU_MARGIN,
  DEFAULT_PLATEAU_SPAN_MS,
} from "../audit/coveragePlateau.js";
import {
  REALTIME_THRESHOLDS,
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

test("real-time stop mode carries the one set of plateau thresholds", () => {
  const options = resolveCaptureOptions({ profile: "Demo", stop_mode: "realtime" });
  assert.equal(options.realTime, true);
  assert.deepEqual(options.realtimeThresholds, { ...REALTIME_THRESHOLDS });
});

test("the plateau margin is lowered below the engine default on purpose", () => {
  assert.equal(REALTIME_THRESHOLDS.plateauMargin, 100_000);
  assert.ok(REALTIME_THRESHOLDS.plateauMargin < DEFAULT_PLATEAU_MARGIN);
  // The rest of the guardrails stay on the engine defaults.
  assert.equal(REALTIME_THRESHOLDS.minEvents, DEFAULT_MIN_EVENTS);
  assert.equal(REALTIME_THRESHOLDS.minProcessedSpanMs, DEFAULT_MIN_PROCESSED_SPAN_MS);
  assert.equal(REALTIME_THRESHOLDS.plateauSpanMs, DEFAULT_PLATEAU_SPAN_MS);
});

test("no sensitivity preset can loosen the guardrails", () => {
  // `fast` was a selectable preset once; an old client or bookmark must not revive it.
  assert.deepEqual(resolveRealtimeThresholds({ rt_preset: "fast" }), { ...REALTIME_THRESHOLDS });
  assert.deepEqual(resolveRealtimeThresholds({ rt_preset: "turbo" }), { ...REALTIME_THRESHOLDS });
});

test("explicit threshold overrides are honoured one field at a time", () => {
  const thresholds = resolveRealtimeThresholds({ rt_min_events: "4242" });
  assert.equal(thresholds.minEvents, 4242);
  assert.equal(thresholds.plateauMargin, REALTIME_THRESHOLDS.plateauMargin);
});

test("invalid threshold overrides fall back to the default value", () => {
  const thresholds = resolveRealtimeThresholds({ rt_min_events: "-1", rt_margin: "abc" });
  assert.equal(thresholds.minEvents, REALTIME_THRESHOLDS.minEvents);
  assert.equal(thresholds.plateauMargin, REALTIME_THRESHOLDS.plateauMargin);
});

test("rejects unknown stop modes and start positions", () => {
  assert.throws(() => resolveStopMode({ stop_mode: "eventually" }), /stop_mode must be one of/);
  assert.throws(() => resolveStartPosition({ start: "yesterday" }), /start must be one of/);
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
