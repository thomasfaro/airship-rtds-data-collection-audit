import fs from "node:fs";
import path from "node:path";
import { LIVE_TMP_DIR, ensureLiveTmpDir } from "./paths.js";

function listNdjsonFiles() {
  if (!fs.existsSync(LIVE_TMP_DIR)) return [];
  return fs
    .readdirSync(LIVE_TMP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ndjson"))
    .map((entry) => {
      const filePath = path.join(LIVE_TMP_DIR, entry.name);
      const stat = fs.statSync(filePath);
      return { filePath, name: entry.name, mtimeMs: stat.mtimeMs, size: stat.size };
    });
}

function deleteFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    fs.unlinkSync(filePath);
    return stat.size;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("[live-purge] failed to delete:", filePath, error.message);
    }
    return 0;
  }
}

/**
 * @param {object} [options]
 * @param {string} [options.profilePrefix] only files whose name starts with sanitized profile prefix
 * @param {boolean} [options.deleteAll]
 */
export function purgeLiveTmp(options = {}) {
  ensureLiveTmpDir();
  const { profilePrefix, deleteAll = false } = options;
  const safePrefix = profilePrefix
    ? String(profilePrefix).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64)
    : null;

  let deletedFiles = 0;
  let freedBytes = 0;

  for (const file of listNdjsonFiles()) {
    if (!deleteAll && safePrefix && !file.name.startsWith(`live-${safePrefix}-`)) continue;
    const bytes = deleteFile(file.filePath);
    if (bytes > 0) {
      deletedFiles += 1;
      freedBytes += bytes;
    }
  }

  const remaining = listNdjsonFiles();
  return {
    deletedFiles,
    freedBytes,
    remainingFiles: remaining.length,
    remainingBytes: remaining.reduce((sum, file) => sum + file.size, 0),
  };
}
