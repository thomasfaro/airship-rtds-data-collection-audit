import { fetchEventSamples } from "../../services/valuesApi.js";

function ndjsonFileNameFromReport(report) {
  return (
    report?.meta?.storage?.sourceFileName ??
    (report?.meta?.profile?.startsWith("stored-file:")
      ? report.meta.profile.slice("stored-file:".length)
      : null)
  );
}

function shouldHydrateEventSamples(report) {
  if (!report || (report.eventSamples ?? []).length > 0) return false;
  const storage = report.meta?.storage ?? {};
  return Boolean(
    storage.eventSamplesFile ||
      storage.reportShrunkForTransport ||
      storage.reportShrunkOnPersist ||
      (storage.eventSamplesOmitted ?? 0) > 0,
  );
}

/** Load example events from sidecar when omitted from the transport report. */
export async function hydrateAuditReport(report) {
  if (!shouldHydrateEventSamples(report)) return report;

  const name = ndjsonFileNameFromReport(report);
  if (!name) return report;

  try {
    const payload = await fetchEventSamples({
      name,
      scopeId: report.meta?.scopeId,
    });
    const samples = payload.samples ?? [];
    if (!samples.length) return report;
    return { ...report, eventSamples: samples };
  } catch {
    return report;
  }
}
