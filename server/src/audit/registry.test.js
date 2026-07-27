import test from "node:test";
import assert from "node:assert/strict";
import { auditRtdsTypes, auditTypeCoverage, TAGGING_PLAN_RTDS_TYPES } from "./registry.js";

const EXPECTED_TRACKING_TYPES = [
  "ATTRIBUTE_OPERATION",
  "CUSTOM",
  "SCREEN_VIEWED",
  "SUBSCRIPTION_LIST",
  "TAG_CHANGE",
];

test("data collection audit restricts the RTDS request to the 5 tracking-only types", () => {
  const types = auditRtdsTypes({ trackingOnly: true });
  assert.deepEqual(types, [...EXPECTED_TRACKING_TYPES].sort());
  assert.deepEqual(TAGGING_PLAN_RTDS_TYPES.slice().sort(), [...EXPECTED_TRACKING_TYPES].sort());
});

test("standard audit still requests the full positive list (superset of tracking types)", () => {
  const standard = auditRtdsTypes();
  assert.ok(standard.length > EXPECTED_TRACKING_TYPES.length);
  for (const t of EXPECTED_TRACKING_TYPES) {
    assert.ok(standard.includes(t), `${t} should be in the standard audit`);
  }
  assert.ok(standard.includes("OPEN"), "standard audit includes OPEN");
});

test("auditTypeCoverage reflects the restricted request in trackingOnly mode", () => {
  const coverage = auditTypeCoverage({ trackingOnly: true });
  assert.deepEqual(coverage.requested, [...EXPECTED_TRACKING_TYPES].sort());
  assert.ok(coverage.notRequested.includes("OPEN"));
});
