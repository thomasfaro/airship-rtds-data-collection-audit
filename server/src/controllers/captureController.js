import path from "node:path";
import { loadProfile } from "../config.js";
import {
  createAuditAccumulator,
  finalizeAuditAccumulatorWithProgress,
  ingestAuditLine,
} from "../audit/analyzeEvents.js";
import {
  auditWindowUsesLatency,
  buildProcessedRange,
  formatTimeSpanMs,
} from "../audit/auditWindow.js";
import {
  createCoveragePlateauStopper,
  distinctKeyBreakdown,
} from "../audit/coveragePlateau.js";
import { buildAuditRtdsBody, streamAuditEventsToFile } from "../audit/fetchEvents.js";
import { createAuditRawFilePath, removeAuditRawFile } from "../audit/paths.js";
import { persistStoredAuditReport } from "../audit/storedAuditReport.js";
import { auditRtdsTypes, auditTypeCoverage } from "../audit/registry.js";
import { filterEntitledTypes } from "../audit/rtdsEntitlements.js";
import { registerAuditSession, unregisterAuditSession } from "../audit/sessionRegistry.js";
import { sseDataLine } from "../audit/reportJson.js";
import { formatRtdsStreamError } from "../rtds/rtdsStreamErrors.js";
import { resolveCaptureOptions } from "../capture/captureOptions.js";

/** Data collection capture always requests the tracking-only RTDS types. */
const TRACKING_ONLY = true;

function sseMessage(payload) {
  return sseDataLine(payload);
}

function startStatusMessage({ stopMode, startPosition, captureWindow }) {
  const start = startPosition === "latest" ? "LATEST" : "EARLIEST";
  const window = auditWindowUsesLatency(captureWindow) ? `, latency ${captureWindow.label}` : "";
  const ending =
    stopMode === "realtime"
      ? "will stop automatically once tracking coverage is complete"
      : "click Stop when ready";
  return `Capturing tracking events from RTDS (${start}${window}) — ${ending}…`;
}

/**
 * Coverage snapshot attached to every download progress event: what has been
 * discovered so far and, in real-time mode, how close each auto-stop condition is.
 */
function buildCoverageProgress(acc, plateauStopper) {
  const coverage = { keys: distinctKeyBreakdown(acc), events: acc?.total ?? 0 };
  if (!plateauStopper) return coverage;
  const plateau = plateauStopper.progress(acc);
  return {
    ...coverage,
    autoStop: {
      events: { current: plateau.events, target: plateau.thresholds.minEvents },
      processedSpanMs: {
        current: plateau.processedSpanMs,
        target: plateau.thresholds.minProcessedSpanMs,
      },
      eventsSinceLastNewKey: {
        current: plateau.eventsSinceLastNewKey,
        target: plateau.thresholds.plateauMargin,
      },
      spanSinceLastNewKeyMs: {
        current: plateau.spanSinceLastNewKeyMs,
        target: plateau.thresholds.plateauSpanMs,
      },
    },
  };
}

function captureErrorMessage(error) {
  const formatted = formatRtdsStreamError(error, { phase: "download" });
  return {
    kind: "error",
    message: formatted.message,
    detail: formatted.detail ?? String(error),
    causeHint: formatted.causeHint,
  };
}

function attachReportMeta(report, { downloadResult, options, storagePath }) {
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

/**
 * Run a data collection capture: stream the tracking-only RTDS types, analyze
 * them live (no raw NDJSON is written) and emit the finished report.
 *
 * The analysis and its value sidecars are still persisted so the tagging plan
 * export can include detailed values and the run stays reopenable from History.
 */
export async function* runDataCollectionCapture(
  query,
  { downloadSignal, analyzeSignal, downloadAbort } = {},
) {
  let options;
  try {
    options = resolveCaptureOptions(query);
  } catch (error) {
    yield sseMessage({ kind: "error", message: error.message });
    return;
  }

  if (!options.profile) {
    yield sseMessage({ kind: "error", message: "No project selected" });
    return;
  }
  if (downloadSignal?.aborted) {
    yield sseMessage({ kind: "error", message: "Capture cancelled" });
    return;
  }

  let profile;
  try {
    profile = loadProfile(options.profile);
  } catch (error) {
    yield sseMessage({ kind: "error", message: error.message });
    return;
  }

  const { timezone, captureWindow, streamMode, excludedDeviceTypes, realTime } = options;
  const usesLatency = auditWindowUsesLatency(captureWindow);
  const latencyMs = usesLatency ? captureWindow.latencyMs : null;

  const acc = createAuditAccumulator();
  // Stem for the persisted report + value sidecars. No NDJSON is written to it.
  const storagePath = createAuditRawFilePath(profile.name);

  let sessionRegistered = false;
  if (downloadAbort) {
    const registration = registerAuditSession(profile.name, downloadAbort, storagePath);
    if (!registration.ok) {
      yield sseMessage({
        kind: "error",
        message:
          "A capture is already running for this project. Stop it first or wait for it to finish.",
      });
      return;
    }
    sessionRegistered = true;
  }

  const plateauStopper = realTime
    ? createCoveragePlateauStopper(options.realtimeThresholds ?? {})
    : null;
  let autoStopped = false;

  try {
    yield sseMessage({
      kind: "status",
      message: startStatusMessage(options),
      profile: profile.name,
      phase: "download",
      stopMode: options.stopMode,
      startPosition: options.startPosition,
      windowLabel: usesLatency ? captureWindow.label : "no latency",
      typesCount: auditRtdsTypes({ trackingOnly: TRACKING_ONLY }).length,
      realtimeThresholds: options.realtimeThresholds,
    });

    let downloadResult = null;
    let entitlementExcluded = [];
    const downloadStarted = Date.now();

    try {
      const downloadGen = streamAuditEventsToFile(profile, storagePath, {
        signal: downloadSignal,
        latencyMs,
        timezone,
        streamMode,
        excludedDeviceTypes,
        trackingOnly: TRACKING_ONLY,
        onLine: (line) => {
          const offset = ingestAuditLine(acc, line, timezone);
          if (plateauStopper && !autoStopped && plateauStopper.observe(acc)) {
            autoStopped = true;
            downloadAbort?.abort();
          }
          return offset;
        },
      });

      while (true) {
        const step = await downloadGen.next();
        if (step.done) {
          downloadResult = step.value;
          break;
        }
        if (step.value.phase === "entitlements") {
          entitlementExcluded = step.value.excludedTypes ?? [];
          yield sseMessage({
            kind: "status",
            phase: "download",
            message: `Adjusted RTDS filters (token not entitled to: ${entitlementExcluded.join(", ")}). Capturing ${step.value.typesCount} event types…`,
            excludedTypes: entitlementExcluded,
            typesCount: step.value.typesCount,
          });
          continue;
        }
        yield sseMessage({
          kind: "progress",
          ...step.value,
          coverage: buildCoverageProgress(acc, plateauStopper),
        });
      }
    } catch (error) {
      const aborted = error?.name === "AbortError" || downloadSignal?.aborted;
      if ((acc.total ?? 0) === 0) {
        yield sseMessage({
          kind: "error",
          message: aborted
            ? "Capture stopped before any event was analyzed"
            : captureErrorMessage(error).message,
          ...(aborted ? {} : { detail: captureErrorMessage(error).detail }),
        });
        return;
      }
      // Events were already ingested, so a stop (manual or automatic) still
      // yields a usable tagging plan from the accumulator.
      if (autoStopped) {
        const spanLabel = formatTimeSpanMs(
          (acc.maxProcessed ?? acc.maxOccurred ?? 0) - (acc.minProcessed ?? acc.minOccurred ?? 0),
        );
        yield sseMessage({
          kind: "status",
          phase: "download",
          message: `Coverage complete — ${acc.total.toLocaleString("en-US")} events over ${spanLabel} of processed time, no new tracking keys. Stopping automatically.`,
        });
      }
      const entitledTypes = filterEntitledTypes(
        auditRtdsTypes({ trackingOnly: TRACKING_ONLY }),
        entitlementExcluded,
      );
      downloadResult = {
        linesWritten: acc.total,
        bytesWritten: 0,
        request: buildAuditRtdsBody(entitledTypes, latencyMs, streamMode.rtdsStart, {
          excludedDeviceTypes,
        }),
        types: entitledTypes,
        excludedEntitlements: entitlementExcluded,
        latencyMs,
        streamMode: streamMode.id,
        stoppedManually: aborted && !autoStopped,
      };
    }

    if ((downloadResult.linesWritten ?? 0) <= 0) {
      yield sseMessage({ kind: "error", message: "No events analyzed" });
      return;
    }
    downloadResult.downloadMs = Date.now() - downloadStarted;

    yield sseMessage({
      kind: "status",
      phase: "analyze",
      message: `Building the tagging plan from ${downloadResult.linesWritten.toLocaleString("en-US")} events…`,
    });
    yield sseMessage({
      kind: "progress",
      phase: "analyze",
      totalLines: downloadResult.linesWritten,
      linesProcessed: downloadResult.linesWritten,
    });

    const analyzeGen = finalizeAuditAccumulatorWithProgress(acc, {
      profileName: profile.name,
      timezone,
      windowMs: usesLatency ? captureWindow.latencyMs : null,
      windowLabel: usesLatency ? captureWindow.label : "no latency",
      storageMeta: {
        rawFileLines: downloadResult.linesWritten,
        rawFileBytes: 0,
        rawFileKept: false,
        analysisOnly: true,
      },
      auditContext: {
        streamMode: streamMode.id,
        windowMs: latencyMs,
        windowLabel: usesLatency ? captureWindow.label : "no latency",
        request: downloadResult.request,
        typesRequested: downloadResult.types,
        excludedEntitlements: downloadResult.excludedEntitlements ?? [],
        stoppedManually: downloadResult.stoppedManually ?? false,
        downloadElapsedLabel: downloadResult.elapsedLabel ?? null,
        downloadOldestProcessed: downloadResult.oldestProcessed ?? null,
        downloadNewestProcessed: downloadResult.newestProcessed ?? null,
        excludedDeviceTypes,
      },
      filePath: storagePath,
      skipBackfill: true,
    });

    let report;
    while (true) {
      const step = await analyzeGen.next();
      if (step.done) {
        report = step.value;
        break;
      }
      yield sseMessage({
        kind: "progress",
        totalLines: downloadResult.linesWritten,
        ...step.value,
      });
    }

    report.meta.autoStopped = autoStopped;
    if (autoStopped) report.meta.autoStopReason = "coverage_plateau";

    try {
      persistStoredAuditReport(storagePath, report);
    } catch (error) {
      console.warn("[capture] failed to save the analysis:", error.message);
    }

    yield sseMessage({ kind: "progress", phase: "packaging" });
    await new Promise((resolve) => setImmediate(resolve));
    yield sseMessage({
      kind: "complete",
      report: attachReportMeta(report, { downloadResult, options, storagePath }),
    });
  } catch (error) {
    if (error?.name === "AbortError" || analyzeSignal?.aborted) {
      yield sseMessage({ kind: "error", message: "Analysis cancelled" });
      return;
    }
    console.error("[capture] error:", error);
    removeAuditRawFile(storagePath);
    yield sseMessage({
      kind: "error",
      message: error?.message || "Capture failed",
      detail: String(error),
    });
  } finally {
    if (sessionRegistered) unregisterAuditSession(profile.name);
  }
}
