import path from "node:path";
import { mkdirOwnerOnly } from "./security/secureFs.js";

function resolveServerRoot() {
  if (process.env.RTDS_DCA_SERVER_ROOT) {
    return path.resolve(process.env.RTDS_DCA_SERVER_ROOT);
  }
  // Dev starts the server from the `server/` folder.
  return path.resolve(process.cwd());
}

export const serverRoot = resolveServerRoot();
export const repoRoot = process.env.RTDS_DCA_REPO_ROOT
  ? path.resolve(process.env.RTDS_DCA_REPO_ROOT)
  : path.resolve(serverRoot, "..");

/** Writable data root (profiles, local api key, saved analyses). */
export function dataRoot() {
  if (process.env.RTDS_DCA_DATA_DIR) {
    return path.resolve(process.env.RTDS_DCA_DATA_DIR);
  }
  return repoRoot;
}

export const workspaceRoot = dataRoot();

export function resolveProfilesConfigPath() {
  if (process.env.RTDS_PROFILES_PATH) {
    return path.resolve(process.env.RTDS_PROFILES_PATH);
  }
  return path.join(dataRoot(), "config", "rtds-profiles.json");
}

/**
 * Directory holding persisted analyses (`*.audit-report.json` and value sidecars)
 * and optional live raw captures (`live-*.ndjson`) when the user opts in.
 */
export function storedFilesDir() {
  if (process.env.RTDS_DCA_STORAGE_DIR) {
    return path.resolve(process.env.RTDS_DCA_STORAGE_DIR);
  }
  return path.join(dataRoot(), ".stored-files");
}

/** Alias kept so the ported audit modules resolve their storage directory. */
export function auditTmpDir() {
  return storedFilesDir();
}

export function ensureDataDirs() {
  mkdirOwnerOnly(path.join(dataRoot(), "config"));
  mkdirOwnerOnly(storedFilesDir());
}
