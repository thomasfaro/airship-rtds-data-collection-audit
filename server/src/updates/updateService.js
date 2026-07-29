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
import { buildUpdateState } from "./updateState.js";

/**
 * Keeping the tool up to date without anyone having to think about it.
 *
 * Three jobs: know whether a newer version exists, fast-forward onto it on request,
 * and hand the process over to a fresh one. All three are best-effort — the audit is
 * what matters, so a failed check or a refused pull is reported and then forgotten.
 */

const REMOTE_TTL_MS = 6 * 60 * 60 * 1_000;

let remote = { checkedAt: null, behind: null, error: null };
let inFlight = null;

function isStale(now) {
  if (!remote.checkedAt) {
    return true;
  }
  return now - Date.parse(remote.checkedAt) > REMOTE_TTL_MS;
}

/**
 * Ask the remote what it has. Deduplicated: several pollers arriving together share
 * one fetch instead of stacking network calls on top of each other.
 */
export function refreshRemote() {
  if (inFlight) {
    return inFlight;
  }
  inFlight = (async () => {
    const branch = gitBranch();
    if (!branch) {
      remote = { checkedAt: new Date().toISOString(), behind: null, error: null };
      return remote;
    }
    const fetched = await gitFetch(branch);
    remote = {
      checkedAt: new Date().toISOString(),
      behind: fetched.ok ? commitsBehind(branch) : null,
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

  if (tracked && (force || isStale(now))) {
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
  });

  return {
    ok: true,
    running,
    disk,
    tracked,
    clean,
    branch: tracked ? gitBranch() : null,
    behind: remote.behind,
    checkedAt: remote.checkedAt,
    checkError: remote.error,
    ...decision,
  };
}

/**
 * Fast-forward the folder onto the remote branch.
 *
 * Refuses out loud rather than guessing: the caller shows the reason, which is far
 * better than an update that silently did nothing, or worse, one that discarded work.
 */
export async function applyUpdate() {
  if (!hasGitRepo()) {
    return { ok: false, error: "This copy was not installed with git, so it cannot update itself." };
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
  remote = { checkedAt: new Date().toISOString(), behind: commitsBehind(branch), error: null };
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
  remote = { checkedAt: null, behind: null, error: null };
  inFlight = null;
}
