/** Device_type rows for executive summary KPIs / sample overview. */
export function adjustDeviceTypeRowsForExecutiveSummary(byDeviceTypeRows) {
  return (byDeviceTypeRows ?? [])
    .map((row) => ({
      deviceType: row.deviceType ?? row.key,
      count: row.count ?? 0,
    }))
    .filter((row) => row.count > 0);
}
