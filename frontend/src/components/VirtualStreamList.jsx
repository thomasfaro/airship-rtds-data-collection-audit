import { useVirtualizer } from "@tanstack/react-virtual";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import StreamDetailDrawer from "./StreamDetailDrawer.jsx";
import StreamEntryRow from "./StreamEntryRow.jsx";
import { streamEntryDomId } from "../lib/streamEntries.js";

/** Initial row height estimate (rows grow with attribute/custom/open badges). */
const ROW_ESTIMATE = 72;
const ROW_GAP = 6;
const SCROLL_PADDING_END = 16;
const NEAR_BOTTOM_PX = 120;
const NEAR_TOP_PX = 80;

function isNearBottom(el) {
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
}

function isNearTop(el) {
  if (!el) return true;
  return el.scrollTop <= NEAR_TOP_PX;
}

export const VirtualStreamList = forwardRef(function VirtualStreamList(
  { entries, timezone, isLive, panelClassName = "" },
  ref,
) {
  const parentRef = useRef(null);
  const prevLengthRef = useRef(0);
  const stickToBottomRef = useRef(true);
  const [selectedId, setSelectedId] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [awayFromTop, setAwayFromTop] = useState(false);
  const [pendingNew, setPendingNew] = useState(0);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_ESTIMATE + ROW_GAP,
    overscan: 12,
    scrollPaddingEnd: SCROLL_PADDING_END,
    getItemKey: (index) => entries[index]?.id ?? index,
  });

  const selectedEntry = entries.find((e) => e.id === selectedId) ?? null;

  const readAtBottom = useCallback(() => isNearBottom(parentRef.current), []);

  const applyScrollState = useCallback(() => {
    const el = parentRef.current;
    const atBottom = isNearBottom(el);
    const atTop = isNearTop(el);
    setAwayFromBottom(!atBottom);
    setAwayFromTop(!atTop);
    if (atBottom) {
      stickToBottomRef.current = true;
      setPendingNew(0);
    } else {
      stickToBottomRef.current = false;
    }
  }, []);

  const scrollToIndex = useCallback(
    (index, align = "center", behavior = "smooth") => {
      if (index < 0 || index >= entries.length) return;
      virtualizer.scrollToIndex(index, { align, behavior });
    },
    [entries.length, virtualizer],
  );

  const scrollToEntryId = useCallback(
    (entryId) => {
      const index = entries.findIndex((e) => e.id === entryId);
      if (index < 0) return;

      stickToBottomRef.current = false;
      setPendingNew(0);
      setAwayFromBottom(true);
      setHighlightId(entryId);

      virtualizer.scrollToIndex(index, { align: "center", behavior: "smooth" });

      // Fine-tune after the row is measured/rendered (variable-height rows).
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const container = parentRef.current;
          const el = container?.querySelector(`#${CSS.escape(streamEntryDomId(entryId))}`);
          if (!container || !el) return;
          const containerRect = container.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const relativeTop = elRect.top - containerRect.top + container.scrollTop;
          const targetTop = relativeTop - container.clientHeight / 2 + elRect.height / 2;
          container.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
        });
      });

      window.setTimeout(() => setHighlightId(null), 2000);
    },
    [entries, virtualizer],
  );

  const scrollToLatest = useCallback(() => {
    if (!entries.length) return;
    stickToBottomRef.current = true;
    setPendingNew(0);
    setAwayFromBottom(false);
    scrollToIndex(entries.length - 1, "end", "smooth");
  }, [entries.length, scrollToIndex]);

  const scrollToTop = useCallback(() => {
    if (!entries.length) return;
    stickToBottomRef.current = false;
    setPendingNew(0);
    setAwayFromTop(false);
    scrollToIndex(0, "start", "smooth");
  }, [entries.length, scrollToIndex]);

  const followLatest = useCallback(() => {
    if (!entries.length) return;
    scrollToIndex(entries.length - 1, "end", "auto");
    requestAnimationFrame(() => {
      applyScrollState();
    });
  }, [entries.length, scrollToIndex, applyScrollState]);

  useImperativeHandle(ref, () => ({ scrollToEntryId, scrollToLatest, scrollToTop }), [
    scrollToEntryId,
    scrollToLatest,
    scrollToTop,
  ]);

  const onScroll = useCallback(() => {
    applyScrollState();
  }, [applyScrollState]);

  useLayoutEffect(() => {
    const prevLen = prevLengthRef.current;
    const nextLen = entries.length;

    if (nextLen === 0) {
      prevLengthRef.current = 0;
      stickToBottomRef.current = true;
      setPendingNew(0);
      setAwayFromBottom(false);
      setAwayFromTop(false);
      return;
    }

    if (nextLen < prevLen) {
      prevLengthRef.current = nextLen;
      setPendingNew(0);
      applyScrollState();
      return;
    }

    const added = nextLen - prevLen;
    prevLengthRef.current = nextLen;

    if (prevLen === 0) {
      stickToBottomRef.current = true;
      setPendingNew(0);
      setAwayFromBottom(false);
      requestAnimationFrame(followLatest);
      return;
    }

    if (added === 0) return;

    const shouldFollow = stickToBottomRef.current || readAtBottom();

    if (shouldFollow) {
      requestAnimationFrame(followLatest);
    } else {
      setPendingNew((n) => n + added);
      setAwayFromBottom(true);
    }
  }, [entries.length, applyScrollState, followLatest, readAtBottom]);

  useEffect(() => {
    if (!selectedId) return;
    if (!entries.some((e) => e.id === selectedId)) setSelectedId(null);
  }, [entries, selectedId]);

  const showScrollFab = entries.length > 0;

  return (
    <div className={`relative flex h-full min-h-0 min-w-0 flex-1 flex-col ${panelClassName}`.trim()}>
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] text-airship-muted">
        <span>Oldest first · compact list · {entries.length} rows</span>
        {isLive && <span className="text-airship-blue">live</span>}
        {pendingNew > 0 && (
          <span className="ml-auto rounded bg-airship-blue-light px-2 py-0.5 font-medium text-airship-blue-dark">
            {pendingNew} new
          </span>
        )}
      </div>

      <div
        ref={parentRef}
        onScroll={onScroll}
        className="relative min-h-0 flex-1 overflow-y-auto scroll-pb-4 rounded border border-airship-border bg-airship-off-white/50"
      >
        <div
          style={{
            height: virtualizer.getTotalSize() + SCROLL_PADDING_END,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const entry = entries[virtualRow.index];
            return (
              <div
                key={entry.id}
                id={streamEntryDomId(entry.id)}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 top-0 w-full px-1"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                  paddingBottom: ROW_GAP,
                }}
              >
                <StreamEntryRow
                  entry={entry}
                  timezone={timezone}
                  selected={selectedId === entry.id}
                  highlighted={highlightId === entry.id}
                  onSelect={setSelectedId}
                />
              </div>
            );
          })}
        </div>
      </div>

      {showScrollFab && (
        <div className="pointer-events-none absolute bottom-6 right-3 z-10 flex flex-col items-end gap-2">
          {awayFromTop && (
            <button
              type="button"
              className="pointer-events-auto rounded-pill border border-airship-border-strong bg-airship-surface/95 px-3 py-2 text-xs font-semibold text-airship-navy shadow-lg backdrop-blur-sm transition hover:border-airship-blue hover:bg-airship-blue-light/40"
              onClick={scrollToTop}
              title="Scroll to oldest events"
            >
              ↑ Top
            </button>
          )}
          {(awayFromBottom || pendingNew > 0) && (
            <button
              type="button"
              className="pointer-events-auto rounded-pill border border-airship-blue bg-airship-blue px-3 py-2 text-xs font-semibold text-white shadow-lg transition hover:bg-airship-blue-dark"
              onClick={scrollToLatest}
              title="Scroll to newest events"
            >
              {pendingNew > 0 ? `↓ Latest (${pendingNew})` : "↓ Latest"}
            </button>
          )}
        </div>
      )}

      {selectedEntry && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/20"
            aria-label="Close detail"
            onClick={() => setSelectedId(null)}
          />
          <StreamDetailDrawer entry={selectedEntry} timezone={timezone} onClose={() => setSelectedId(null)} />
        </>
      )}
    </div>
  );
});
