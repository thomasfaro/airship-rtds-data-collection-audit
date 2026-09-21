import { performance } from "node:perf_hooks";
import {
  AUDIT_STREAM_MODES,
  DEFAULT_AUDIT_WINDOW_HOURS,
  createDownloadProgressTracker,
} from "./auditWindow.js";
import { auditRtdsTypes } from "./registry.js";
import { openRtdsNdjsonStream } from "../rtds/openRtdsStream.js";
import {
  MAX_AUDIT_CONNECT_FAILURES,
  buildAuditConnectBody,
  reconnectBackoffMs,
  sleepMs,
} from "./auditStreamReconnect.js";
import { isRtdsStreamTerminatedError } from "../rtds/rtdsStreamErrors.js";

export { buildAuditRtdsBody } from "./auditRtdsBody.js";

export const AUDIT_LATENCY_MS = DEFAULT_AUDIT_WINDOW_HOURS * 60 * 60 * 1000;
const PROGRESS_LINE_INTERVAL = 10_000;
// Max contiguous time (ms) the ingest may hold the Node event loop before yielding.
// Keeps the single-threaded server responsive (SPA + other API/SSE requests) while a
// capture is being analysed line by line.
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

function logStreamProfile(profiler) {
  if (!profiler) return;
  const { readWaitMs, processMs, reads, lines, bytes } = profiler;
  const wallMs = readWaitMs + processMs;
  const cpuEps = processMs > 0 ? Math.round((lines / processMs) * 1000) : 0;
  const wallMbps = wallMs > 0 ? (bytes / 1_048_576 / (wallMs / 1000)).toFixed(2) : "0.00";
  const bound = processMs > readWaitMs ? "CPU" : "network";
  console.log(
    `[capture-profile] lines=${lines} bytes=${bytes} reads=${reads} ` +
      `readWaitMs=${Math.round(readWaitMs)} processMs=${Math.round(processMs)} ` +
      `cpuEvents/s=${cpuEps} wallMB/s=${wallMbps} bound=${bound}`,
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
  // The per-event work runs on the main thread, so it must periodically hand the
  // event loop back rather than hold it for the length of a chunk.
  let segStart = profiler ? performance.now() : 0;
  let lastYield = performance.now();

  for (let i = carryStart; i < scanBuf.length; i += 1) {
    if (scanBuf[i] !== 0x0a) continue;
    if (i <= start) {
      start = i + 1;
      continue;
    }

    const lineText = lineBytesToString(scanBuf.subarray(start, i));
    state.linesWritten += 1;
    if (profiler) profiler.lines += 1;
    // onLine (ingestAuditLine) parses the line once and hands back its offset, so
    // the offset never costs a second parse.
    const offset = lineText ? onLine(lineText) : null;
    if (offset) offsetState.lastOffset = offset;
    if (shouldSampleProcessed(state.linesWritten)) {
      progressTracker.noteLine(lineText);
    }
    start = i + 1;

    if (state.linesWritten % PROGRESS_LINE_INTERVAL === 0) {
      if (profiler) profiler.processMs += performance.now() - segStart;
      yield emitProgress();
      lastYield = performance.now();
      if (profiler) segStart = performance.now();
    } else {
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

async function* streamUntilStopped(
  reader,
  progressTracker,
  { signal, liveStats, offsetState, onLine, profiler },
) {
  let lineCarry = Buffer.alloc(0);
  const state = liveStats;
  state.linesWritten = 0;
  state.bytesWritten = 0;

  const emitProgress = (extra = {}) =>
    mergeDownloadProgress(
      { linesWritten: state.linesWritten, bytesWritten: state.bytesWritten, ...extra },
      progressTracker.snapshotVolume({ linesWritten: state.linesWritten }),
    );

  while (true) {
    if (signal?.aborted) {
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
      const offset = onLine(tail);
      if (offset) offsetState.lastOffset = offset;
      progressTracker.noteLine(tail);
    }
  }

  return {
    linesWritten: state.linesWritten,
    bytesWritten: state.bytesWritten,
  };
}

/**
 * Stream the tracking-only RTDS types and hand every line to `onLine` as it lands.
 * Nothing is written to disk: a capture is analysed as it arrives, and only the
 * finished report is saved.
 *
 * The upstream closing is not the end of a capture — RTDS ends a session long before
 * the operator does — so the loop reconnects from the last offset and only a stop or
 * a fatal error leaves it.
 */
export async function* streamAuditEvents(
  profile,
  {
    signal,
    latencyMs,
    timezone = "Europe/Paris",
    streamMode,
    excludedDeviceTypes = [],
    onLine,
    trackingOnly = false,
  } = {},
) {
  if (typeof onLine !== "function") {
    throw new Error("streamAuditEvents requires an onLine ingest callback");
  }

  const mode = streamMode ?? AUDIT_STREAM_MODES.earliest_manual;
  const connectLatencyMs =
    latencyMs != null && latencyMs > 0
      ? latencyMs
      : mode.useLatency === false
        ? null
        : AUDIT_LATENCY_MS;
  const progressTracker = createDownloadProgressTracker(connectLatencyMs, timezone, mode);
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
        downloadStats = yield* streamUntilStopped(reader, progressTracker, {
          signal,
          liveStats,
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
        throw streamError;
      }

      if (!signal?.aborted) {
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

      const finalProgress = progressTracker.snapshot({ complete: true });

      yield mergeDownloadProgress(
        {
          linesWritten: downloadStats.linesWritten,
          bytesWritten: downloadStats.bytesWritten,
          done: true,
        },
        finalProgress,
      );

      return {
        request,
        linesWritten: downloadStats.linesWritten,
        bytesWritten: downloadStats.bytesWritten,
        types,
        excludedEntitlements,
        latencyMs: connectLatencyMs,
        ...finalProgress,
      };
    }

    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
  } catch (error) {
    // A stop is the ordinary way a capture ends, and the events already ingested are
    // a usable tagging plan. Only a capture that read nothing has nothing to hand back.
    if (error?.name === "AbortError" || signal?.aborted) {
      const finalProgress = progressTracker.snapshot({ linesWritten: liveStats.linesWritten });
      if (liveStats.linesWritten > 0) {
        return {
          request,
          linesWritten: liveStats.linesWritten,
          bytesWritten: liveStats.bytesWritten,
          types,
          excludedEntitlements,
          latencyMs: connectLatencyMs,
          stoppedManually: true,
          ...finalProgress,
        };
      }
    }
    throw error;
  } finally {
    logStreamProfile(profiler);
  }

  throw new Error("Audit download ended unexpectedly");
}
