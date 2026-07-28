import test from "node:test";
import assert from "node:assert/strict";
import { buildCaptureStreamParams } from "./captureParams.js";

test("a manual capture sends the project, timezone, stop mode and start position", () => {
  const params = buildCaptureStreamParams({
    profile: "euro goat",
    timezone: "Europe/Paris",
    stopMode: "manual",
    startPosition: "earliest",
  });
  assert.equal(params.get("profile"), "euro goat");
  assert.equal(params.get("timezone"), "Europe/Paris");
  assert.equal(params.get("stop_mode"), "manual");
  assert.equal(params.get("start"), "earliest");
  assert.equal(params.get("rt_preset"), null);
});

test("real-time mode sends no sensitivity setting: the guardrails are fixed", () => {
  const realtime = buildCaptureStreamParams({ profile: "p", stopMode: "realtime" });
  assert.equal(realtime.get("stop_mode"), "realtime");
  assert.equal(realtime.get("rt_preset"), null);
  assert.equal(realtime.get("rt_min_events"), null);
});

test("a backlog limit only applies when starting from the earliest event", () => {
  const earliest = buildCaptureStreamParams({
    profile: "p",
    startPosition: "earliest",
    windowHours: 24,
  });
  assert.equal(earliest.get("window_hours"), "24");

  const latest = buildCaptureStreamParams({
    profile: "p",
    startPosition: "latest",
    windowHours: 24,
  });
  assert.equal(latest.get("window_hours"), null);
});

test("an empty backlog limit is treated as no limit", () => {
  for (const windowHours of [null, "", undefined]) {
    const params = buildCaptureStreamParams({ profile: "p", windowHours });
    assert.equal(params.get("window_hours"), null);
  }
});

test("excluded device types are JSON encoded, and omitted when empty", () => {
  const excluded = buildCaptureStreamParams({ profile: "p", excludedDeviceTypes: ["ios"] });
  assert.equal(
    excluded.get("excludedDeviceTypes"),
    encodeURIComponent(JSON.stringify(["ios"])),
  );
  assert.equal(
    buildCaptureStreamParams({ profile: "p", excludedDeviceTypes: [] }).get("excludedDeviceTypes"),
    null,
  );
});

test("defaults cover a manual capture from the earliest event", () => {
  const params = buildCaptureStreamParams({ profile: "p" });
  assert.equal(params.get("stop_mode"), "manual");
  assert.equal(params.get("start"), "earliest");
});
