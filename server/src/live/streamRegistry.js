import path from "node:path";
import { removeLiveRawFile } from "./paths.js";

/** @type {Map<string, { filePath: string | null, profileName: string, storeRaw: boolean }>} */
const streams = new Map();

/** Test helper: drop every registered stream without touching files. */
export function resetLiveStreamsForTests() {
  streams.clear();
}

export function registerLiveStream(streamId, { filePath, profileName, storeRaw = false }) {
  streams.set(streamId, { filePath, profileName, storeRaw: Boolean(storeRaw) });
}

export function getLiveStream(streamId) {
  const entry = streams.get(String(streamId ?? ""));
  if (!entry) return null;
  return { streamId: String(streamId), ...entry };
}

export function listActiveLiveStreams() {
  return [...streams.entries()].map(([streamId, entry]) => ({
    streamId,
    ...entry,
  }));
}

export function cleanupLiveStream(streamId) {
  const entry = streams.get(streamId);
  if (!entry) return { deleted: false };
  streams.delete(streamId);
  if (!entry.filePath || entry.storeRaw) {
    return { deleted: false, kept: Boolean(entry.storeRaw) };
  }
  return { deleted: removeLiveRawFile(entry.filePath) };
}

export function cleanupLiveStreamsForProfile(profileName) {
  let deleted = 0;
  for (const [streamId, entry] of streams.entries()) {
    if (entry.profileName !== profileName) continue;
    const result = cleanupLiveStream(streamId);
    if (result.deleted) deleted += 1;
  }
  return deleted;
}

export function getActiveLiveRawPaths() {
  const paths = [];
  for (const entry of streams.values()) {
    if (entry.filePath) paths.push(entry.filePath);
  }
  return paths;
}

export function isLiveFileLocked(filePath) {
  if (!filePath) return false;
  const resolved = path.resolve(filePath);
  for (const entry of streams.values()) {
    if (entry.filePath && path.resolve(entry.filePath) === resolved) return true;
  }
  return false;
}
