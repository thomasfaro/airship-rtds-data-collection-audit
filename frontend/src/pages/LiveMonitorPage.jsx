import { useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import DisplayFilters from "../components/DisplayFilters.jsx";
import LiveMonitorHeader from "../components/LiveMonitorHeader.jsx";
import LiveRequestSummary from "../components/LiveRequestSummary.jsx";
import StreamTimeline from "../components/StreamTimeline.jsx";
import { VirtualStreamList } from "../components/VirtualStreamList.jsx";
import { DEFAULT_TIMEZONE, useLiveStream } from "../contexts/LiveStreamContext.jsx";
import { APP_ROUTES } from "../lib/appNav.js";
import { allEventTypeOptions, EMPTY_DISPLAY_FILTERS } from "../lib/eventRegistry.js";

export default function LiveMonitorPage() {
  const listRef = useRef(null);
  const {
    filters,
    activeRequest,
    displayFilters,
    setDisplayFilters,
    status,
    isLive,
    requestLabel,
    earliestProgress,
    stopStreamKeepEvents,
    clearEntries,
    visibleEntries,
    eventCount,
    visibleCount,
    hydratingCapture,
  } = useLiveStream();

  const requestForSummary = activeRequest ?? filters;
  const displayEventTypeOptions = useMemo(() => allEventTypeOptions(), []);
  const timezone = filters.timezone || DEFAULT_TIMEZONE;
  const isEarliestRequest =
    String(requestForSummary?.start ?? "LATEST").toUpperCase() === "EARLIEST";

  const headerStatus =
    !isLive && eventCount > 0
      ? { text: "Stopped — events kept for review", tone: "" }
      : status;

  const seekFromTimeline = (entryId) => {
    listRef.current?.scrollToEntryId(entryId);
  };

  return (
    <div className="-mx-4 flex h-[calc(100dvh-7rem)] max-h-[calc(100dvh-7rem)] flex-col overflow-hidden md:-mx-6">
      <LiveMonitorHeader
        status={headerStatus}
        isLive={isLive}
        visibleCount={visibleCount}
        eventCount={eventCount}
        showProcessedRange={isEarliestRequest}
        earliestProgress={earliestProgress}
        onClear={clearEntries}
        onStop={stopStreamKeepEvents}
      />

      {!isLive && eventCount === 0 && !hydratingCapture ? (
        <p className="mx-2 mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
          No active stream. <Link to={APP_ROUTES.live}>Start a stream</Link>
        </p>
      ) : null}
      {hydratingCapture ? (
        <p className="mx-2 mt-2 rounded border border-teal-200 bg-teal-50 px-2 py-1 text-xs text-teal-900">
          Loading events received while you were away…
        </p>
      ) : null}

      <LiveRequestSummary compact filters={requestForSummary} requestLabel={requestLabel} />

      <DisplayFilters
        compact
        filters={displayFilters}
        eventTypeOptions={displayEventTypeOptions}
        onChange={setDisplayFilters}
        onClear={() => setDisplayFilters(EMPTY_DISPLAY_FILTERS)}
      />

      <div className="flex min-h-0 flex-1 items-stretch gap-3 overflow-hidden px-2 pb-2">
        <StreamTimeline
          layout="sidebar"
          entries={visibleEntries}
          timezone={timezone}
          onSeek={seekFromTimeline}
        />

        {visibleEntries.length === 0 ? (
          <p className="min-w-0 flex-1 rounded border border-dashed border-airship-border px-4 py-6 text-center text-xs text-airship-muted">
            {isLive ? "Waiting for matching events…" : "No events to show."}
          </p>
        ) : (
          <VirtualStreamList
            ref={listRef}
            entries={visibleEntries}
            timezone={timezone}
            isLive={isLive}
          />
        )}
      </div>
    </div>
  );
}
