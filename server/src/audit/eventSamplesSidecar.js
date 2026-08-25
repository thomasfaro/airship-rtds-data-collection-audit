import fs from "node:fs";
import path from "node:path";
import { safeJsonStringify } from "./reportJson.js";

const sidecarCache = new Map();
const SIDECAR_CACHE_MAX = 8;

function ndjsonStem(ndjsonPath) {
  const base = String(ndjsonPath);
  if (base.endsWith(".ndjson")) return base.slice(0, -".ndjson".length);
  return base;
}

export function eventSamplesSidecarPath(ndjsonPath, scopeId = null) {
  if (!ndjsonPath) return null;
  const stem = ndjsonStem(ndjsonPath);
  if (scopeId && scopeId !== "baseline") {
    return `${stem}.event-samples.scope-${scopeId}.json`;
  }
  return `${stem}.event-samples.json`;
}

export function invalidateEventSamplesSidecarCache(sidecarPath) {
  if (!sidecarPath) return;
  sidecarCache.delete(path.resolve(sidecarPath));
}

function loadSidecar(sidecarPath) {
  const resolved = path.resolve(sidecarPath);
  const stat = fs.statSync(resolved);
  const cached = sidecarCache.get(resolved);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.data;

  const raw = fs.readFileSync(resolved, "utf8");
  const data = JSON.parse(raw);
  sidecarCache.set(resolved, { mtimeMs: stat.mtimeMs, data });
  if (sidecarCache.size > SIDECAR_CACHE_MAX) {
    const oldest = sidecarCache.keys().next().value;
    sidecarCache.delete(oldest);
  }
  return data;
}

/** Persist example-event buckets next to the NDJSON capture. Returns basename for report meta. */
export function persistEventSamplesSidecar(ndjsonPath, eventSamples, scopeId = null) {
  const sidecarPath = eventSamplesSidecarPath(ndjsonPath, scopeId);
  if (!sidecarPath || !Array.isArray(eventSamples) || eventSamples.length === 0) return null;

  const payload = {
    version: 1,
    savedAt: new Date().toISOString(),
    samples: eventSamples,
  };

  fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
  const tmp = `${sidecarPath}.tmp`;
  fs.writeFileSync(tmp, safeJsonStringify(payload), "utf8");
  fs.renameSync(tmp, sidecarPath);
  invalidateEventSamplesSidecarCache(sidecarPath);
  return path.basename(sidecarPath);
}

export function loadEventSamplesSidecar(ndjsonPath, scopeId = null) {
  const sidecarPath = eventSamplesSidecarPath(ndjsonPath, scopeId);
  if (!sidecarPath || !fs.existsSync(sidecarPath)) return null;
  try {
    const data = loadSidecar(sidecarPath);
    return Array.isArray(data?.samples) ? data.samples : null;
  } catch {
    return null;
  }
}

export function removeEventSamplesSidecar(ndjsonPath, scopeId = null) {
  const sidecarPath = eventSamplesSidecarPath(ndjsonPath, scopeId);
  if (!sidecarPath) return;
  try {
    fs.unlinkSync(sidecarPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  try {
    fs.unlinkSync(`${sidecarPath}.tmp`);
  } catch {
    // ignore
  }
  invalidateEventSamplesSidecarCache(sidecarPath);
}
