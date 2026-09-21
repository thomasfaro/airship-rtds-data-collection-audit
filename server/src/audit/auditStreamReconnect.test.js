import test from "node:test";
import assert from "node:assert/strict";
import { buildAuditConnectBody } from "./auditStreamReconnect.js";

test("buildAuditConnectBody uses start on first connect", () => {
  const body = buildAuditConnectBody(["OPEN"], null, "EARLIEST", null);
  assert.equal(body.start, "EARLIEST");
  assert.equal(body.resume_offset, undefined);
});

test("buildAuditConnectBody adds device_type exclusion predicates", () => {
  const body = buildAuditConnectBody(["OPEN"], null, "EARLIEST", null, {
    excludedDeviceTypes: ["EMAIL"],
  });
  assert.equal(body.filters[0].predicates?.[0]?.not?.key, "device_type");
  assert.equal(body.filters[0].predicates[0].not.value.equals, "EMAIL");
});

test("buildAuditConnectBody resumes with offset", () => {
  const body = buildAuditConnectBody(["OPEN"], null, "EARLIEST", "offset-99");
  assert.equal(body.start, undefined);
  assert.equal(body.resume_offset, "offset-99");
});
