import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeStatusMessage,
  autoStopMessage,
  captureErrorMessage,
  entitlementStatusMessage,
  startStatusMessage,
} from "./captureMessages.js";

test("the start message names the start position, the latency and how the run ends", () => {
  assert.equal(
    startStatusMessage({
      stopMode: "realtime",
      startPosition: "earliest",
      captureWindow: { latencyMs: 3_600_000, label: "1h" },
    }),
    "Capturing tracking events from RTDS (EARLIEST, latency 1h) — will stop automatically once tracking coverage is complete…",
  );
  assert.equal(
    startStatusMessage({ stopMode: "manual", startPosition: "latest", captureWindow: null }),
    "Capturing tracking events from RTDS (LATEST) — click Stop when ready…",
  );
});

test("counts are grouped for readability", () => {
  assert.match(analyzeStatusMessage(1_250_000), /1,250,000 events/);
  assert.match(
    autoStopMessage({ events: 1_250_000, spanMs: 4 * 60 * 60 * 1000 }),
    /1,250,000 events over 4h 00m 00s of processed time/,
  );
});

test("the entitlement message lists what the token cannot read", () => {
  assert.equal(
    entitlementStatusMessage({ excludedTypes: ["TAG_CHANGE", "CUSTOM"], typesCount: 3 }),
    "Adjusted RTDS filters (token not entitled to: TAG_CHANGE, CUSTOM). Capturing 3 event types…",
  );
});

test("a stream error keeps its detail alongside the message", () => {
  const formatted = captureErrorMessage(new Error("socket hang up"));
  assert.equal(formatted.kind, "error");
  assert.ok(formatted.message);
  assert.match(formatted.detail, /socket hang up/);
});
