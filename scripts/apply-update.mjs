#!/usr/bin/env node
/**
 * Bring a git-less install up to date, at launch.
 *
 * This is the archive counterpart of the `git pull --ff-only` in `prepare-app.sh`, and
 * it exists as a Node entry point rather than more shell for one reason: the version
 * comparison and the list of paths an update may never write are security guards, they
 * are tested in `server/src/updates/`, and a second copy of them in bash would be a
 * second copy that drifts. This file only decides *when* to ask; the modules it calls
 * decide what is safe.
 *
 * Contract with the launcher: never fail, never prompt, never take longer than it
 * should. Exit 0 whatever happens, print one line only when something actually moved.
 * An install that stays on the version it had is a fine outcome; a launcher that dies
 * on a flaky network is not.
 *
 * Runs before `npm install`, so it may only use Node built-ins — as must everything it
 * imports. Keep it that way.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The update modules resolve the app folder from this, and `appPaths.js` would
// otherwise infer it from the working directory — which is not ours to assume.
process.env.RTDS_DCA_REPO_ROOT = repoRoot;

function localVersion() {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
    return String(parsed?.version ?? "").trim() || null;
  } catch {
    return null;
  }
}

async function main() {
  // A git checkout has the stronger mechanism available; `prepare-app.sh` uses it.
  if (fs.existsSync(path.join(repoRoot, ".git"))) {
    return;
  }
  if (
    fs.existsSync(path.join(repoRoot, "config", ".no-auto-update")) ||
    process.env.RTDS_DCA_NO_AUTO_UPDATE === "1"
  ) {
    return;
  }

  const { PUBLISHED_ARCHIVE_AVAILABLE, fetchPublishedVersion } = await import(
    "../server/src/updates/releaseInfo.js"
  );
  // The route is closed while the repository is private, and this runs on every single
  // launch: stop here rather than load the rest to be told there is nothing to fetch.
  if (!PUBLISHED_ARCHIVE_AVAILABLE) {
    return;
  }

  const { compareVersions } = await import("../server/src/updates/updateState.js");

  const current = localVersion();
  const { version: published } = await fetchPublishedVersion({ timeoutMs: 8_000 });

  // Strictly newer only. Equal, older, or unreadable on either side: do nothing.
  if (compareVersions(published, current) !== 1) {
    return;
  }

  const { applyPublishedArchive } = await import("../server/src/updates/applyArchive.js");
  const applied = await applyPublishedArchive({ timeoutMs: 90_000 });
  if (applied.ok && localVersion() !== current) {
    console.log(`Updated to version ${localVersion()}.`);
  }
}

try {
  await main();
} catch {
  // Deliberately silent. Whatever went wrong, the right answer is to start the app.
}
process.exit(0);
