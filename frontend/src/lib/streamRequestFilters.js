import { filterStreamTypesCsv } from "./eventRegistry.js";
import { joinAudienceValues, splitAudienceValues } from "./streamAudienceFilters.js";

export const ATTRIBUTE_OPERATION_TYPE = "ATTRIBUTE_OPERATION";

export function trimAttributeKey(value) {
  return String(value ?? "").trim();
}

/** Normalize attribute keys CSV; server builds ATTRIBUTE_OPERATION branches per key. */
export function applyAttributeKeyToStreamFilters(filters) {
  const attributeKeys = splitAudienceValues(filters.attribute_key);
  if (!attributeKeys.length) return filters;
  return {
    ...filters,
    attribute_key: joinAudienceValues(attributeKeys),
  };
}

export function normalizeStreamStart(value) {
  const raw = String(value ?? "LATEST").trim().toUpperCase();
  return raw === "EARLIEST" ? "EARLIEST" : "LATEST";
}

export function liveStreamFilters(filters) {
  const withAttribute = applyAttributeKeyToStreamFilters(filters);
  return {
    ...withAttribute,
    start: normalizeStreamStart(withAttribute.start),
    types: filterStreamTypesCsv(withAttribute.types),
  };
}

export function streamParamsFromFilters(filters, { includeProfile = true, includeServerLimit = true } = {}) {
  const params = new URLSearchParams();
  const keys = [
    ...(includeProfile ? ["profile"] : []),
    "start",
    "types",
    "device_types",
    "named_user",
    "timezone",
    "channel",
    "push_id",
    "campaign_category",
    "attribute_key",
    "latency",
  ];

  for (const key of keys) {
    const value = filters[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      params.set(key, String(value).trim());
    }
  }
  if (includeServerLimit && !filters.no_limit && filters.limit) {
    params.set("limit", String(filters.limit));
  }
  if (filters.store_raw) params.set("store_raw", "1");
  return params;
}
