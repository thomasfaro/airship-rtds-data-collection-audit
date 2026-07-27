import assert from "node:assert/strict";
import test from "node:test";
import {
  AUDIT_STREAM_MODES,
  auditWindowUsesLatency,
  queryHasWindowHours,
  resolveAnalysisOnly,
  resolveAuditLatencyMs,
  resolveAuditWindowForStream,
  resolveRealTime,
} from "./auditWindow.js";

test("resolveAnalysisOnly defaults to false and parses truthy flags", () => {
  assert.equal(resolveAnalysisOnly({}), false);
  assert.equal(resolveAnalysisOnly({ analysis_only: "0" }), false);
  assert.equal(resolveAnalysisOnly({ analysis_only: "false" }), false);
  assert.equal(resolveAnalysisOnly({ analysis_only: "1" }), true);
  assert.equal(resolveAnalysisOnly({ analysis_only: "true" }), true);
  assert.equal(resolveAnalysisOnly({ analysis_only: "YES" }), true);
  assert.equal(resolveAnalysisOnly({ analysisOnly: "on" }), true);
});

test("resolveRealTime defaults to false and parses truthy flags", () => {
  assert.equal(resolveRealTime({}), false);
  assert.equal(resolveRealTime({ real_time: "0" }), false);
  assert.equal(resolveRealTime({ real_time: "false" }), false);
  assert.equal(resolveRealTime({ real_time: "1" }), true);
  assert.equal(resolveRealTime({ real_time: "true" }), true);
  assert.equal(resolveRealTime({ real_time: "YES" }), true);
  assert.equal(resolveRealTime({ realTime: "on" }), true);
});

test("earliest_manual without window_hours has no latency", () => {
  const mode = AUDIT_STREAM_MODES.earliest_manual;
  const auditWindow = resolveAuditWindowForStream(mode, {});
  assert.equal(auditWindow.label, "no latency");
  assert.equal(resolveAuditLatencyMs(mode, auditWindow), null);
  assert.equal(auditWindowUsesLatency(auditWindow), false);
});

test("earliest_manual with window_hours sets readable latency", () => {
  const mode = AUDIT_STREAM_MODES.earliest_manual;
  const auditWindow = resolveAuditWindowForStream(mode, { window_hours: "24" });
  assert.equal(auditWindow.hours, 24);
  assert.equal(auditWindow.label, "24 hours");
  assert.equal(auditWindow.latencyMs, 86_400_000);
  assert.equal(resolveAuditLatencyMs(mode, auditWindow), 86_400_000);
  assert.equal(auditWindowUsesLatency(auditWindow), true);
});

test("queryHasWindowHours ignores empty values", () => {
  assert.equal(queryHasWindowHours({}), false);
  assert.equal(queryHasWindowHours({ window_hours: "" }), false);
  assert.equal(queryHasWindowHours({ window_hours: "6" }), true);
});
