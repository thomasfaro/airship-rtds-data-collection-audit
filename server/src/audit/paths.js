import { storedFilesDir } from "../appPaths.js";
import { createTmpPaths, workspaceRoot } from "../storage/paths.js";

export { workspaceRoot };

/**
 * Path helpers for a capture's storage stem. Captures are analysis-only, so the
 * `.ndjson` path is never written to — it only names the saved report and the
 * value sidecars that sit beside it.
 */
const capture = createTmpPaths({
  tmpDir: storedFilesDir(),
  prefix: "capture",
  keepEnvKey: "AUDIT_KEEP_RAW_FILE",
  logTag: "capture",
});

export const AUDIT_TMP_DIR = capture.TMP_DIR;

export const ensureAuditTmpDir = capture.ensureTmpDir;

export function createAuditRawFilePath(profileName) {
  return capture.createRawFilePath(profileName);
}

export const shouldKeepAuditRawFile = capture.shouldKeepRawFile;

export function removeAuditRawFile(filePath) {
  capture.removeRawFile(filePath);
}
