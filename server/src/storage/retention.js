import fs from "node:fs";
import path from "node:path";
import { storedFilesDir } from "../appPaths.js";
import { isLiveFileLocked } from "../live/streamRegistry.js";
import { isLiveHistoryName } from "../history/liveHistory.js";

/**
 * Saved audits hold a client's personal data — value histograms, event samples, and the raw NDJSON
 * of a live session when someone ticked "store raw". Nothing used to remove them, so a working
 * machine accumulated several clients' data indefinitely. This is the expiry that stops that.
 */
export const DEFAULT_RETENTION_DAYS = 30;

const REPORT_SUFFIX = ".audit-report.json";
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days to keep stored captures, or null to keep them forever.
 *
 * An unreadable value disables expiry rather than falling back to the default: deleting a client
 * deliverable because a setting was mistyped is the one outcome worth ruling out, and the warning
 * says so where a silent fallback would not.
 */
export function resolveRetentionDays(env = process.env) {
  const raw = String(env.RTDS_DCA_RETENTION_DAYS ?? "").trim().toLowerCase();
  if (!raw) return DEFAULT_RETENTION_DAYS;
  if (raw === "0" || raw === "off" || raw === "never") return null;

  const days = Number.parseInt(raw, 10);
  if (!Number.isFinite(days) || days <= 0 || String(days) !== raw) {
    console.warn(
      `[retention] RTDS_DCA_RETENTION_DAYS is "${raw}", which is not a number of days. ` +
        "Nothing will be deleted until it is a positive whole number, or 0 to switch expiry off.",
    );
    return null;
  }
  return days;
}

/**
 * Which entries are past the window. Pure, so the policy is testable without a disk.
 * @param {{name: string, kind: string, mtimeMs: number}[]} entries
 * @param {{nowMs: number, retentionDays: number | null}} options
 */
export function selectExpiredEntries(entries, { nowMs, retentionDays }) {
  if (retentionDays == null || !Number.isFinite(retentionDays) || retentionDays <= 0) return [];
  const cutoff = nowMs - retentionDays * DAY_MS;
  return entries.filter((entry) => Number.isFinite(entry.mtimeMs) && entry.mtimeMs < cutoff);
}

/** Everything on disk that expiry can act on, with the age it will be judged on. */
export function listStoredEntries(dir = storedFilesDir()) {
  if (!fs.existsSync(dir)) return [];

  const entries = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!item.isFile()) continue;

    const isReport = item.name.endsWith(REPORT_SUFFIX);
    const isLive = isLiveHistoryName(item.name);
    if (!isReport && !isLive) continue;

    let mtimeMs;
    try {
      mtimeMs = fs.statSync(path.join(dir, item.name)).mtimeMs;
    } catch {
      continue;
    }

    entries.push(
      isReport
        ? { name: item.name, kind: "audit", stem: item.name.slice(0, -REPORT_SUFFIX.length), mtimeMs }
        : { name: item.name, kind: "live", stem: null, mtimeMs },
    );
  }
  return entries;
}

/**
 * Remove every file belonging to one capture, not just the four known suffixes: sidecars also come
 * in `.scope-{id}.json` variants, and leaving one behind would leave the client's values behind with
 * it. The trailing dot keeps `capture-a-b-c` from matching `capture-a-b-c1`.
 */
function removeCaptureGroup(dir, stem) {
  let removed = 0;
  let bytes = 0;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!item.isFile() || !item.name.startsWith(`${stem}.`)) continue;
    const filePath = path.join(dir, item.name);
    try {
      const { size } = fs.statSync(filePath);
      fs.unlinkSync(filePath);
      removed += 1;
      bytes += size;
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.warn(`[retention] could not delete ${item.name}: ${error.message}`);
      }
    }
  }
  return { removed, bytes };
}

function removeLiveFile(dir, name) {
  const filePath = path.join(dir, name);
  if (isLiveFileLocked(filePath)) return { removed: 0, bytes: 0, locked: true };
  try {
    const { size } = fs.statSync(filePath);
    fs.unlinkSync(filePath);
    return { removed: 1, bytes: size, locked: false };
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`[retention] could not delete ${name}: ${error.message}`);
    }
    return { removed: 0, bytes: 0, locked: false };
  }
}

/**
 * Delete stored captures older than the retention window. Called once at startup, which is often
 * enough for a tool that is started by hand and needs no scheduler.
 */
export function purgeExpiredCaptures({
  dir = storedFilesDir(),
  nowMs = Date.now(),
  retentionDays = resolveRetentionDays(),
} = {}) {
  if (retentionDays == null) {
    return { skipped: true, retentionDays: null, audits: 0, liveFiles: 0, files: 0, bytes: 0 };
  }

  const expired = selectExpiredEntries(listStoredEntries(dir), { nowMs, retentionDays });
  const result = { skipped: false, retentionDays, audits: 0, liveFiles: 0, files: 0, bytes: 0 };

  for (const entry of expired) {
    if (entry.kind === "audit") {
      const { removed, bytes } = removeCaptureGroup(dir, entry.stem);
      if (removed > 0) result.audits += 1;
      result.files += removed;
      result.bytes += bytes;
    } else {
      const { removed, bytes } = removeLiveFile(dir, entry.name);
      if (removed > 0) result.liveFiles += 1;
      result.files += removed;
      result.bytes += bytes;
    }
  }
  return result;
}
