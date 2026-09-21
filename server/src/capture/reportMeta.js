/**
 * How a finished report describes the capture that produced it: the window, the
 * requested types, the storage stem and the timings. Pure assembly over the
 * download result, so it is readable and testable without a stream.
 */

import path from "node:path";
import { auditWindowUsesLatency, buildProcessedRange } from "../audit/auditWindow.js";
import { auditTypeCoverage } from "../audit/registry.js";
import { runningVersion } from "../version.js";
import { TRACKING_ONLY } from "./captureOptions.js";

export function attachReportMeta(report, { downloadResult, options, storagePath }) {
  const { captureWindow, streamMode, stopMode, realTime, realtimeThresholds } = options;
  const usesLatency = auditWindowUsesLatency(captureWindow);
  report.meta.windowMs = usesLatency ? captureWindow.latencyMs : null;
  report.meta.windowHours = usesLatency ? captureWindow.hours : null;
  report.meta.windowLabel = usesLatency ? captureWindow.label : "no latency";
  report.meta.streamMode = streamMode.id;
  report.meta.startPosition = options.startPosition;
  report.meta.stopMode = stopMode;
  report.meta.realTime = realTime;
  report.meta.realtimeThresholds = realtimeThresholds;
  report.meta.request = downloadResult.request;
  report.meta.excludedEntitlements = downloadResult.excludedEntitlements ?? [];
  report.meta.typesRequested = downloadResult.types ?? [];
  report.meta.taggingPlanMode = true;
  report.meta.typesCoverage = auditTypeCoverage({ trackingOnly: TRACKING_ONLY });
  // Stamped into the report, so a tagging plan that comes back six months later can be
  // traced to the version that produced it.
  report.meta.appVersion = runningVersion();

  const processedRange = buildProcessedRange(
    downloadResult.oldestProcessed ?? null,
    downloadResult.newestProcessed ?? null,
  );
  report.meta.downloadHours = {
    requestLaunchedAt: downloadResult.requestLaunchedAt ?? null,
    stoppedManually: downloadResult.stoppedManually ?? false,
    elapsedMs: downloadResult.elapsedMs ?? null,
    elapsedLabel: downloadResult.elapsedLabel ?? null,
    oldestProcessed: downloadResult.oldestProcessed ?? null,
    newestProcessed: downloadResult.newestProcessed ?? null,
    processedRange,
  };
  if (report.meta.queryContext && processedRange) {
    report.meta.queryContext.processedRange = processedRange;
    report.meta.queryContext.processedRangeSource = "download";
  }

  const storageName = storagePath ? path.basename(storagePath) : null;
  report.meta.storage = {
    ...(report.meta.storage ?? {}),
    rawFileLines: downloadResult.linesWritten,
    rawFileBytes: 0,
    rawFileKept: false,
    analysisOnly: true,
    ...(storageName ? { sourceFileName: storageName } : {}),
  };
  report.meta.phaseTimings = {
    downloadMs: downloadResult.downloadMs ?? null,
    analyzeMs: report.meta.analyzeMs ?? null,
  };
  return report;
}
