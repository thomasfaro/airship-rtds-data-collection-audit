import test from "node:test";
import assert from "node:assert/strict";
import { createAuditAccumulator, ingestAuditLine } from "./analyzeEvents.js";
import { buildOpenAppVersionReport } from "./analyzeInsights.js";

test("OPEN events aggregate app version and SDK version", () => {
  const acc = createAuditAccumulator();
  const mk = (app, sdk, dt = "IOS") =>
    JSON.stringify({
      type: "OPEN",
      processed: "2026-06-01T10:00:00.000Z",
      device: { device_type: dt, attributes: { app_version: app, ua_sdk_version: sdk } },
      body: {},
    });

  ingestAuditLine(acc, mk("2.0.0", "18.0.0"));
  ingestAuditLine(acc, mk("2.0.0", "18.0.0"));
  ingestAuditLine(acc, mk("2.1.0", "18.1.0"));
  ingestAuditLine(acc, mk("2.0.0", "17.9.0", "ANDROID"));

  const report = buildOpenAppVersionReport(acc.open);
  const ios = report.find((r) => r.deviceType === "IOS");
  assert.ok(ios);
  assert.equal(ios.deviceEventTotal, 3);
  const v20 = ios.versions.find((v) => v.version === "2.0.0");
  assert.equal(v20.count, 2);
  assert.equal(v20.sdkVersions.find((s) => s.version === "18.0.0").count, 2);
});
