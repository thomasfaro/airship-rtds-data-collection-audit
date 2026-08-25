import { normalizeExcludedDeviceTypes } from "./auditDeviceTypePredicates.js";

export function parseExcludedDeviceTypesQuery(query) {
  const raw = query?.excludedDeviceTypes;
  if (raw == null || raw === "") return [];

  try {
    const parsed = JSON.parse(decodeURIComponent(String(raw)));
    return normalizeExcludedDeviceTypes(Array.isArray(parsed) ? parsed : [parsed]);
  } catch {
    return normalizeExcludedDeviceTypes(String(raw).split(","));
  }
}
