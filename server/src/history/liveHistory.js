import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { listActiveLiveStreams } from "../live/streamRegistry.js";
import { sanitizeProfileName } from "../storage/paths.js";

export const LIVE_FILE_RE =
  /^live-(.+)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.ndjson$/i;

export function isLiveHistoryName(name) {
  return LIVE_FILE_RE.test(String(name ?? ""));
}

export function parseLiveFileName(name) {
  const match = String(name ?? "").match(LIVE_FILE_RE);
  if (!match) return null;
  return { profileSlug: match[1], streamId: match[2] };
}

function shouldListLiveFile(filePath) {
  const resolved = path.resolve(filePath);
  for (const stream of listActiveLiveStreams()) {
    if (stream.filePath && path.resolve(stream.filePath) === resolved) {
      return Boolean(stream.storeRaw);
    }
  }
  return true;
}

async function summarizeLiveNdjson(filePath) {
  let totalEvents = 0;
  let firstOccurred = null;
  if (!fs.existsSync(filePath)) {
    return { totalEvents, firstOccurred };
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    totalEvents += 1;
    if (firstOccurred) continue;
    try {
      const event = JSON.parse(trimmed);
      firstOccurred = event?.occurred ?? event?.processed ?? null;
    } catch {
      // skip malformed first lines
    }
  }

  return { totalEvents, firstOccurred };
}

export async function listLiveHistoryItems(dir, knownProfiles = []) {
  if (!fs.existsSync(dir)) return [];

  const items = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !isLiveHistoryName(entry.name)) continue;
    const filePath = path.join(dir, entry.name);
    if (!shouldListLiveFile(filePath)) continue;

    const parsed = parseLiveFileName(entry.name);
    const stat = fs.statSync(filePath);
    const { totalEvents, firstOccurred } = await summarizeLiveNdjson(filePath);
    const profile =
      knownProfiles.find((name) => sanitizeProfileName(name) === parsed?.profileSlug) ??
      parsed?.profileSlug ??
      null;

    items.push({
      kind: "live",
      name: entry.name,
      profile,
      savedAt: new Date(stat.mtimeMs).toISOString(),
      totalEvents,
      firstOccurred,
      sizeBytes: stat.size,
    });
  }
  return items;
}
