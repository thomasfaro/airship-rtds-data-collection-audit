import path from "node:path";
import { buildAuditRtdsBody } from "./auditRtdsBody.js";
import { reconnectBackoffMs, sleepMs } from "../rtds/streamBackoff.js";

export { reconnectBackoffMs, sleepMs };

/** Consecutive connect failures before offering partial capture (if events were saved). */
export const MAX_AUDIT_CONNECT_FAILURES = 12;

export function buildAuditConnectBody(types, latencyMs, rtdsStart, resumeOffset, options = {}) {
  const body = buildAuditRtdsBody(types, latencyMs, rtdsStart, options);
  if (resumeOffset) {
    delete body.start;
    body.resume_offset = resumeOffset;
  }
  return body;
}

export function extractEventOffset(line) {
  const trimmed = String(line ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      const event = JSON.parse(trimmed);
      return event?.offset ?? null;
    } catch {
      // fall through to regex
    }
  }
  const match = trimmed.match(/"offset"\s*:\s*"([^"]+)"/);
  return match ? match[1] : null;
}

export function buildPartialCaptureMeta(filePath, reconciled) {
  if (!filePath || !reconciled?.linesWritten) return null;
  return {
    scope: "stored",
    fileName: path.basename(filePath),
    linesWritten: reconciled.linesWritten,
    bytesWritten: reconciled.bytesWritten ?? 0,
    oldestProcessed: reconciled.oldestProcessed ?? null,
    newestProcessed: reconciled.newestProcessed ?? null,
  };
}

export class AuditDownloadPartialError extends Error {
  /**
   * @param {import("../rtds/rtdsStreamErrors.js").RtdsStreamErrorInfo} formatted
   * @param {ReturnType<typeof buildPartialCaptureMeta>} partialCapture
   */
  constructor(formatted, partialCapture) {
    const saved =
      partialCapture?.linesWritten > 0
        ? ` ${partialCapture.linesWritten.toLocaleString("en-US")} events were saved — you can analyze them.`
        : "";
    super(`${formatted.message}.${saved}`);
    this.name = "AuditDownloadPartialError";
    this.detail = formatted.detail;
    this.causeHint = formatted.causeHint;
    this.partialCapture = partialCapture;
  }
}
