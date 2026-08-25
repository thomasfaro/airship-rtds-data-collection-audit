import path from "node:path";
import { spawn } from "node:child_process";
import { repoRoot } from "../appPaths.js";
import { diskVersion, runningVersion } from "../version.js";
import {
  commitsBehind,
  gitBranch,
  gitFetch,
  hasGitRepo,
  isWorkingTreeClean,
  pullFastForward,
} from "./gitInfo.js";
import { applyPublishedArchive } from "./applyArchive.js";
import { fetchPublishedVersion } from "./releaseInfo.js";
import { buildUpdateState, compareVersions } from "./updateState.js";

/**
 * Keeping the tool up to date without anyone having to think about it.
 *
 * Three jobs: know whether a newer version exists, move onto it on request, and hand
 * the process over to a fresh one. All three are best-effort — the audit is what
 * matters, so a failed check or a refused update is reported and then forgotten.
 *
 * There are two ways to do the middle job, and which one applies is not a preference:
 *
 *   - **A git checkout fast-forwards.** `--ff-only` proves the new history contains the
 *     old one, so a rewritten history or an older commit is refused by git itself.
 *   - **A folder with no git replaces its files from the published archive.** That has
 *     no ancestry to check, which is exactly why `updateState.js` will only ever offer
 *     it for a strictly newer version number.
 *
 * The stronger mechanism is used wherever it exists. The weaker one only reaches
 * installs that, until now, could not update at all.
 */

const REMOTE_TTL_MS = 6 * 60 * 60 * 1_000;

let remote = { checkedAt: null, behind: null, publishedVersion: null, error: null };
let inFlight = null;

function isStale(now) {
  if (!remote.checkedAt) {
    return true;
  }
  return now - Date.parse(remote.checkedAt) > REMOTE_TTL_MS;
}

/**
 * Ask upstream what it has, by whichever route this install can use. Deduplicated:
 * several pollers arriving together share one check instead of stacking network calls.
 */
export function refreshRemote() {
  if (inFlight) {
    return inFlight;
  }
  inFlight = (async () => {
    const checkedAt = new Date().toISOString();

    if (!hasGitRepo()) {
      const published = await fetchPublishedVersion();
      remote = {
        checkedAt,
        behind: null,
        publishedVersion: published.version,
        error: published.error,
      };
      return remote;
    }

    const branch = gitBranch();
    if (!branch) {
      remote = { checkedAt, behind: null, publishedVersion: null, error: null };
      return remote;
    }
    const fetched = await gitFetch(branch);
    remote = {
      checkedAt,
      behind: fetched.ok ? commitsBehind(branch) : null,
      publishedVersion: null,
      error: fetched.ok ? null : fetched.error,
    };
    return remote;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * Everything the banner needs, in one call.
 *
 * @param {{force?: boolean, now?: number}} options force skips the cache TTL
 */
export async function getUpdateStatus({ force = false, now = Date.now() } = {}) {
  const tracked = hasGitRepo();

  if (force || isStale(now)) {
    await refreshRemote();
  }

  const running = runningVersion();
  const disk = diskVersion();
  const clean = tracked ? isWorkingTreeClean() : false;
  const decision = buildUpdateState({
    running,
    disk,
    tracked,
    clean,
    behind: remote.behind,
    remoteVersion: remote.publishedVersion,
  });

  return {
    ok: true,
    running,
    disk,
    tracked,
    clean,
    branch: tracked ? gitBranch() : null,
    behind: remote.behind,
    publishedVersion: remote.publishedVersion,
    checkedAt: remote.checkedAt,
    checkError: remote.error,
    ...decision,
  };
}

/**
 * The archive route, for a folder with no git.
 *
 * The version is re-read from upstream here rather than taken from the cached check.
 * Applying is the consequential step, so it is gated on a fact fetched moments before
 * acting, not on one that may be six hours old — and the comparison is the same tested
 * `compareVersions` the banner used, so the two cannot disagree about what "newer" is.
 */
async function applyArchiveUpdate() {
  const before = diskVersion();
  const published = await fetchPublishedVersion();
  if (!published.version) {
    return { ok: false, error: `Could not reach the repository: ${published.error}` };
  }

  const ordering = compareVersions(published.version, before.version);
  if (ordering === null) {
    return { ok: false, error: "Could not compare the published version with this one." };
  }
  if (ordering <= 0) {
    // Not an error worth alarming anyone with: this is the guard doing its job.
    remote = {
      checkedAt: new Date().toISOString(),
      behind: null,
      publishedVersion: published.version,
      error: null,
    };
    return { ok: true, updated: false, from: before, to: before };
  }

  const applied = await applyPublishedArchive();
  if (!applied.ok) {
    return { ok: false, error: `Update refused: ${applied.error}` };
  }

  const after = diskVersion();
  remote = {
    checkedAt: new Date().toISOString(),
    behind: null,
    publishedVersion: published.version,
    error: null,
  };
  return { ok: true, updated: before.version !== after.version, from: before, to: after };
}

/**
 * Replace the folder's code with the published version, by whichever route applies.
 *
 * Refuses out loud rather than guessing: the caller shows the reason, which is far
 * better than an update that silently did nothing, or worse, one that discarded work.
 */
export async function applyUpdate() {
  if (!hasGitRepo()) {
    return applyArchiveUpdate();
  }
  const branch = gitBranch();
  if (!branch) {
    return { ok: false, error: "This copy is not on a branch, so it cannot fast-forward." };
  }
  if (!isWorkingTreeClean()) {
    return {
      ok: false,
      error: "This folder has local changes. Updating would risk losing them.",
    };
  }

  const before = diskVersion();
  const fetched = await gitFetch(branch);
  if (!fetched.ok) {
    return { ok: false, error: `Could not reach the repository: ${fetched.error}` };
  }
  const pulled = await pullFastForward(branch);
  if (!pulled.ok) {
    return { ok: false, error: `Update refused: ${pulled.error}` };
  }

  const after = diskVersion();
  remote = {
    checkedAt: new Date().toISOString(),
    behind: commitsBehind(branch),
    publishedVersion: null,
    error: null,
  };
  return {
    ok: true,
    updated: before.commit !== after.commit,
    from: before,
    to: after,
  };
}

function restartCommand() {
  if (process.platform === "win32") {
    return {
      command: "powershell",
      args: [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.join(repoRoot, "scripts", "Restart-App.ps1"),
      ],
    };
  }
  return { command: "/bin/bash", args: [path.join(repoRoot, "scripts", "restart-app.sh")] };
}

/**
 * Hand over to a fresh server.
 *
 * The helper we spawn waits for this process to release the port before starting the
 * replacement, which is the whole reason it exists: doing it in-process would either
 * race against our own listener or leave nothing running at all. Detached and
 * unreferenced, so it survives the exit that follows.
 *
 * @param {{exitDelayMs?: number, spawnImpl?: Function, exit?: Function}} options
 */
export function scheduleRestart({
  exitDelayMs = 300,
  spawnImpl = spawn,
  exit = (code) => process.exit(code),
} = {}) {
  const { command, args } = restartCommand();
  try {
    const child = spawnImpl(command, args, {
      cwd: repoRoot,
      detached: true,
      stdio: "ignore",
      env: { ...process.env, PORT: String(process.env.PORT || 3011) },
    });
    child.unref();
  } catch (error) {
    return { ok: false, error: error?.message || "Could not start the replacement server." };
  }

  const timer = setTimeout(() => exit(0), exitDelayMs);
  // Do not let a pending exit keep an otherwise idle process alive on its own.
  timer.unref?.();
  return { ok: true };
}

/** Test hook: forget the cached remote check. */
export function resetRemoteCache() {
  remote = { checkedAt: null, behind: null, publishedVersion: null, error: null };
  inFlight = null;
}
