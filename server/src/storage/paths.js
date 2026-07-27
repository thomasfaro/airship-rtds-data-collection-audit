import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataRoot as workspaceRoot } from "../appPaths.js";

export { workspaceRoot };

export function sanitizeProfileName(profileName) {
  return String(profileName).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64);
}

/**
 * Shared tmp NDJSON path helpers for audit and live streams.
 */
export function createTmpPaths({ tmpDir, prefix, keepEnvKey, logTag }) {
  function ensureTmpDir() {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  function shouldKeepRawFile() {
    const v = String(process.env[keepEnvKey] ?? "true").toLowerCase();
    return v !== "false";
  }

  function removeRawFile(filePath) {
    if (!filePath) return false;
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.warn(`[${logTag}] failed to delete raw file:`, error.message);
      }
      return false;
    }
  }

  function createRawFilePath(profileName, { streamId } = {}) {
    ensureTmpDir();
    const safe = sanitizeProfileName(profileName);
    if (streamId != null) {
      const id = String(streamId).replace(/[^a-zA-Z0-9-]+/g, "").slice(0, 36);
      return path.join(tmpDir, `${prefix}-${safe}-${id}.ndjson`);
    }
    return path.join(tmpDir, `${prefix}-${safe}-${Date.now()}-${randomUUID().slice(0, 8)}.ndjson`);
  }

  return {
    TMP_DIR: tmpDir,
    ensureTmpDir,
    createRawFilePath,
    shouldKeepRawFile,
    removeRawFile,
  };
}
