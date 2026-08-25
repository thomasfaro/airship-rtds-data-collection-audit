/**
 * Parse RTDS 403 responses when the bearer token lacks entitlements for event types.
 * Example: "Requested event types to which client is not entitled COMPLIANCE,TAG_CHANGE"
 */
export function parseUnentitledTypes(errorBody) {
  const text = String(errorBody ?? "");
  const match = text.match(/not entitled\s+([A-Z0-9_,\s]+)/i);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((type) => type.trim())
    .filter(Boolean);
}

export function isUnentitledTypesError(status, errorBody) {
  return status === 403 && /not entitled/i.test(String(errorBody ?? ""));
}

export function filterEntitledTypes(types, deniedTypes) {
  const denied = new Set(deniedTypes);
  return types.filter((type) => !denied.has(type));
}
