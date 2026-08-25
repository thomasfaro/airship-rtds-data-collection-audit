import test from "node:test";
import assert from "node:assert/strict";
import {
  AUDIT_DEVICE_TYPE_CATALOG,
  mergeAuditDeviceTypeOptions,
} from "./auditDeviceTypes.js";

test("catalog matches RTDS Connect channels plus API named user bucket", () => {
  assert.deepEqual(AUDIT_DEVICE_TYPE_CATALOG, [
    "IOS",
    "ANDROID",
    "AMAZON",
    "WEB",
    "EMAIL",
    "SMS",
    "OPEN",
    "API_NAMED_USER_EVENTS",
  ]);
  assert.ok(!AUDIT_DEVICE_TYPE_CATALOG.includes("WEB_PUSH"));
  assert.ok(!AUDIT_DEVICE_TYPE_CATALOG.includes("UNKNOWN"));
});

test("mergeAuditDeviceTypeOptions hides UNKNOWN and merges observed counts", () => {
  const rows = mergeAuditDeviceTypeOptions([
    { deviceType: "EMAIL", count: 42 },
    { deviceType: "UNKNOWN", count: 9 },
    { deviceType: "RARE_TYPE", count: 1 },
  ]);
  assert.ok(rows.some((r) => r.deviceType === "IOS" && r.count == null));
  assert.equal(rows.find((r) => r.deviceType === "EMAIL")?.count, 42);
  assert.ok(!rows.some((r) => r.deviceType === "UNKNOWN"));
  assert.equal(rows.find((r) => r.deviceType === "RARE_TYPE")?.count, 1);
});
