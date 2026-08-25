import fs from "node:fs";
import path from "node:path";
import { serializeAttributeJsonPropertiesSidecar } from "./attributeJsonSchema.js";

/** Max distinct values stored per attribute key (memory + sidecar size cap). */
export const MAX_UNIQUE_VALUES_PER_ATTRIBUTE = 200;

const sidecarCache = new Map();
const SIDECAR_CACHE_MAX = 8;

function ndjsonStem(ndjsonPath) {
  const base = String(ndjsonPath);
  if (base.endsWith(".ndjson")) return base.slice(0, -".ndjson".length);
  return base;
}

export function attributeValuesSidecarPath(ndjsonPath, scopeId = null) {
  if (!ndjsonPath) return null;
  const stem = ndjsonStem(ndjsonPath);
  if (scopeId) return `${stem}.attr-values.scope-${scopeId}.json`;
  return `${stem}.attr-values.json`;
}

export function serializeAttributeValue(value) {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "string") return value.slice(0, 500);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return String(value).slice(0, 500);
  }
}

export function normalizeTrackedValueEntry(entry) {
  if (entry == null) return { count: 0, byDevice: {} };
  if (typeof entry === "number") return { count: entry, byDevice: {} };
  return {
    count: entry.count ?? 0,
    byDevice: { ...(entry.byDevice ?? {}) },
  };
}

export function mergeTrackedValueCounts(target, source) {
  for (const [label, srcEntry] of Object.entries(source ?? {})) {
    const src = normalizeTrackedValueEntry(srcEntry);
    if (!target[label]) {
      target[label] = { count: src.count, byDevice: { ...src.byDevice } };
      continue;
    }
    const tgt = normalizeTrackedValueEntry(target[label]);
    tgt.count += src.count;
    for (const [dt, count] of Object.entries(src.byDevice)) {
      tgt.byDevice[dt] = (tgt.byDevice[dt] ?? 0) + count;
    }
    target[label] = tgt;
  }
}

export function incTrackedValue(valueCounts, label, deviceType, { maxUnique, onCapped }) {
  if (!valueCounts[label]) {
    const unique = Object.keys(valueCounts).length;
    if (unique >= maxUnique) {
      onCapped?.();
      return false;
    }
    valueCounts[label] = { count: 0, byDevice: {} };
  }
  const entry = normalizeTrackedValueEntry(valueCounts[label]);
  valueCounts[label] = entry;
  const dt = String(deviceType ?? "UNKNOWN").toUpperCase();
  entry.count += 1;
  entry.byDevice[dt] = (entry.byDevice[dt] ?? 0) + 1;
  return true;
}

export function serializeTrackedValueEntry(entry) {
  const norm = normalizeTrackedValueEntry(entry);
  const deviceTypes = Object.entries(norm.byDevice ?? {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([deviceType, count]) => ({ deviceType, count }));
  return {
    count: norm.count,
    deviceTypes,
  };
}

export function trackAttributeValue(row, value, deviceType) {
  if (value === undefined || value === null) return;
  const label = serializeAttributeValue(value);
  if (!label) return;

  if (!row.valueCounts) row.valueCounts = {};
  incTrackedValue(row.valueCounts, label, deviceType, {
    maxUnique: MAX_UNIQUE_VALUES_PER_ATTRIBUTE,
    onCapped: () => {
      row.valuesCapped = true;
    },
  });
}

export function trackedValueCountForRow(row) {
  return Object.keys(row?.valueCounts ?? {}).length;
}

function buildSidecarPayload(attributeKeys) {
  const keys = {};
  for (const [normalized, data] of Object.entries(attributeKeys ?? {})) {
    const entries = Object.entries(data.valueCounts ?? {})
      .map(([value, entry]) => {
        const serialized = serializeTrackedValueEntry(entry);
        return { value, ...serialized };
      })
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    const jsonProperties = serializeAttributeJsonPropertiesSidecar(data.jsonProperties);
    if (!entries.length && !jsonProperties) continue;
    keys[normalized] = {
      uniqueCount: entries.length,
      capped: Boolean(data.valuesCapped),
    };
    if (entries.length) keys[normalized].values = entries;
    if (jsonProperties) keys[normalized].jsonProperties = jsonProperties;
  }
  return { version: 2, keys };
}

/**
 * Write attribute value histogram next to the NDJSON capture. Returns basename for report meta.
 */
export function persistAttributeValuesSidecar(ndjsonPath, attributeKeys, scopeId = null) {
  const sidecarPath = attributeValuesSidecarPath(ndjsonPath, scopeId);
  if (!sidecarPath) return null;

  const payload = buildSidecarPayload(attributeKeys);
  if (!Object.keys(payload.keys).length) return null;

  fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
  fs.writeFileSync(sidecarPath, JSON.stringify(payload), "utf8");
  invalidateSidecarCache(sidecarPath);
  return path.basename(sidecarPath);
}

export function invalidateSidecarCache(sidecarPath) {
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

/**
 * Paginated values for one normalized attribute key.
 */
export function readAttributeValuesPage(ndjsonPath, normalizedKey, { offset = 0, limit = 50, scopeId = null } = {}) {
  const sidecarPath = attributeValuesSidecarPath(ndjsonPath, scopeId);
  if (!sidecarPath || !fs.existsSync(sidecarPath)) {
    return {
      key: normalizedKey,
      total: 0,
      offset,
      limit,
      capped: false,
      values: [],
    };
  }
  const data = loadSidecar(sidecarPath);
  const keyData = data?.keys?.[normalizedKey];
  if (!keyData) {
    return {
      key: normalizedKey,
      total: 0,
      offset,
      limit,
      capped: false,
      values: [],
    };
  }

  const all = keyData.values ?? [];
  const safeOffset = Math.max(0, offset);
  const safeLimit = Math.min(100, Math.max(1, limit));

  return {
    key: normalizedKey,
    total: keyData.uniqueCount ?? all.length,
    capped: Boolean(keyData.capped),
    offset: safeOffset,
    limit: safeLimit,
    values: all.slice(safeOffset, safeOffset + safeLimit),
  };
}

export function readAttributeJsonPropertyValuesPage(
  ndjsonPath,
  normalizedKey,
  property,
  { offset = 0, limit = 50, scopeId = null } = {},
) {
  const sidecarPath = attributeValuesSidecarPath(ndjsonPath, scopeId);
  if (!sidecarPath || !fs.existsSync(sidecarPath)) {
    return {
      key: normalizedKey,
      property,
      total: 0,
      offset,
      limit,
      capped: false,
      values: [],
    };
  }
  const data = loadSidecar(sidecarPath);
  const propData = data?.keys?.[normalizedKey]?.jsonProperties?.[property];
  if (!propData) {
    return {
      key: normalizedKey,
      property,
      total: 0,
      offset,
      limit,
      capped: false,
      values: [],
    };
  }

  const all = propData.values ?? [];
  const safeOffset = Math.max(0, offset);
  const safeLimit = Math.min(100, Math.max(1, limit));

  return {
    key: normalizedKey,
    property,
    total: propData.uniqueCount ?? all.length,
    capped: Boolean(propData.capped),
    offset: safeOffset,
    limit: safeLimit,
    values: all.slice(safeOffset, safeOffset + safeLimit),
  };
}

export function removeAttributeValuesSidecar(ndjsonPath, scopeId = null) {
  const sidecarPath = attributeValuesSidecarPath(ndjsonPath, scopeId);
  if (!sidecarPath) return;
  try {
    fs.unlinkSync(sidecarPath);
    invalidateSidecarCache(sidecarPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  try {
    fs.unlinkSync(`${sidecarPath}.tmp`);
  } catch {
    // ignore
  }
}

