import { EVENT_REGISTRY } from "./audit/registry.js";

const RTDS_CONNECT_TYPES = new Set(Object.keys(EVENT_REGISTRY));

/** Types valid in RTDS Connect `filters[].types` (excludes derived email/SMS types from CUSTOM payloads). */
export function filterConnectEventTypes(types) {
  const valid = [];
  const dropped = [];
  for (const type of types) {
    const key = String(type || "").toUpperCase();
    if (RTDS_CONNECT_TYPES.has(key)) valid.push(key);
    else dropped.push(key);
  }
  return { valid, dropped };
}
