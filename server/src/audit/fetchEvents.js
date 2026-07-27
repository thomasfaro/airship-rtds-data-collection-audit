import fs from "node:fs";
import { createWriteStream } from "node:fs";
import { once } from "node:events";
import { performance } from "node:perf_hooks";
import {
  AUDIT_STREAM_MODES,
  DEFAULT_AUDIT_WINDOW_HOURS,
  createDownloadProgressTracker,
} from "./auditWindow.js";
import { reconcileDownloadedNdjsonFile } from "./downloadFileReconcile.js";
import { scanNdjsonProcessedRange } from "./scanProcessedRange.js";
import { auditRtdsTypes } from "./registry.js";
import { openRtdsNdjsonStream } from "../rtds/openRtdsStream.js";
import {
  AuditDownloadPartialError,
  MAX_AUDIT_CONNECT_FAILURES,
  buildAuditConnectBody,
  buildPartialCaptureMeta,
  extractEventOffset,
  reconnectBackoffMs,
  sleepMs,
} from "./auditStreamReconnect.js";
import { buildAuditRtdsBody } from "./auditRtdsBody.js";
import { formatRtdsStreamError, isRtdsStreamTerminatedError } from "../rtds/rtdsStreamErrors.js";

export { buildAuditRtdsBody } from "./auditRtdsBody.js";

export const AUDIT_LATENCY_MS = DEFAULT_AUDIT_WINDOW_HOURS * 60 * 60 * 1000;
const PROGRESS_LINE_INTERVAL = 10_000;
const WRITE_HIGH_WATER_MARK = 4 * 1024 * 1024;
// Max contiguous time (ms) the analysis-only ingest may hold the Node event loop
// before yielding. Keeps the single-threaded server responsive (SPA + other API/SSE
// requests + concurrent audits) when a "sans stockage" multi-audit runs in the
// background. Only applies to the CPU-bound analysis-only path; file-mode download
// is untouched.
const INGEST_YIELD_MS = 12;

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Opt-in hot-path profiler (AUDIT_PROFILE=1). Accumulates time spent waiting on
 * the socket vs. time spent parsing/processing lines, to tell network-bound from
 * CPU-bound ingestion. Returns null (zero overhead) when disabled.
 */
function createStreamProfiler() {
  if (process.env.AUDIT_PROFILE !== "1") return null;
  return { readWaitMs: 0, processMs: 0, reads: 0, lines: 0, bytes: 0 };
}

function logStreamProfile(profiler, { analysisOnly }) {
  if (!profiler) return;
  const { readWaitMs, processMs, reads, lines, bytes } = profiler;
  const wallMs = readWaitMs + processMs;
  const cpuEps = processMs > 0 ? Math.round((lines / processMs) * 1000) : 0;
  const wallMbps = wallMs > 0 ? (bytes / 1_048_576 / (wallMs / 1000)).toFixed(2) : "0.00";
  const bound = processMs > readWaitMs ? "CPU" : "network";
  console.log(
    `[capture-profile] mode=${analysisOnly ? "analysis-only" : "file"} lines=${lines} ` +
      `bytes=${bytes} reads=${reads} readWaitMs=${Math.round(readWaitMs)} ` +
      `processMs=${Math.round(processMs)} cpuEvents/s=${cpuEps} wallMB/s=${wallMbps} bound=${bound}`,
  );
}

export async function openAuditRtdsStream(
  profile,
  {
    signal,
    latencyMs = AUDIT_LATENCY_MS,
    rtdsStart = "EARLIEST",
    resumeOffset = null,
    excludedDeviceTypes = [],
    trackingOnly = false,
  } = {},
) {
  const types = auditRtdsTypes({ trackingOnly });
  const body = buildAuditConnectBody(types, latencyMs, rtdsStart, resumeOffset, {
    excludedDeviceTypes,
  });
  const { response, request, types: entitledTypes, excludedEntitlements } =
    await openRtdsNdjsonStream(profile, body, { signal });

  if (process.env.AUDIT_PROFILE === "1") {
    console.log(
      `[capture-profile] content-encoding=${response.headers.get("content-encoding") || "none"}`,
    );
  }

  if (excludedEntitlements.length) {
    console.warn(
      `[capture-entitlements] token not entitled to: ${excludedEntitlements.join(", ")}`,
    );
  }

  return {
    response,
    request,
    types: entitledTypes,
    excludedEntitlements,
    latencyMs,
  };
}

function mergeDownloadProgress(volume, hourSnapshot) {
  return {
    phase: "download",
    ...volume,
    ...hourSnapshot,
  };
}

function shouldSampleProcessed(linesWritten) {
  return (
    linesWritten === 1 ||
    linesWritten % PROGRESS_LINE_INTERVAL === 0 ||
    linesWritten % PROGRESS_LINE_INTERVAL === 1
  );
}

function lineBytesToString(lineBytes) {
  if (!lineBytes.length) return "";
  if (lineBytes[0] <= 0x20 || lineBytes[lineBytes.length - 1] <= 0x20) {
    return lineBytes.toString("utf8").trim();
  }
  return lineBytes.toString("utf8");
}

async function writeBytes(writeStream, chunk, gate) {
  if (!writeStream || !chunk.length || gate?.closed || writeStream.destroyed || writeStream.writableEnded)
    return;
  try {
    const ok = writeStream.write(chunk);
    if (!ok && !writeStream.destroyed && !writeStream.writableEnded) {
      await once(writeStream, "drain");
    }
  } catch {
    if (gate) gate.closed = true;
  }
}

function openNdjsonWriteSink(filePath) {
  const writeStream = createWriteStream(filePath, {
    highWaterMark: WRITE_HIGH_WATER_MARK,
  });
  const gate = { closed: false };
  writeStream.on("error", () => {
    gate.closed = true;
  });
  return { writeStream, gate };
}

function closeNdjsonWriteSink(writeStream, gate) {
  if (gate) gate.closed = true;
  if (!writeStream || writeStream.destroyed || writeStream.writableEnded) return;
  writeStream.on("error", () => {});
  writeStream.destroy();
}

function toChunk(value) {
  if (!value) return Buffer.alloc(0);
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

function readWithAbortSignal(reader, signal) {
  if (!signal) return reader.read();
  if (signal.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reader.cancel().catch(() => {});
      reject(new DOMException("Aborted", "AbortError"));
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);

    signal.addEventListener("abort", onAbort, { once: true });
    reader.read().then(
      (result) => {
        cleanup();
        resolve(result);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

async function* processCompletedLines(
  scanBuf,
  carryStart,
  progressTracker,
  state,
  offsetState,
  onLine,
  profiler,
  emitProgress,
) {
  let start = carryStart;
  // Analysis-only ingest (onLine set) runs the heavy per-event work on the main
  // thread, so it must periodically yield the event loop. File-mode download
  // (onLine null) stays fully synchronous to preserve raw-capture throughput.
  const cooperative = Boolean(onLine);
  let segStart = profiler ? performance.now() : 0;
  let lastYield = cooperative ? performance.now() : 0;

  for (let i = carryStart; i < scanBuf.length; i += 1) {
    if (scanBuf[i] !== 0x0a) continue;
    if (i <= start) {
      start = i + 1;
      continue;
    }

    const lineText = lineBytesToString(scanBuf.subarray(start, i));
    state.linesWritten += 1;
    if (profiler) profiler.lines += 1;
    // Analysis-only: onLine (ingestAuditLine) parses once and returns the offset,
    // so we skip the redundant extractEventOffset parse. File mode keeps it.
    const offset = onLine && lineText ? onLine(lineText) : extractEventOffset(lineText);
    if (offset) offsetState.lastOffset = offset;
    if (shouldSampleProcessed(state.linesWritten)) {
      progressTracker.noteLine(lineText);
    }
    start = i + 1;

    if (state.linesWritten % PROGRESS_LINE_INTERVAL === 0) {
      if (profiler) profiler.processMs += performance.now() - segStart;
      yield emitProgress();
      if (cooperative) lastYield = performance.now();
      if (profiler) segStart = performance.now();
    } else if (cooperative) {
      const now = performance.now();
      if (now - lastYield >= INGEST_YIELD_MS) {
        if (profiler) profiler.processMs += now - segStart;
        await yieldToEventLoop();
        lastYield = performance.now();
        if (profiler) segStart = performance.now();
      }
    }
  }

  if (profiler) profiler.processMs += performance.now() - segStart;
  return start;
}

async function* streamManualStopBinary(
  reader,
  writeStream,
  progressTracker,
  { signal, liveStats, gate, offsetState, onLine, profiler },
) {
  let lineCarry = Buffer.alloc(0);
  const state = liveStats;
  state.linesWritten = 0;
  state.bytesWritten = 0;
  let stoppedAtRequestTime = false;

  const emitProgress = (extra = {}) =>
    mergeDownloadProgress(
      { linesWritten: state.linesWritten, bytesWritten: state.bytesWritten, ...extra },
      progressTracker.snapshotVolume({ linesWritten: state.linesWritten }),
    );

  while (true) {
    if (signal?.aborted) {
      if (lineCarry.length) {
        await writeBytes(writeStream, lineCarry, gate);
      }
      await reader.cancel().catch(() => {});
      throw new DOMException("Aborted", "AbortError");
    }

    const readStart = profiler ? performance.now() : 0;
    const { done, value } = await readWithAbortSignal(reader, signal);
    if (profiler) {
      profiler.readWaitMs += performance.now() - readStart;
      profiler.reads += 1;
    }
    if (done) break;

    const chunk = toChunk(value);
    state.bytesWritten += chunk.length;
    if (profiler) profiler.bytes += chunk.length;
    await writeBytes(writeStream, chunk, gate);

    const scanBuf = lineCarry.length ? Buffer.concat([lineCarry, chunk]) : chunk;
    const carryStart = yield* processCompletedLines(
      scanBuf,
      0,
      progressTracker,
      state,
      offsetState,
      onLine,
      profiler,
      emitProgress,
    );
    lineCarry =
      carryStart < scanBuf.length ? Buffer.from(scanBuf.subarray(carryStart)) : Buffer.alloc(0);
  }

  if (lineCarry.length) {
    const tail = lineBytesToString(lineCarry);
    if (tail) {
      state.linesWritten += 1;
      if (profiler) profiler.lines += 1;
      const offset = onLine ? onLine(tail) : extractEventOffset(tail);
      if (offset) offsetState.lastOffset = offset;
      progressTracker.noteLine(tail);
    }
  }

  return {
    linesWritten: state.linesWritten,
    bytesWritten: state.bytesWritten,
    stoppedAtRequestTime,
  };
}

async function* streamLatencyWindowLines(
  reader,
  writeStream,
  progressTracker,
  { signal, gate, offsetState, onLine, profiler },
) {
  const decoder = new TextDecoder();
  let buffer = "";
  let linesWritten = 0;
  let bytesWritten = 0;
  let pendingWrite = "";
  let stoppedAtRequestTime = false;

  const flushPendingWrite = async () => {
    if (!pendingWrite) return;
    const chunk = pendingWrite;
    pendingWrite = "";
    await writeBytes(writeStream, Buffer.from(chunk, "utf8"), gate);
    bytesWritten += Buffer.byteLength(chunk, "utf8");
  };

  const emitProgress = (extra = {}) =>
    mergeDownloadProgress(
      { linesWritten, bytesWritten, ...extra },
      progressTracker.snapshot({ stoppedAtRequestTime, linesWritten }),
    );

  // Analysis-only ingest is CPU-bound on the main thread; keep the event loop
  // responsive by yielding on a time budget between progress ticks.
  const cooperative = Boolean(onLine);
  let lastYield = cooperative ? performance.now() : 0;

  readLoop: while (true) {
    if (signal?.aborted) {
      await flushPendingWrite();
      await reader.cancel().catch(() => {});
      throw new DOMException("Aborted", "AbortError");
    }

    const readStart = profiler ? performance.now() : 0;
    const { done, value } = await readWithAbortSignal(reader, signal);
    if (profiler) {
      profiler.readWaitMs += performance.now() - readStart;
      profiler.reads += 1;
      profiler.bytes += value?.length ?? 0;
    }
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    let segStart = profiler ? performance.now() : 0;
    for (const line of lines) {
      if (!line) continue;
      const trimmed = line.charCodeAt(0) <= 32 ? line.trim() : line;
      if (!trimmed) continue;

      const ingest = progressTracker.ingestLine(trimmed);
      if (ingest === "stop") {
        stoppedAtRequestTime = true;
        if (profiler) profiler.processMs += performance.now() - segStart;
        await flushPendingWrite();
        await reader.cancel().catch(() => {});
        break readLoop;
      }
      if (ingest === "skip") continue;

      const offset = onLine ? onLine(trimmed) : extractEventOffset(trimmed);
      if (offset) offsetState.lastOffset = offset;
      if (profiler) profiler.lines += 1;
      pendingWrite += `${trimmed}\n`;
      linesWritten += 1;

      if (linesWritten % PROGRESS_LINE_INTERVAL === 0) {
        // Exclude flush + yield (I/O) from processMs by resetting the segment.
        if (profiler) profiler.processMs += performance.now() - segStart;
        await flushPendingWrite();
        yield emitProgress();
        if (cooperative) lastYield = performance.now();
        if (profiler) segStart = performance.now();
      } else if (cooperative) {
        const now = performance.now();
        if (now - lastYield >= INGEST_YIELD_MS) {
          if (profiler) profiler.processMs += now - segStart;
          await flushPendingWrite();
          await yieldToEventLoop();
          lastYield = performance.now();
          if (profiler) segStart = performance.now();
        }
      }
    }
    if (profiler) profiler.processMs += performance.now() - segStart;
  }

  if (!stoppedAtRequestTime) {
    const tail = buffer.trim();
    if (tail) {
      const ingest = progressTracker.ingestLine(tail);
      if (ingest === "stop") {
        stoppedAtRequestTime = true;
      } else if (ingest === "ok") {
        const offset = onLine ? onLine(tail) : extractEventOffset(tail);
        if (offset) offsetState.lastOffset = offset;
        if (profiler) profiler.lines += 1;
        pendingWrite += `${tail}\n`;
        linesWritten += 1;
      }
    }
  }

  await flushPendingWrite();
  return { linesWritten, bytesWritten, stoppedAtRequestTime };
}

async function flushWriteStreamToDisk(writeStream) {
  if (!writeStream || writeStream.destroyed || writeStream.writableEnded) return;
  if (writeStream.fd != null) {
    await fs.promises.fsync(writeStream.fd).catch(() => {});
  }
}

async function maybeThrowPartialDownloadError(
  filePath,
  error,
  progressTracker,
  liveStats,
  writeStream,
) {
  await flushWriteStreamToDisk(writeStream);
  const progressSnapshot = progressTracker.snapshot({ linesWritten: liveStats.linesWritten });
  const reconciled = await reconcileDownloadedNdjsonFile(filePath, {
    liveLines: liveStats.linesWritten,
    liveBytes: liveStats.bytesWritten,
    trustLiveLines: liveStats.linesWritten > 0,
    skipProcessedScan: Boolean(
      progressSnapshot.oldestProcessed || progressSnapshot.newestProcessed,
    ),
    oldestProcessed: progressSnapshot.oldestProcessed ?? null,
    newestProcessed: progressSnapshot.newestProcessed ?? null,
  });
  const partialCapture = buildPartialCaptureMeta(filePath, reconciled);
  if (!partialCapture) return false;
  const formatted = formatRtdsStreamError(error, { phase: "download" });
  throw new AuditDownloadPartialError(formatted, partialCapture);
}

async function finalizeWriteStream(writeStream) {
  if (!writeStream || writeStream.destroyed || writeStream.writableEnded) return;
  writeStream.on("error", () => {});
  if (writeStream.fd != null) {
    await fs.promises.fsync(writeStream.fd).catch(() => {});
  }
  await new Promise((resolve, reject) => {
    writeStream.end(() => resolve());
    writeStream.once("error", () => resolve());
  });
}

async function refreshProcessedFromFile(progressTracker, filePath) {
  const scanned = await scanNdjsonProcessedRange(filePath);
  if (scanned.oldestProcessed) {
    progressTracker.noteLine(JSON.stringify({ processed: scanned.oldestProcessed }));
  }
  if (scanned.newestProcessed) {
    progressTracker.noteLine(JSON.stringify({ processed: scanned.newestProcessed }));
  }
  return scanned;
}

export async function* streamAuditEventsToFile(
  profile,
  filePath,
  {
    signal,
    latencyMs,
    timezone = "Europe/Paris",
    streamMode,
    excludedDeviceTypes = [],
    onLine = null,
    writeToFile = null,
    trackingOnly = false,
  } = {},
) {
  const liveIngest = Boolean(onLine);
  // `writeToFile` decouples raw-file persistence from live ingestion. By default
  // live ingest (analysis-only) skips the file, but a targeted run can ingest a
  // live baseline AND keep the raw NDJSON on disk for a second scoped pass.
  const persistRawFile = writeToFile ?? !liveIngest;
  // Kept name for the parts that mean "no raw file to reconcile".
  const analysisOnly = !persistRawFile;
  const mode = streamMode ?? AUDIT_STREAM_MODES.earliest_manual;
  const connectLatencyMs =
    latencyMs != null && latencyMs > 0
      ? latencyMs
      : mode.useLatency === false
        ? null
        : AUDIT_LATENCY_MS;
  const progressTracker = createDownloadProgressTracker(connectLatencyMs, timezone, mode);
  const isManualStop = mode.stopMode === "manual";
  const entitledTypes = auditRtdsTypes({ trackingOnly });
  const offsetState = { lastOffset: null };
  const liveStats = { linesWritten: 0, bytesWritten: 0 };

  let request = buildAuditConnectBody(entitledTypes, connectLatencyMs, mode.rtdsStart, null, {
    excludedDeviceTypes,
  });
  let types = entitledTypes;
  let excludedEntitlements = [];
  let connectAttempt = 0;
  let sessionAttempt = 0;
  let sentEntitlementStatus = false;

  yield {
    phase: "download",
    linesWritten: 0,
    bytesWritten: 0,
    ...progressTracker.snapshot(),
  };

  const { writeStream, gate } = persistRawFile
    ? openNdjsonWriteSink(filePath)
    : { writeStream: null, gate: { closed: false } };
  const profiler = createStreamProfiler();

  try {
    while (!signal?.aborted) {
      const resuming = Boolean(offsetState.lastOffset);
      let response;

      try {
        const opened = await openAuditRtdsStream(profile, {
          signal,
          latencyMs: connectLatencyMs,
          rtdsStart: mode.rtdsStart,
          resumeOffset: offsetState.lastOffset,
          excludedDeviceTypes,
          trackingOnly,
        });
        response = opened.response;
        request = opened.request;
        types = opened.types;
        excludedEntitlements = opened.excludedEntitlements ?? [];
        connectAttempt = 0;
      } catch (error) {
        if (error?.name === "AbortError" || signal?.aborted) break;
        connectAttempt += 1;
        console.warn(
          `[capture] RTDS connect failed (attempt ${connectAttempt}):`,
          error.message,
        );
        if (connectAttempt >= MAX_AUDIT_CONNECT_FAILURES) {
          await maybeThrowPartialDownloadError(
            filePath,
            error,
            progressTracker,
            liveStats,
            writeStream,
          );
          throw error;
        }
        const backoff = reconnectBackoffMs(connectAttempt);
        yield mergeDownloadProgress(
          {
            phase: "download",
            reconnecting: true,
            reconnectAttempt: connectAttempt,
            resumeOffset: offsetState.lastOffset ?? undefined,
            linesWritten: liveStats.linesWritten,
            bytesWritten: liveStats.bytesWritten,
            reconnectMessage: `RTDS connect failed — retrying in ${Math.ceil(backoff / 1000)}s…`,
          },
          progressTracker.snapshotVolume({ linesWritten: liveStats.linesWritten }),
        );
        await sleepMs(backoff, signal);
        continue;
      }

      if (excludedEntitlements.length > 0 && !sentEntitlementStatus) {
        sentEntitlementStatus = true;
        yield {
          phase: "entitlements",
          excludedTypes: excludedEntitlements,
          typesCount: types.length,
        };
      }

      sessionAttempt += 1;
      if (resuming || sessionAttempt > 1) {
        const backoffLabel =
          sessionAttempt > 1 && connectAttempt === 0
            ? offsetState.lastOffset
              ? "Resuming RTDS download from last offset…"
              : "Reconnecting RTDS download…"
            : null;
        yield mergeDownloadProgress(
          {
            phase: "download",
            reconnecting: true,
            reconnectAttempt: sessionAttempt - 1,
            resumeOffset: offsetState.lastOffset ?? undefined,
            linesWritten: liveStats.linesWritten,
            bytesWritten: liveStats.bytesWritten,
            reconnectMessage: backoffLabel,
          },
          progressTracker.snapshotVolume({ linesWritten: liveStats.linesWritten }),
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body from RTDS");
      }

      let downloadStats;
      let streamError = null;
      try {
        downloadStats = isManualStop
          ? yield* streamManualStopBinary(reader, writeStream, progressTracker, {
              signal,
              liveStats,
              gate,
              offsetState,
              onLine,
              profiler,
            })
          : yield* streamLatencyWindowLines(reader, writeStream, progressTracker, {
              signal,
              gate,
              offsetState,
              onLine,
              profiler,
            });
      } catch (error) {
        if (error?.name === "AbortError" || signal?.aborted) throw error;
        streamError = error;
        await reader.cancel().catch(() => {});
      }

      if (streamError) {
        if (isRtdsStreamTerminatedError(streamError)) {
          connectAttempt += 1;
          console.warn(
            `[capture] RTDS stream interrupted (attempt ${connectAttempt}), offset=${offsetState.lastOffset ?? "none"}:`,
            streamError.message,
          );
          const backoff = reconnectBackoffMs(connectAttempt);
          yield mergeDownloadProgress(
            {
              phase: "download",
              reconnecting: true,
              reconnectAttempt: connectAttempt,
              resumeOffset: offsetState.lastOffset ?? undefined,
              linesWritten: liveStats.linesWritten,
              bytesWritten: liveStats.bytesWritten,
              reconnectMessage: offsetState.lastOffset
                ? `RTDS stream paused — resuming in ${Math.ceil(backoff / 1000)}s…`
                : `RTDS stream interrupted — reconnecting in ${Math.ceil(backoff / 1000)}s…`,
            },
            progressTracker.snapshotVolume({ linesWritten: liveStats.linesWritten }),
          );
          try {
            await sleepMs(backoff, signal);
          } catch {
            break;
          }
          continue;
        }
        if (!analysisOnly) {
          await maybeThrowPartialDownloadError(
            filePath,
            streamError,
            progressTracker,
            liveStats,
            writeStream,
          );
        }
        throw streamError;
      }

      if (isManualStop && !signal?.aborted) {
        connectAttempt += 1;
        const backoff = reconnectBackoffMs(connectAttempt);
        console.log(
          `[capture] RTDS upstream closed after ${liveStats.linesWritten} events; resume in ${backoff}ms offset=${offsetState.lastOffset ?? "none"}`,
        );
        yield mergeDownloadProgress(
          {
            phase: "download",
            reconnecting: true,
            reconnectAttempt: connectAttempt,
            resumeOffset: offsetState.lastOffset ?? undefined,
            linesWritten: liveStats.linesWritten,
            bytesWritten: liveStats.bytesWritten,
            reconnectMessage: offsetState.lastOffset
              ? `RTDS stream paused — resuming in ${Math.ceil(backoff / 1000)}s…`
              : `RTDS stream paused — reconnecting in ${Math.ceil(backoff / 1000)}s…`,
          },
          progressTracker.snapshotVolume({ linesWritten: liveStats.linesWritten }),
        );
        try {
          await sleepMs(backoff, signal);
        } catch {
          break;
        }
        continue;
      }

      const stoppedAtRequestTime = downloadStats.stoppedAtRequestTime;
      const finalProgress = progressTracker.snapshot({
        complete: true,
        stoppedAtRequestTime,
      });

      yield mergeDownloadProgress(
        {
          linesWritten: downloadStats.linesWritten,
          bytesWritten: downloadStats.bytesWritten,
          done: true,
          stoppedAtRequestTime,
        },
        finalProgress,
      );

      await finalizeWriteStream(writeStream);

      return {
        request,
        filePath,
        linesWritten: downloadStats.linesWritten,
        bytesWritten: downloadStats.bytesWritten,
        types,
        excludedEntitlements,
        latencyMs: connectLatencyMs,
        stoppedAtRequestTime,
        ...finalProgress,
      };
    }

    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
  } catch (error) {
    gate.closed = true;
    try {
      await finalizeWriteStream(writeStream);
    } catch {
      closeNdjsonWriteSink(writeStream, gate);
    }

    if (error?.name === "AbortError" || signal?.aborted) {
      if (analysisOnly) {
        const finalProgress = progressTracker.snapshot({ linesWritten: liveStats.linesWritten });
        if (liveStats.linesWritten > 0) {
          return {
            request,
            filePath,
            linesWritten: liveStats.linesWritten,
            bytesWritten: liveStats.bytesWritten,
            types,
            excludedEntitlements,
            latencyMs: connectLatencyMs,
            stoppedManually: true,
            stoppedAtRequestTime: false,
            oldestProcessed: finalProgress.oldestProcessed,
            newestProcessed: finalProgress.newestProcessed,
            ...finalProgress,
          };
        }
        throw error;
      }

      const progressSnapshot = progressTracker.snapshot({ linesWritten: liveStats.linesWritten });
      const reconciled = await reconcileDownloadedNdjsonFile(filePath, {
        liveLines: liveStats.linesWritten,
        liveBytes: liveStats.bytesWritten,
        trustLiveLines: liveStats.linesWritten > 0,
        skipProcessedScan: Boolean(
          progressSnapshot.oldestProcessed || progressSnapshot.newestProcessed,
        ),
        oldestProcessed: progressSnapshot.oldestProcessed ?? null,
        newestProcessed: progressSnapshot.newestProcessed ?? null,
      });

      if (reconciled.linesWritten > 0 && !reconciled.oldestProcessed && !reconciled.newestProcessed) {
        await refreshProcessedFromFile(progressTracker, filePath).catch(() => {});
      }

      const finalProgress = progressTracker.snapshot({ linesWritten: reconciled.linesWritten });
      if (reconciled.linesWritten > 0) {
        return {
          request,
          filePath,
          linesWritten: reconciled.linesWritten,
          bytesWritten: reconciled.bytesWritten,
          types,
          excludedEntitlements,
          latencyMs: connectLatencyMs,
          stoppedManually: true,
          stoppedAtRequestTime: false,
          oldestProcessed: reconciled.oldestProcessed ?? finalProgress.oldestProcessed,
          newestProcessed: reconciled.newestProcessed ?? finalProgress.newestProcessed,
          ...finalProgress,
        };
      }
    }

    if (error?.name === "AuditDownloadPartialError") {
      throw error;
    }

    if (!analysisOnly) {
      await maybeThrowPartialDownloadError(filePath, error, progressTracker, liveStats, writeStream);
    }
    throw error;
  } finally {
    logStreamProfile(profiler, { analysisOnly });
  }

  throw new Error("Audit download ended unexpectedly");
}
