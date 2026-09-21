import { loadProfile } from "../config.js";
import {
  createAuditAccumulator,
  finalizeAuditAccumulatorWithProgress,
  ingestAuditLine,
} from "../audit/analyzeEvents.js";
import { auditWindowUsesLatency } from "../audit/auditWindow.js";
import { createCoveragePlateauStopper } from "../audit/coveragePlateau.js";
import { buildAuditRtdsBody, streamAuditEvents } from "../audit/streamRtdsEvents.js";
import { createAuditRawFilePath, removeAuditRawFile } from "../audit/paths.js";
import { persistStoredAuditReport } from "../audit/storedAuditReport.js";
import { auditRtdsTypes } from "../audit/registry.js";
import { filterEntitledTypes } from "../audit/rtdsEntitlements.js";
import { registerAuditSession, unregisterAuditSession } from "../audit/sessionRegistry.js";
import { sseDataLine } from "../audit/reportJson.js";
import {
  REALTIME_THRESHOLDS,
  TRACKING_ONLY,
  resolveCaptureOptions,
} from "../capture/captureOptions.js";
import {
  CAPTURE_MESSAGES,
  analyzeStatusMessage,
  autoStopMessage,
  captureErrorMessage,
  entitlementStatusMessage,
  startStatusMessage,
} from "../capture/captureMessages.js";
import { buildCoverageProgress } from "../capture/coverageProgress.js";
import { attachReportMeta } from "../capture/reportMeta.js";

function sseMessage(payload) {
  return sseDataLine(payload);
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
    yield sseMessage({ kind: "error", message: CAPTURE_MESSAGES.noProfile });
    return;
  }
  if (downloadSignal?.aborted) {
    yield sseMessage({ kind: "error", message: CAPTURE_MESSAGES.cancelled });
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
  const windowLabel = usesLatency ? captureWindow.label : "no latency";

  const acc = createAuditAccumulator();
  // Stem for the persisted report + value sidecars. No NDJSON is written to it.
  const storagePath = createAuditRawFilePath(profile.name);

  let sessionRegistered = false;
  if (downloadAbort) {
    const registration = registerAuditSession(profile.name, downloadAbort, storagePath);
    if (!registration.ok) {
      yield sseMessage({ kind: "error", message: CAPTURE_MESSAGES.alreadyRunning });
      return;
    }
    sessionRegistered = true;
  }

  // Measured in both modes: in real-time it ends the capture, in manual it only
  // feeds the gauges that say whether coverage has settled. A manual run carries no
  // thresholds of its own, so it is measured against the standard ones.
  const plateauStopper = createCoveragePlateauStopper(
    options.realtimeThresholds ?? REALTIME_THRESHOLDS,
  );
  let autoStopped = false;

  try {
    yield sseMessage({
      kind: "status",
      message: startStatusMessage(options),
      profile: profile.name,
      phase: "download",
      stopMode: options.stopMode,
      startPosition: options.startPosition,
      windowLabel,
      typesCount: auditRtdsTypes({ trackingOnly: TRACKING_ONLY }).length,
      realtimeThresholds: options.realtimeThresholds,
    });

    let downloadResult = null;
    let entitlementExcluded = [];
    const downloadStarted = Date.now();

    try {
      const downloadGen = streamAuditEvents(profile, {
        signal: downloadSignal,
        latencyMs,
        timezone,
        streamMode,
        excludedDeviceTypes,
        trackingOnly: TRACKING_ONLY,
        onLine: (line) => {
          const offset = ingestAuditLine(acc, line, timezone);
          // observe() also maintains the "last new key" markers the gauges read, so
          // it runs whatever the mode; only real-time acts on the answer.
          const settled = plateauStopper.observe(acc);
          if (settled && realTime && !autoStopped) {
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
            message: entitlementStatusMessage({
              excludedTypes: entitlementExcluded,
              typesCount: step.value.typesCount,
            }),
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
        const failure = captureErrorMessage(error);
        yield sseMessage({
          kind: "error",
          message: aborted ? CAPTURE_MESSAGES.stoppedBeforeAnyEvent : failure.message,
          ...(aborted ? {} : { detail: failure.detail }),
        });
        return;
      }
      // Events were already ingested, so a stop (manual or automatic) still
      // yields a usable tagging plan from the accumulator.
      if (autoStopped) {
        yield sseMessage({
          kind: "status",
          phase: "download",
          message: autoStopMessage({
            events: acc.total,
            spanMs:
              (acc.maxProcessed ?? acc.maxOccurred ?? 0) -
              (acc.minProcessed ?? acc.minOccurred ?? 0),
          }),
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
      yield sseMessage({ kind: "error", message: CAPTURE_MESSAGES.noEvents });
      return;
    }
    downloadResult.downloadMs = Date.now() - downloadStarted;

    yield sseMessage({
      kind: "status",
      phase: "analyze",
      message: analyzeStatusMessage(downloadResult.linesWritten),
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
      windowMs: latencyMs,
      windowLabel,
      storageMeta: {
        rawFileLines: downloadResult.linesWritten,
        rawFileBytes: 0,
        rawFileKept: false,
        analysisOnly: true,
      },
      auditContext: {
        streamMode: streamMode.id,
        windowMs: latencyMs,
        windowLabel,
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
      yield sseMessage({ kind: "error", message: CAPTURE_MESSAGES.analysisCancelled });
      return;
    }
    console.error("[capture] error:", error);
    removeAuditRawFile(storagePath);
    yield sseMessage({
      kind: "error",
      message: error?.message || CAPTURE_MESSAGES.failed,
      detail: String(error),
    });
  } finally {
    if (sessionRegistered) unregisterAuditSession(profile.name);
  }
}
