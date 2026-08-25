/** Safe JSON serialization for large audit reports (V8 string length limit). */

export function safeJsonStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    if (error instanceof RangeError) {
      const err = new Error(
        "Audit report is too large to serialize. Try a scoped analysis or a shorter capture window.",
      );
      err.code = "REPORT_TOO_LARGE";
      err.cause = error;
      throw err;
    }
    throw error;
  }
}

/** Drop heavy sample payloads so persistence / SSE can succeed on large prod captures. */
export function shrinkAuditReportForTransport(report) {
  if (!report || typeof report !== "object") return report;

  const shrunk = {
    ...report,
    eventSamples: [],
    meta: {
      ...(report.meta ?? {}),
      storage: {
        ...(report.meta?.storage ?? {}),
        reportShrunkForTransport: true,
        eventSamplesOmitted: Array.isArray(report.eventSamples) ? report.eventSamples.length : 0,
      },
    },
  };

  return shrunk;
}

export function sseDataLine(payload) {
  try {
    return `data: ${safeJsonStringify(payload)}\n\n`;
  } catch (error) {
    if (error?.code !== "REPORT_TOO_LARGE" || !payload?.report) {
      throw error;
    }
    const shrunk = shrinkAuditReportForTransport(payload.report);
    return `data: ${safeJsonStringify({ ...payload, report: shrunk, reportTruncated: true })}\n\n`;
  }
}
