import { kpiId as sampleKpiId } from "./eventSamples.js";

/** KPI ids for custom-event sample lookup (shared server / warning resolver). */
export function customEventSampleKpiIdsForRow(row) {
  const ids = row.sampleKpiIds ?? [];
  if (ids.length) return ids;

  const set = new Set();
  const sourceKey = row.source ?? "unknown";

  for (const deviceType of Object.keys(row.byDevice ?? {})) {
    set.add(sampleKpiId("custom", sourceKey, row.name, deviceType));
  }
  for (const d of row.byDeviceBreakdown ?? []) {
    if (d.sampleKpiId) set.add(d.sampleKpiId);
    else if (d.deviceType) set.add(sampleKpiId("custom", sourceKey, row.name, d.deviceType));
  }

  return [...set];
}
