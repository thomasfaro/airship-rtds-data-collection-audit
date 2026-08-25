/** Match server eventSamples.kpiId() slug rules for lookup on cached reports. */
export function auditKpiId(...parts) {
  return parts
    .filter((p) => p != null && p !== "")
    .map((p) => String(p).replace(/[^a-zA-Z0-9._-]/g, "_"))
    .join(".");
}

export function customEventSampleKpiIdsForRow(row) {
  const ids = row.sampleKpiIds ?? [];
  if (ids.length) return ids;

  const set = new Set();
  const sourceKey = row.source ?? "unknown";

  for (const deviceType of Object.keys(row.byDevice ?? {})) {
    set.add(auditKpiId("custom", sourceKey, row.name, deviceType));
  }
  for (const d of row.byDeviceBreakdown ?? []) {
    if (d.sampleKpiId) set.add(d.sampleKpiId);
    else if (d.deviceType) set.add(auditKpiId("custom", sourceKey, row.name, d.deviceType));
  }

  return [...set];
}
