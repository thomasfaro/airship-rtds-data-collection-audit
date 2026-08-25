/** Human-readable span for stored-file duration (days + hours when long, finer when short). */
export function formatDurationDaysHours(ms) {
  if (ms == null) return "—";
  if (ms < 0) return "—";
  if (ms === 0) return "0h";

  const dayMs = 86_400_000;
  const hourMs = 3_600_000;
  const minuteMs = 60_000;

  const days = Math.floor(ms / dayMs);
  const hours = Math.floor((ms % dayMs) / hourMs);
  const minutes = Math.floor((ms % hourMs) / minuteMs);

  if (days >= 1) {
    if (hours === 0) return `${days}d`;
    return `${days}d ${hours}h`;
  }
  if (hours >= 1) {
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  }
  if (minutes >= 1) return `${minutes}m`;
  return "< 1m";
}

export function durationSpanTitle(file) {
  if (file?.spanMs == null) return undefined;
  if (file.spanSource === "processed") {
    return `Capture window: first → last processed timestamp in the file.`;
  }
  return `Capture window estimated from occurred timestamps (no processed field in file).`;
}
