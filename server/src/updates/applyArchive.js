import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { repoRoot } from "../appPaths.js";
import { openPublishedArchive } from "./releaseInfo.js";

const execFileAsync = promisify(execFile);

/**
 * Replacing the app folder's code with the published archive, for installs with no git.
 *
 * This is the one place in the tool that overwrites its own source, so it is written to
 * be boring and to refuse early. A fast-forward gives ancestry for free — an archive
 * gives nothing, so every guarantee here is explicit:
 *
 *   - **Nothing is touched until everything is downloaded and checked.** Extraction
 *     goes to a temp folder; the folder itself is only written once the tree is known
 *     good. A half-applied update is the one outcome worse than no update.
 *   - **The destination is recomputed and re-checked for every single file.** Whatever
 *     tar did or did not refuse, a member can only ever land strictly inside the app
 *     folder. That check does not trust the archive, and does not trust tar either.
 *   - **Symlinks abort the whole update.** The repository tracks none, so one appearing
 *     in the archive is not a case to handle — it is a reason to stop.
 *   - **User data is never a destination.** Tokens and saved audits are not in the
 *     archive, so a naive "replace the folder" would delete them. Only paths that pass
 *     `isProtectedPath` are written, and that list fails closed.
 *
 * Files removed upstream are deliberately left behind rather than deleted. An orphaned
 * module nobody imports is inert; a delete loop pointed at the wrong path is not.
 */

/** Downloading more than this means something is wrong, so stop rather than fill the disk. */
const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;

/**
 * Paths the updater must never write to, matched on the archive-relative path.
 *
 * Two kinds live here: what belongs to the user (tokens, saved audits, local settings)
 * and what belongs to the install rather than the source (installed dependencies, the
 * built interface, the git folder). Everything else in the archive is code.
 */
const PROTECTED_PREFIXES = [
  "config",
  ".stored-files",
  ".git",
  "node_modules",
  ".node",
  "frontend/dist",
  "frontend/node_modules",
  "server/node_modules",
];

const PROTECTED_FILES = ["server/.env", "frontend/.env.local"];

function toPosix(relative) {
  return String(relative ?? "").split(path.sep).join("/");
}

/**
 * True when a member's relative path is one we are willing to write at all: relative,
 * no traversal, no NUL, not empty. Purely textual — the resolved-path check in
 * `copyInto` is the enforcement, this is the early refusal.
 */
export function isSafeArchivePath(relative) {
  const posix = toPosix(relative);
  if (!posix || posix.includes("\0")) {
    return false;
  }
  if (path.posix.isAbsolute(posix) || /^[a-zA-Z]:/.test(posix) || posix.startsWith("\\")) {
    return false;
  }
  return !posix.split("/").some((segment) => segment === ".." || segment === "");
}

/** True when a path belongs to the user or to the install, and must be left alone. */
export function isProtectedPath(relative) {
  const posix = toPosix(relative);
  if (PROTECTED_FILES.includes(posix)) {
    return true;
  }
  return PROTECTED_PREFIXES.some((prefix) => posix === prefix || posix.startsWith(`${prefix}/`));
}

/** Both questions at once: may this archive member be written into the app folder? */
export function isWritablePath(relative) {
  return isSafeArchivePath(relative) && !isProtectedPath(relative);
}

async function downloadTo(filePath, { timeoutMs }) {
  const { ok, response, error } = await openPublishedArchive({ timeoutMs });
  if (!ok) {
    return { ok: false, error: `could not download the update: ${error}` };
  }

  const declared = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > MAX_ARCHIVE_BYTES) {
    return { ok: false, error: "the published archive is implausibly large" };
  }

  let written = 0;
  const capped = new Readable({
    read() {},
  });

  try {
    const reader = response.body.getReader();
    const pump = (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        written += value.byteLength;
        if (written > MAX_ARCHIVE_BYTES) {
          await reader.cancel().catch(() => {});
          capped.destroy(new Error("the published archive exceeded the size limit"));
          return;
        }
        capped.push(Buffer.from(value));
      }
      capped.push(null);
    })();

    await pipeline(capped, fs.createWriteStream(filePath));
    await pump;
  } catch (streamError) {
    return { ok: false, error: String(streamError?.message ?? streamError) };
  }

  return written > 0 ? { ok: true, bytes: written } : { ok: false, error: "the download was empty" };
}

/**
 * Walk an extracted tree and return its regular files, or refuse.
 *
 * `lstat` throughout, so a symlink is seen as a symlink rather than as whatever it
 * points at — which is the entire reason this walk exists instead of a glob.
 */
async function collectFiles(root) {
  const files = [];

  async function walk(absolute, relative) {
    const entries = await fsp.readdir(absolute, { withFileTypes: true });
    for (const entry of entries) {
      const childAbsolute = path.join(absolute, entry.name);
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;

      if (entry.isSymbolicLink()) {
        throw new Error(`the archive contains a symbolic link (${childRelative})`);
      }
      if (entry.isDirectory()) {
        await walk(childAbsolute, childRelative);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(`the archive contains an unexpected entry (${childRelative})`);
      }
      files.push(childRelative);
    }
  }

  await walk(root, "");
  return files;
}

/**
 * Copy the vetted files into the app folder.
 *
 * The resolved destination is compared against the app folder for every file. This is
 * the check that actually holds: it does not care what the archive claimed or what tar
 * chose to allow.
 */
async function copyInto(extractedRoot, files) {
  const boundary = repoRoot.endsWith(path.sep) ? repoRoot : repoRoot + path.sep;
  let copied = 0;

  for (const relative of files) {
    if (!isWritablePath(relative)) {
      continue;
    }
    const destination = path.resolve(repoRoot, relative);
    if (!destination.startsWith(boundary)) {
      throw new Error(`refused a file that resolved outside the app folder (${relative})`);
    }
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.copyFile(path.join(extractedRoot, relative), destination);
    copied += 1;
  }

  return copied;
}

/**
 * Download the published archive and copy its code over the app folder.
 *
 * The caller decides *whether* to do this — `updateState.js` owns the anti-downgrade
 * guard. This function owns doing it without damage.
 */
export async function applyPublishedArchive({ timeoutMs = 120_000 } = {}) {
  const workspace = await fsp.mkdtemp(path.join(os.tmpdir(), "rtds-dca-update-"));
  const archivePath = path.join(workspace, "source.tar.gz");
  const extractRoot = path.join(workspace, "tree");

  try {
    await fsp.mkdir(extractRoot);

    const downloaded = await downloadTo(archivePath, { timeoutMs });
    if (!downloaded.ok) {
      return { ok: false, error: downloaded.error };
    }

    /*
     * GitHub wraps the tree in a single `repo-sha/` directory, hence the strip. The
     * extraction target is an empty directory of our own making, so even a member that
     * tar mishandled has nothing of ours to overwrite — and the copy step re-checks
     * every path anyway.
     */
    try {
      await execFileAsync("tar", ["-xzf", archivePath, "-C", extractRoot, "--strip-components=1"], {
        timeout: timeoutMs,
      });
    } catch (tarError) {
      return { ok: false, error: `could not unpack the update: ${String(tarError?.message ?? tarError)}` };
    }

    let files;
    try {
      files = await collectFiles(extractRoot);
    } catch (walkError) {
      return { ok: false, error: `refused the update: ${String(walkError?.message ?? walkError)}` };
    }

    // A tree with no package.json is not this repository, whatever else it may be.
    if (!files.includes("package.json")) {
      return { ok: false, error: "the downloaded archive does not look like the app" };
    }

    const copied = await copyInto(extractRoot, files);
    return { ok: true, files: copied };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  } finally {
    await fsp.rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}
