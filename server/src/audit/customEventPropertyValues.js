import fs from "node:fs";
import path from "node:path";
import {
  incTrackedValue,
  invalidateSidecarCache,
  mergeTrackedValueCounts,
  serializeAttributeValue as serializeTrackedValue,
  serializeTrackedValueEntry,
} from "./attributeValues.js";

/** Max distinct values stored per custom event property (memory + sidecar cap). */
export const MAX_UNIQUE_VALUES_PER_CUSTOM_PROPERTY = 200;

const sidecarCache = new Map();
const SIDECAR_CACHE_MAX = 8;

function ndjsonStem(ndjsonPath) {
  const base = String(ndjsonPath);
  if (base.endsWith(".ndjson")) return base.slice(0, -".ndjson".length);
  return base;
}

export function customPropertyValuesSidecarPath(ndjsonPath, scopeId = null) {
  if (!ndjsonPath) return null;
  const stem = ndjsonStem(ndjsonPath);
  if (scopeId) return `${stem}.custom-prop-values.scope-${scopeId}.json`;
  return `${stem}.custom-prop-values.json`;
}

export function customEventSidecarKey(sourceKey, eventName) {
  return `${sourceKey}::${eventName}`;
}

export function trackCustomPropertyValue(bucket, propertyName, value, deviceType) {
  if (!propertyName || value === undefined || value === null) return;
  const label = serializeTrackedValue(value);
  if (!label) return;

  if (!bucket.propertyValueCounts) bucket.propertyValueCounts = {};
  let row = bucket.propertyValueCounts[propertyName];
  if (!row) {
    row = { valueCounts: {} };
    bucket.propertyValueCounts[propertyName] = row;
  }

  incTrackedValue(row.valueCounts, label, deviceType, {
    maxUnique: MAX_UNIQUE_VALUES_PER_CUSTOM_PROPERTY,
    onCapped: () => {
      row.valuesCapped = true;
    },
  });
}

export function propertyValueStatsForBucket(bucket) {
  return Object.entries(bucket?.propertyValueCounts ?? {})
    .map(([property, data]) => ({
      property,
      trackedValueCount: Object.keys(data.valueCounts ?? {}).length,
      valuesCapped: Boolean(data.valuesCapped),
    }))
    .filter((p) => p.trackedValueCount > 0)
    .sort((a, b) => b.trackedValueCount - a.trackedValueCount || a.property.localeCompare(b.property));
}

function mergePropertyValueCounts(target, source) {
  for (const [prop, srcRow] of Object.entries(source?.propertyValueCounts ?? {})) {
    if (!target.propertyValueCounts) target.propertyValueCounts = {};
    let tgt = target.propertyValueCounts[prop];
    if (!tgt) {
      target.propertyValueCounts[prop] = {
        valueCounts: {},
        valuesCapped: Boolean(srcRow.valuesCapped),
      };
      tgt = target.propertyValueCounts[prop];
    }
    mergeTrackedValueCounts(tgt.valueCounts, srcRow.valueCounts ?? {});
    tgt.valuesCapped = Boolean(tgt.valuesCapped || srcRow.valuesCapped);
  }
}

export function mergeCustomEventPropertyValueCounts(target, source) {
  mergePropertyValueCounts(target, source);
}

function buildSidecarPayload(customBySource) {
  const events = {};
  for (const sourceKey of ["SDK", "API", "UNKNOWN"]) {
    for (const [eventName, data] of Object.entries(customBySource?.[sourceKey] ?? {})) {
      const props = data.propertyValueCounts ?? {};
      const properties = {};
      for (const [prop, row] of Object.entries(props)) {
        const entries = Object.entries(row.valueCounts ?? {})
          .map(([value, entry]) => {
            const serialized = serializeTrackedValueEntry(entry);
            return { value, ...serialized };
          })
          .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
        if (!entries.length) continue;
        properties[prop] = {
          uniqueCount: entries.length,
          capped: Boolean(row.valuesCapped),
          values: entries,
        };
      }
      if (!Object.keys(properties).length) continue;
      events[customEventSidecarKey(sourceKey, eventName)] = { properties };
    }
  }
  return { version: 2, events };
}

export function persistCustomPropertyValuesSidecar(ndjsonPath, customBySource, scopeId = null) {
  const sidecarPath = customPropertyValuesSidecarPath(ndjsonPath, scopeId);
  if (!sidecarPath) return null;

  const payload = buildSidecarPayload(customBySource);
  if (!Object.keys(payload.events).length) return null;

  fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
  fs.writeFileSync(sidecarPath, JSON.stringify(payload), "utf8");
  invalidateSidecarCache(sidecarPath);
  return path.basename(sidecarPath);
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

export function readCustomPropertyValuesPage(
  ndjsonPath,
  { source, event, property },
  { offset = 0, limit = 50, scopeId = null } = {},
) {
  const sidecarPath = customPropertyValuesSidecarPath(ndjsonPath, scopeId);
  if (!sidecarPath || !fs.existsSync(sidecarPath)) {
    return {
      source,
      event,
      property,
      total: 0,
      offset,
      limit,
      capped: false,
      values: [],
    };
  }
  const data = loadSidecar(sidecarPath);
  const eventKey = customEventSidecarKey(source, event);
  const propData = data?.events?.[eventKey]?.properties?.[property];
  if (!propData) {
    return {
      source,
      event,
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
    source,
    event,
    property,
    total: propData.uniqueCount ?? all.length,
    capped: Boolean(propData.capped),
    offset: safeOffset,
    limit: safeLimit,
    values: all.slice(safeOffset, safeOffset + safeLimit),
  };
}

export function removeCustomPropertyValuesSidecar(ndjsonPath, scopeId = null) {
  const sidecarPath = customPropertyValuesSidecarPath(ndjsonPath, scopeId);
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
