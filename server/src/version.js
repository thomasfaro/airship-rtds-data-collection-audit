import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "./appPaths.js";
import { gitHead } from "./updates/gitInfo.js";

/**
 * Which version of the tool is this.
 *
 * Two questions, and they have different answers, which is the whole point:
 * `runningVersion()` is what this process loaded and never changes, while the folder
 * on disk moves the moment someone pulls. Comparing the two is how the app knows to
 * ask for a restart instead of quietly serving yesterday's code.
 *
 * The root package.json is the single source of truth for the number — the server and
 * frontend ones exist only so npm is happy. The commit comes from git when there is a
 * git folder, which a ZIP install has not; everything degrades to just the number.
 */

const PACKAGE_PATH = path.join(repoRoot, "package.json");

function readPackageVersion() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PACKAGE_PATH, "utf8"));
    const version = String(parsed?.version ?? "").trim();
    return version || null;
  } catch {
    return null;
  }
}

/** Version as it stands on disk right now. Cheap enough to call on a request. */
export function diskVersion() {
  const head = gitHead();
  return {
    version: readPackageVersion(),
    commit: head?.short ?? null,
    commitDate: head?.date ?? null,
  };
}

let running = null;

/**
 * Version of the code this process is actually running. Pinned on first call, so the
 * caller must reach it early — `index.js` does, while starting up.
 */
export function runningVersion() {
  if (!running) {
    running = diskVersion();
  }
  return running;
}

/** Human-readable, for a log line or a tooltip: `1.2.0 (a1b2c3d)`. */
export function versionLabel(snapshot = runningVersion()) {
  const version = snapshot?.version ?? "unknown";
  return snapshot?.commit ? `${version} (${snapshot.commit})` : version;
}

/** Test hook: forget the pinned snapshot. */
export function resetRunningVersion() {
  running = null;
}
