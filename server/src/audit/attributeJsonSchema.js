import { addToSetMap } from "./analyzeInsights.js";
import {
  propertyValueStatsForBucket,
  trackCustomPropertyValue,
} from "./customEventPropertyValues.js";
import { serializeTrackedValueEntry } from "./attributeValues.js";

function tryParseJsonObject(text) {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // not JSON
  }
  return null;
}

/** Return a plain object when an attribute value is (or contains) JSON object data. */
export function parseJsonObjectAttributeValue(value, typeHint) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value;

  const type = String(typeHint ?? "").toUpperCase();
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.startsWith("{")) return null;
    if (type === "JSON" || type === "OBJECT" || trimmed.startsWith("{")) {
      return tryParseJsonObject(trimmed);
    }
  }
  return null;
}

function ensureJsonPropertyBucket(row) {
  if (!row.jsonProperties) {
    row.jsonProperties = {
      propertiesByDevice: {},
      propertyValueCounts: {},
    };
  }
  return row.jsonProperties;
}

/** Track top-level keys inside JSON attribute values (same shape as custom-event property buckets). */
export function trackAttributeJsonProperties(row, value, typeHint, deviceType) {
  const parsed = parseJsonObjectAttributeValue(value, typeHint);
  if (!parsed) return false;

  const bucket = ensureJsonPropertyBucket(row);
  const dt = String(deviceType ?? "UNKNOWN").toUpperCase();
  for (const prop of Object.keys(parsed)) {
    addToSetMap(bucket.propertiesByDevice, dt, prop);
    trackCustomPropertyValue(bucket, prop, parsed[prop], dt);
  }
  row.hasJsonValues = true;
  return true;
}

export function attributeJsonPropertyStatsForRow(row) {
  if (!row.jsonProperties) return [];
  return propertyValueStatsForBucket(row.jsonProperties);
}

export function serializeAttributeJsonPropertiesSidecar(jsonBucket) {
  const properties = {};
  for (const [prop, row] of Object.entries(jsonBucket?.propertyValueCounts ?? {})) {
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
  return Object.keys(properties).length ? properties : null;
}
