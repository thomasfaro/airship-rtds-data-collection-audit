import { buildExcludedDeviceTypesPredicate } from "./auditDeviceTypePredicates.js";

export function buildAuditRtdsBody(
  types,
  latencyMs,
  rtdsStart = "EARLIEST",
  { excludedDeviceTypes = [] } = {},
) {
  const filter = { types };
  if (latencyMs != null && latencyMs > 0) {
    filter.latency = latencyMs;
  }
  const predicate = buildExcludedDeviceTypesPredicate(excludedDeviceTypes);
  if (predicate) {
    filter.predicates = [predicate];
  }
  return {
    start: rtdsStart,
    filters: [filter],
  };
}
