import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  EMPTY_DISPLAY_FILTERS,
  displayFiltersFromState,
  matchesDisplayFilters,
  streamRtdsEventTypeOptions,
} from "../lib/eventRegistry.js";
import { liveStreamFilters } from "../lib/streamRequestFilters.js";
import { useRtdsStream } from "../hooks/useRtdsStream.js";
import { sortEntriesChronologically } from "../lib/streamEntries.js";
import { shouldAutostart, useApplyQueryParams } from "../hooks/useQueryParams.js";
import { APP_ROUTES } from "../lib/appNav.js";
import { useProfiles } from "./ProfilesContext.jsx";

export const DEFAULT_TIMEZONE = "Europe/Paris";

export const STREAM_FIELD_IDS = [
  "profile",
  "start",
  "types",
  "device_types",
  "named_user",
  "timezone",
  "channel",
  "push_id",
  "campaign_category",
  "attribute_key",
  "limit",
];

export const INITIAL_FILTERS = {
  profile: "",
  start: "LATEST",
  types: "",
  device_types: "",
  named_user: "",
  timezone: DEFAULT_TIMEZONE,
  channel: "",
  push_id: "",
  campaign_category: "",
  attribute_key: "",
  limit: "10000",
  no_limit: false,
  store_raw: false,
};

const LiveStreamContext = createContext(null);

const LIVE_MONITOR_PATH = APP_ROUTES.liveMonitor;

export function LiveStreamProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const onMonitorPage = location.pathname === LIVE_MONITOR_PATH;
  const backgroundModeRef = useRef(!onMonitorPage);
  backgroundModeRef.current = !onMonitorPage;

  const { names: profiles, profiles: profileItems, decryptFailures } = useProfiles();
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [displayFilters, setDisplayFilters] = useState(EMPTY_DISPLAY_FILTERS);
  const [activeRequest, setActiveRequest] = useState(null);
  const streamEventTypeOptions = useMemo(() => streamRtdsEventTypeOptions(), []);
  const autostartedRef = useRef(false);
  const wasOnMonitorRef = useRef(onMonitorPage);

  const getUiLimit = useCallback(() => {
    if (filters.no_limit) return null;
    const limit = Number(filters.limit || 1000);
    return Number.isFinite(limit) && limit >= 1 ? limit : 1000;
  }, [filters.no_limit, filters.limit]);

  const {
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
  } = useRtdsStream({
    mode: "internal",
    getUiLimit,
    backgroundModeRef,
  });

  const teardownLiveStream = useCallback(() => {
    stopStream();
    clearEntries();
    void releaseServerResources();
    setActiveRequest(null);
  }, [stopStream, clearEntries, releaseServerResources]);

  useApplyQueryParams(setFilters, STREAM_FIELD_IDS);

  useEffect(() => {
    setFilters((current) => ({
      ...current,
      profile:
        current.profile && profiles.includes(current.profile) ? current.profile : profiles[0] || "",
    }));
  }, [profiles]);

  const startAndMonitor = useCallback(() => {
    const payload = liveStreamFilters(filters);
    setActiveRequest({
      ...filters,
      types: payload.types,
      attribute_key: payload.attribute_key ?? filters.attribute_key,
      start: payload.start,
    });
    startStream(payload);
    navigate(LIVE_MONITOR_PATH);
  }, [filters, navigate, startStream]);

  useEffect(() => {
    if (autostartedRef.current) return;
    if (!shouldAutostart() || !filters.profile) return;
    if (location.pathname !== APP_ROUTES.live && location.pathname !== LIVE_MONITOR_PATH) return;
    autostartedRef.current = true;
    const payload = liveStreamFilters(filters);
    setActiveRequest({
      ...filters,
      types: payload.types,
      attribute_key: payload.attribute_key ?? filters.attribute_key,
      start: payload.start,
    });
    startStream(payload);
    navigate(LIVE_MONITOR_PATH, { replace: true });
  }, [filters.profile, filters, navigate, startStream, location.pathname]);

  useEffect(() => {
    const captureEnabled = Boolean(activeRequest?.store_raw);
    if (wasOnMonitorRef.current && !onMonitorPage && isLive) {
      flushBackgroundStats();
      if (captureEnabled) void snapshotCaptureLines();
    }
    if (!wasOnMonitorRef.current && onMonitorPage && isLive) {
      if (captureEnabled) void hydrateFromCapture();
    }
    wasOnMonitorRef.current = onMonitorPage;
  }, [
    onMonitorPage,
    isLive,
    activeRequest,
    snapshotCaptureLines,
    hydrateFromCapture,
    flushBackgroundStats,
  ]);

  useEffect(() => {
    const onPageHide = (event) => {
      if (event.persisted) return;
      teardownLiveStream();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [teardownLiveStream]);

  const stopStreamKeepEvents = useCallback(() => {
    stopStream();
    void releaseServerResources();
  }, [stopStream, releaseServerResources]);

  const stopAndReturnToSetup = useCallback(() => {
    teardownLiveStream();
    navigate(APP_ROUTES.live);
  }, [navigate, teardownLiveStream]);

  const parsedDisplayFilters = useMemo(
    () => displayFiltersFromState(displayFilters),
    [displayFilters],
  );

  const visibleEntries = useMemo(() => {
    const filtered = entries.filter((entry) => matchesDisplayFilters(entry, parsedDisplayFilters));
    return sortEntriesChronologically(filtered);
  }, [entries, parsedDisplayFilters]);

  const eventCount = entries.filter((entry) => entry.kind === "event").length;
  const visibleCount = visibleEntries.filter((entry) => entry.kind === "event").length;
  const liveBackgroundCount = isLive && !onMonitorPage ? backgroundEventCount : 0;
  const displayEventCount = eventCount + liveBackgroundCount;

  const value = {
    profiles,
    profileItems,
    decryptFailures,
    filters,
    setFilters,
    activeRequest,
    displayFilters,
    setDisplayFilters,
    streamEventTypeOptions,
    entries,
    status,
    isLive,
    requestLabel,
    earliestProgress,
    streamId,
    backgroundEventCount: liveBackgroundCount,
    displayEventCount,
    hydratingCapture,
    onMonitorPage,
    startAndMonitor,
    stopStreamKeepEvents,
    stopAndReturnToSetup,
    teardownLiveStream,
    clearEntries,
    visibleEntries,
    eventCount,
    visibleCount,
  };

  return <LiveStreamContext.Provider value={value}>{children}</LiveStreamContext.Provider>;
}

export function useLiveStream() {
  const ctx = useContext(LiveStreamContext);
  if (!ctx) throw new Error("useLiveStream must be used within LiveStreamProvider");
  return ctx;
}

export function useLiveStreamOptional() {
  return useContext(LiveStreamContext);
}
