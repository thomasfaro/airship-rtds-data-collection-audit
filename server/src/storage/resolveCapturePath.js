import path from "node:path";
import { storedFilesDir } from "../appPaths.js";
import { sanitizeProfileName } from "./paths.js";

/**
 * Resolve a capture stem name (as exposed in `report.meta.storage.sourceFileName`)
 * to its absolute path inside the storage directory. The returned path never
 * exists on disk — captures are analysis-only — but it is the stem the report and
 * value sidecars are keyed on.
 *
 * @throws when the name escapes the storage directory.
 */
export function resolveCapturePath(name) {
  const raw = String(name ?? "").trim();
  if (!raw || raw.includes("/") || raw.includes("\\") || raw.includes("..")) {
    throw new Error("Invalid capture name");
  }
  const dir = storedFilesDir();
  const filePath = path.resolve(path.join(dir, raw));
  if (!filePath.startsWith(path.resolve(dir) + path.sep)) {
    throw new Error("Invalid capture name");
  }
  return { dir, filePath, name: raw };
}

export { sanitizeProfileName };
