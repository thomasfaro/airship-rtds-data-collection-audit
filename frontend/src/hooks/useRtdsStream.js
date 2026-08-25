import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildStreamUrl,
  fetchLiveStreamCapture,
  releaseLiveStream,
} from "../services/rtdsApi.js";
import { createEarliestStreamProgress, noteEarliestStreamEvent } from "../lib/processedHours.js";
import { streamParamsFromFilters } from "../lib/streamRequestFilters.js";

let entryId = 0;

const MAX_CLIENT_BACKOFF_MS = 30_000;
/** Batch background SSE stats so navigation stays responsive under load. */
const BACKGROUND_STATS_FLUSH_MS = 400;
/** RAM cap for on-screen list when no_limit is set (server capture keeps full history). */
export const NO_LIMIT_DISPLAY_CAP = 5000;

function nextId() {
  entryId += 1;
  return `entry-${entryId}`;
}

function newEntry(base) {
  return { ...base, receivedAt: Date.now() };
}

function clientReconnectDelayMs(attempt) {
  return Math.min(MAX_CLIENT_BACKOFF_MS, 1000 * 2 ** Math.min(Math.max(attempt - 1, 0), 5));
}

export function useRtdsStream({ getUiLimit, backgroundModeRef }) {
  const sourceRef = useRef(null);
  const pendingRef = useRef([]);
  const flushRafRef = useRef(null);
  const streamIdRef = useRef(null);
  const streamProfileRef = useRef(null);
  const streamMetaRef = useRef({ start: "LATEST", timezone: "Europe/Paris" });
  const activeFiltersRef = useRef(null);
  const userStoppedRef = useRef(true);
  const reconnectTimerRef = useRef(null);
  const clientReconnectAttemptRef = useRef(0);
  const connectInternalRef = useRef(null);
  const captureLinesAtBackgroundRef = useRef(0);
  const backgroundPendingRef = useRef(0);
  const backgroundFlushTimerRef = useRef(null);
  const backgroundStatusSetRef = useRef(false);
  const foregroundLiveStatusSetRef = useRef(false);
  const [streamId, setStreamId] = useState(null);
  const [backgroundEventCount, setBackgroundEventCount] = useState(0);
  const [entries, setEntries] = useState([]);
  const [status, setStatus] = useState({ text: "Disconnected", tone: "" });
  const [isLive, setIsLive] = useState(false);
  const [requestLabel, setRequestLabel] = useState("");
  const [earliestProgress, setEarliestProgress] = useState(null);
  const [hydratingCapture, setHydratingCapture] = useState(false);

  const isBackground = () => backgroundModeRef?.current === true;

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    userStoppedRef.current = true;
    clearReconnectTimer();
    sourceRef.current?.close();
    sourceRef.current = null;
    if (flushRafRef.current) {
      cancelAnimationFrame(flushRafRef.current);
      flushRafRef.current = null;
    }
    if (backgroundFlushTimerRef.current) {
      clearTimeout(backgroundFlushTimerRef.current);
      backgroundFlushTimerRef.current = null;
    }
    pendingRef.current = [];
    backgroundPendingRef.current = 0;
    backgroundStatusSetRef.current = false;
    foregroundLiveStatusSetRef.current = false;
    captureLinesAtBackgroundRef.current = 0;
    setStreamId(null);
    setBackgroundEventCount(0);
    setIsLive(false);
    setStatus({ text: "Disconnected", tone: "" });
  }, [clearReconnectTimer]);

  const releaseServerResources = useCallback(async () => {
    const sid = streamIdRef.current;
    const profile = streamProfileRef.current;
    streamIdRef.current = null;
    streamProfileRef.current = null;
    setStreamId(null);
    await releaseLiveStream({ streamId: sid, profile });
  }, []);

  const trimEntries = useCallback(
    (list) => {
      const limit = getUiLimit?.();
      const cap =
        limit === null || limit === undefined
          ? NO_LIMIT_DISPLAY_CAP
          : Number.isFinite(limit) && limit >= 1
            ? limit
            : NO_LIMIT_DISPLAY_CAP;
      return list.slice(0, cap);
    },
    [getUiLimit],
  );

  const flushPending = useCallback(() => {
    flushRafRef.current = null;
    const batch = pendingRef.current.splice(0);
    if (!batch.length) return;
    setEntries((current) => trimEntries([...batch, ...current]));
  }, [trimEntries]);

  const queueEntries = useCallback(
    (items) => {
      if (isBackground()) return;
      pendingRef.current.push(...items);
      if (!flushRafRef.current) {
        flushRafRef.current = requestAnimationFrame(flushPending);
      }
    },
    [flushPending, backgroundModeRef],
  );

  useEffect(
    () => () => {
      if (flushRafRef.current) cancelAnimationFrame(flushRafRef.current);
      if (backgroundFlushTimerRef.current) clearTimeout(backgroundFlushTimerRef.current);
      clearReconnectTimer();
    },
    [clearReconnectTimer],
  );

  const flushBackgroundStats = useCallback(() => {
    if (backgroundFlushTimerRef.current) {
      clearTimeout(backgroundFlushTimerRef.current);
      backgroundFlushTimerRef.current = null;
    }
    const pending = backgroundPendingRef.current;
    if (pending <= 0) return;
    backgroundPendingRef.current = 0;
    setBackgroundEventCount((count) => count + pending);
  }, []);

  const noteBackgroundEvent = useCallback(() => {
    backgroundPendingRef.current += 1;
    if (!backgroundFlushTimerRef.current) {
      backgroundFlushTimerRef.current = window.setTimeout(
        flushBackgroundStats,
        BACKGROUND_STATS_FLUSH_MS,
      );
    }
  }, [flushBackgroundStats]);

  const handlePayload = useCallback(
    (payload, setStatusFn) => {
      if (payload.kind === "event" && payload.event) {
        clientReconnectAttemptRef.current = 0;
        if (isBackground()) {
          noteBackgroundEvent();
          if (!backgroundStatusSetRef.current) {
            backgroundStatusSetRef.current = true;
            setStatusFn({ text: "Live (background)", tone: "live" });
          }
          return;
        }
        backgroundStatusSetRef.current = false;
        if (!foregroundLiveStatusSetRef.current) {
          foregroundLiveStatusSetRef.current = true;
          setStatusFn({ text: "Live", tone: "live" });
        }
        if (streamMetaRef.current.start === "EARLIEST") {
          setEarliestProgress((current) =>
            noteEarliestStreamEvent(
              current ?? createEarliestStreamProgress(),
              payload.event,
              streamMetaRef.current.timezone,
            ),
          );
        }
        queueEntries([newEntry({ id: nextId(), kind: "event", event: payload.event })]);
        return;
      }
      if (payload.kind === "error") {
        const label = payload.message || "Error";
        setStatusFn({ text: label.length > 80 ? `${label.slice(0, 77)}…` : label, tone: "error" });
        if (!isBackground()) {
          queueEntries([newEntry({ id: nextId(), kind: "message", payload, isError: true })]);
        }
        sourceRef.current?.close();
        sourceRef.current = null;
        setIsLive(false);
        userStoppedRef.current = true;
        return;
      }
      if (payload.kind === "done") {
        setStatusFn({ text: payload.message || "Loaded history", tone: "live" });
        if (!isBackground()) {
          queueEntries([newEntry({ id: nextId(), kind: "message", payload })]);
        }
        sourceRef.current?.close();
        sourceRef.current = null;
        setIsLive(false);
        userStoppedRef.current = true;
        return;
      }
      if (!isBackground()) {
        setStatusFn({ text: "Live, waiting for matching events", tone: "live" });
        queueEntries([newEntry({ id: nextId(), kind: "message", payload })]);
      }
    },
    [queueEntries, noteBackgroundEvent, backgroundModeRef],
  );

  const scheduleClientReconnect = useCallback(
    (reason) => {
      const filters = activeFiltersRef.current;
      if (!filters || userStoppedRef.current) return;

      clearReconnectTimer();
      clientReconnectAttemptRef.current += 1;
      const delay = clientReconnectDelayMs(clientReconnectAttemptRef.current);
      setStatus({
        text: `${reason} — reconnecting in ${Math.ceil(delay / 1000)}s…`,
        tone: "error",
      });
      setIsLive(true);

      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        if (userStoppedRef.current || !activeFiltersRef.current) return;
        connectInternalRef.current?.(activeFiltersRef.current, { isReconnect: true });
      }, delay);
    },
    [clearReconnectTimer],
  );

  const handleStatusPayload = useCallback(
    (payload, setStatusFn) => {
      if (payload.streamId) {
        streamIdRef.current = payload.streamId;
        setStreamId(payload.streamId);
      }
      if (payload.profile) streamProfileRef.current = payload.profile;

      if (payload.phase === "reconnect") {
        const msg = payload.message || "Reconnecting to RTDS…";
        setStatusFn({ text: msg.length > 96 ? `${msg.slice(0, 93)}…` : msg, tone: "live" });
        if (!isBackground()) {
          queueEntries([
            newEntry({
              id: nextId(),
              kind: "message",
              payload: { kind: "status", ...payload },
            }),
          ]);
        }
        return;
      }

      clientReconnectAttemptRef.current = 0;
      foregroundLiveStatusSetRef.current = false;
      backgroundStatusSetRef.current = false;
      const dropped = payload.droppedTypes?.length
        ? ` (${payload.droppedTypes.length} invalid type(s) removed)`
        : "";
      const resumed = payload.resumed ? " — resumed" : payload.message === "reconnected" ? " — reconnected" : "";
      setStatusFn({
        text: `Connected — ${payload.profile}${resumed}${dropped}`,
        tone: "live",
      });

      if (payload.droppedTypes?.length && !isBackground()) {
        queueEntries([
          newEntry({
            id: nextId(),
            kind: "message",
            payload: {
              kind: "warning",
              message: "Some selected types are not valid RTDS filters and were ignored.",
              droppedTypes: payload.droppedTypes,
            },
          }),
        ]);
      }
    },
    [queueEntries, backgroundModeRef],
  );

  const connectInternalStream = useCallback(
    async (filters, { isReconnect = false } = {}) => {
      clearReconnectTimer();
      sourceRef.current?.close();
      sourceRef.current = null;

      if (!isReconnect) {
        setEntries([]);
        captureLinesAtBackgroundRef.current = 0;
        setBackgroundEventCount(0);
        streamMetaRef.current = {
          start: String(filters.start ?? "LATEST").toUpperCase(),
          timezone: filters.timezone || "Europe/Paris",
        };
        setEarliestProgress(
          streamMetaRef.current.start === "EARLIEST" ? createEarliestStreamProgress() : null,
        );
      }

      if (!isReconnect) {
        setStatus({ text: "Connecting...", tone: "" });
      } else {
        setStatus({ text: "Reconnecting to server…", tone: "" });
      }

      const params = streamParamsFromFilters(filters, { includeProfile: true, includeServerLimit: true });
      let url;
      try {
        url = await buildStreamUrl(params);
      } catch (error) {
        setStatus({ text: error.message, tone: "error" });
        if (!userStoppedRef.current) {
          scheduleClientReconnect("Server URL error");
        }
        return;
      }

      streamProfileRef.current = filters.profile || null;
      if (!isReconnect) {
        streamIdRef.current = null;
        setStreamId(null);
      }
      setRequestLabel(`/api/stream?${params.toString()}`);

      const source = new EventSource(url);
      sourceRef.current = source;
      setIsLive(true);

      source.onopen = () => {
        clientReconnectAttemptRef.current = 0;
      };

      source.onmessage = (message) => {
        try {
          const payload = JSON.parse(message.data);
          if (payload.kind === "status") {
            handleStatusPayload(payload, setStatus);
            return;
          }
          handlePayload(payload, setStatus);
        } catch (error) {
          setStatus({ text: "Render error", tone: "error" });
          if (!isBackground()) {
            queueEntries([
              newEntry({
                id: nextId(),
                kind: "message",
                payload: { kind: "render_error", message: error.message, raw: message.data },
                isError: true,
              }),
            ]);
          }
        }
      };

      source.onerror = () => {
        if (userStoppedRef.current) return;
        source.close();
        sourceRef.current = null;
        scheduleClientReconnect("Connection interrupted");
      };
    },
    [clearReconnectTimer, handlePayload, handleStatusPayload, queueEntries, scheduleClientReconnect, backgroundModeRef],
  );
  connectInternalRef.current = connectInternalStream;

  const startStream = useCallback(
    async (filters) => {
      stopStream();
      userStoppedRef.current = false;
      clientReconnectAttemptRef.current = 0;
      activeFiltersRef.current = filters;
      await connectInternalStream(filters);
    },
    [connectInternalStream, stopStream],
  );

  const clearEntries = useCallback(() => {
    pendingRef.current = [];
    if (flushRafRef.current) {
      cancelAnimationFrame(flushRafRef.current);
      flushRafRef.current = null;
    }
    setEntries([]);
    setEarliestProgress(null);
    captureLinesAtBackgroundRef.current = 0;
    setBackgroundEventCount(0);
  }, []);

  const snapshotCaptureLines = useCallback(async () => {
    const sid = streamIdRef.current;
    if (!sid) return 0;
    try {
      const payload = await fetchLiveStreamCapture({ streamId: sid, afterLines: 0 });
      captureLinesAtBackgroundRef.current = payload.totalLines ?? 0;
      return captureLinesAtBackgroundRef.current;
    } catch {
      return captureLinesAtBackgroundRef.current;
    }
  }, []);

  const hydrateFromCapture = useCallback(async () => {
    const sid = streamIdRef.current;
    if (!sid) return;
    setHydratingCapture(true);
    try {
      const payload = await fetchLiveStreamCapture({
        streamId: sid,
        afterLines: captureLinesAtBackgroundRef.current,
      });
      const events = payload.events ?? [];
      if (events.length) {
        setEntries((current) => {
          const existingIds = new Set(
            current.filter((entry) => entry.kind === "event").map((entry) => entry.event?.id).filter(Boolean),
          );
          const fresh = events
            .filter((event) => !event?.id || !existingIds.has(event.id))
            .map((event) => newEntry({ id: nextId(), kind: "event", event }));
          if (!fresh.length) return current;
          return trimEntries([...fresh, ...current]);
        });
      }
      captureLinesAtBackgroundRef.current = payload.totalLines ?? captureLinesAtBackgroundRef.current;
      setBackgroundEventCount(0);
    } finally {
      setHydratingCapture(false);
    }
  }, [trimEntries]);

  return {
    entries,
    status,
    isLive,
    requestLabel,
    earliestProgress,
    streamId,
    backgroundEventCount,
    hydratingCapture,
    startStream,
    stopStream,
    clearEntries,
    releaseServerResources,
    snapshotCaptureLines,
    hydrateFromCapture,
    flushBackgroundStats,
  };
}
