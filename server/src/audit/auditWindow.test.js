import assert from "node:assert/strict";
import test from "node:test";
import { auditWindowUsesLatency, resolveAuditWindow } from "./auditWindow.js";

test("a window is only a latency filter when hours were asked for", () => {
  assert.equal(auditWindowUsesLatency({ hours: null, latencyMs: null }), false);
  assert.equal(auditWindowUsesLatency(resolveAuditWindow({ window_hours: "24" })), true);
});

test("resolveAuditWindow accepts the offered hours and refuses the rest", () => {
  const window = resolveAuditWindow({ window_hours: "6" });
  assert.equal(window.hours, 6);
  assert.equal(window.latencyMs, 6 * 60 * 60 * 1000);
  assert.equal(window.label, "6 hours");
  assert.equal(resolveAuditWindow({ window_hours: "1" }).label, "1 hour");
  assert.throws(() => resolveAuditWindow({ window_hours: "3" }), /window_hours must be one of/);
});
