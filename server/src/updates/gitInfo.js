import fs from "node:fs";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { repoRoot } from "../appPaths.js";

const execFileAsync = promisify(execFile);

/**
 * The few git questions the app asks about itself, each one bounded and each one
 * allowed to fail. Nothing here is essential: a ZIP install has no git folder, a
 * locked-down machine may have no git at all, and the network may be gone. Every
 * function returns null or false rather than throwing, because "we don't know which
 * version is out there" must never be louder than the audit the user came for.
 *
 * Two rules hold everywhere below:
 *   - a timeout, so a stalled transfer cannot pin a request open
 *   - no interactive prompt, so a missing credential fails instead of hanging forever
 */

const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
  GIT_SSH_COMMAND: "ssh -o BatchMode=yes",
  // Drop a transfer that stops moving instead of waiting on a dead network.
  GIT_HTTP_LOW_SPEED_LIMIT: "1000",
  GIT_HTTP_LOW_SPEED_TIME: "10",
};

const CANDIDATE_BINARIES = ["git", "/usr/bin/git"];

let resolvedBinary;

/** First git that answers `--version`, or null. Resolved once. */
function gitBinary() {
  if (resolvedBinary !== undefined) {
    return resolvedBinary;
  }
  resolvedBinary = null;
  for (const candidate of CANDIDATE_BINARIES) {
    try {
      execFileSync(candidate, ["--version"], {
        cwd: repoRoot,
        env: GIT_ENV,
        timeout: 3_000,
        stdio: ["ignore", "ignore", "ignore"],
      });
      resolvedBinary = candidate;
      break;
    } catch {
      // Try the next one.
    }
  }
  return resolvedBinary;
}

function runGit(args, { timeoutMs = 5_000 } = {}) {
  const binary = gitBinary();
  if (!binary) {
    return { ok: false, output: "", error: "git is not available" };
  }
  try {
    const output = execFileSync(binary, args, {
      cwd: repoRoot,
      env: GIT_ENV,
      timeout: timeoutMs,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, output: (output ?? "").trim(), error: null };
  } catch (error) {
    const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
    return { ok: false, output: "", error: stderr || error?.message || "git failed" };
  }
}

/**
 * Same contract as runGit, off the main thread. Reserved for the two commands that
 * touch the network: twenty blocking seconds would stall every capture stream the
 * server is holding open.
 */
async function runGitAsync(args, { timeoutMs = 20_000 } = {}) {
  const binary = gitBinary();
  if (!binary) {
    return { ok: false, output: "", error: "git is not available" };
  }
  try {
    const { stdout } = await execFileAsync(binary, args, {
      cwd: repoRoot,
      env: GIT_ENV,
      timeout: timeoutMs,
      encoding: "utf8",
    });
    return { ok: true, output: (stdout ?? "").trim(), error: null };
  } catch (error) {
    const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
    return { ok: false, output: "", error: stderr || error?.message || "git failed" };
  }
}

/** Is this folder a git checkout, or an unpacked ZIP? */
export function hasGitRepo() {
  return fs.existsSync(path.join(repoRoot, ".git")) && Boolean(gitBinary());
}

/** `{ short, full, date }` of the checked-out commit, or null. */
export function gitHead() {
  if (!hasGitRepo()) {
    return null;
  }
  const result = runGit(["log", "-1", "--format=%h%x09%H%x09%cI"]);
  if (!result.ok || !result.output) {
    return null;
  }
  const [short, full, date] = result.output.split("\t");
  return { short: short || null, full: full || null, date: date || null };
}

/** Current branch name, or null when detached or unavailable. */
export function gitBranch() {
  if (!hasGitRepo()) {
    return null;
  }
  const result = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!result.ok || !result.output || result.output === "HEAD") {
    return null;
  }
  return result.output;
}

/**
 * True only when git is certain nothing local would be disturbed. Uncertainty counts
 * as dirty: an update that throws away someone's edit is unforgivable, being one
 * version behind is not.
 */
export function isWorkingTreeClean() {
  if (!hasGitRepo()) {
    return false;
  }
  const result = runGit(["status", "--porcelain"]);
  return result.ok && result.output === "";
}

/**
 * Refresh what we know about the remote branch. Read-only: fetch never touches the
 * working tree, so this is safe even in a folder with local changes.
 */
export async function gitFetch(branch, { timeoutMs = 20_000 } = {}) {
  if (!hasGitRepo() || !branch) {
    return { ok: false, error: "no branch to fetch" };
  }
  const result = await runGitAsync(["fetch", "--quiet", "origin", branch], { timeoutMs });
  return { ok: result.ok, error: result.error };
}

/** How many commits the local branch is behind its remote, or null when unknown. */
export function commitsBehind(branch) {
  if (!hasGitRepo() || !branch) {
    return null;
  }
  const result = runGit(["rev-list", "--count", `HEAD..origin/${branch}`]);
  if (!result.ok) {
    return null;
  }
  const count = Number.parseInt(result.output, 10);
  return Number.isFinite(count) ? count : null;
}

/**
 * Fast-forward the checkout onto the remote branch. Never merges, never rebases,
 * never rewrites: if the two have diverged, git refuses and so do we.
 */
export async function pullFastForward(branch, { timeoutMs = 60_000 } = {}) {
  if (!hasGitRepo() || !branch) {
    return { ok: false, error: "no branch to update" };
  }
  const result = await runGitAsync(["pull", "--ff-only", "--quiet", "origin", branch], {
    timeoutMs,
  });
  return { ok: result.ok, error: result.error };
}

/** Test hook: forget which git binary was found. */
export function resetGitBinary() {
  resolvedBinary = undefined;
}
