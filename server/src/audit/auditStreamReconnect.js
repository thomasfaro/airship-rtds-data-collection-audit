import { buildAuditRtdsBody } from "./auditRtdsBody.js";
import { reconnectBackoffMs, sleepMs } from "../rtds/streamBackoff.js";

export { reconnectBackoffMs, sleepMs };

/** Consecutive connect failures before a capture gives up and reports the error. */
export const MAX_AUDIT_CONNECT_FAILURES = 12;

export function buildAuditConnectBody(types, latencyMs, rtdsStart, resumeOffset, options = {}) {
  const body = buildAuditRtdsBody(types, latencyMs, rtdsStart, options);
  if (resumeOffset) {
    delete body.start;
    body.resume_offset = resumeOffset;
  }
  return body;
}
