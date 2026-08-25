import { useCallback, useMemo, useRef, useState } from "react";
import { buildOccurredTimeline } from "../lib/streamEntries.js";

function nearestMarker(markers, pct) {
  if (!markers.length) return null;
  let best = markers[0];
  let bestDist = Math.abs(markers[0].pct - pct);
  for (let i = 1; i < markers.length; i += 1) {
    const dist = Math.abs(markers[i].pct - pct);
    if (dist < bestDist) {
      best = markers[i];
      bestDist = dist;
    }
  }
  return best;
}

function tickLabelPositionHorizontal(tick) {
  if (tick.role === "start" || tick.pct <= 0) {
    return { left: "0%", transform: "translateX(0)", textAlign: "left" };
  }
  if (tick.role === "end" || tick.pct >= 100) {
    return { left: "100%", transform: "translateX(-100%)", textAlign: "right" };
  }
  return { left: `${tick.pct}%`, transform: "translateX(-50%)", textAlign: "center" };
}

function tickLabelPositionVertical(tick) {
  const pct = Math.min(98, Math.max(2, tick.pct));
  if (tick.role === "start" || tick.pct <= 0) {
    return { top: `${pct}%`, transform: "translateY(0)" };
  }
  if (tick.role === "end" || tick.pct >= 100) {
    return { top: `${pct}%`, transform: "translateY(-100%)" };
  }
  return { top: `${pct}%`, transform: "translateY(-50%)" };
}

function formatSpanDuration(spanMs) {
  if (!Number.isFinite(spanMs) || spanMs <= 0) return null;
  if (spanMs < 1_000) return `${Math.round(spanMs)} ms`;
  if (spanMs < 60_000) return `${(spanMs / 1_000).toFixed(spanMs < 10_000 ? 1 : 0)} s`;
  if (spanMs < 3_600_000) return `${(spanMs / 60_000).toFixed(spanMs < 600_000 ? 1 : 0)} min`;
  if (spanMs < 86_400_000) return `${(spanMs / 3_600_000).toFixed(1)} h`;
  return `${(spanMs / 86_400_000).toFixed(1)} d`;
}

const STREAM_PANEL_HEIGHT = "h-full min-h-0";

function HorizontalTimeline({ markers, axisTicks, spanLabel, eventCount, onSeek }) {
  const trackRef = useRef(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [activeId, setActiveId] = useState(null);

  const labelTicks = axisTicks.filter((t) => t.showLabel);
  const gridTicks = labelTicks.length ? labelTicks : axisTicks.filter((t) => t.major);

  const displayHovered =
    markers.find((m) => m.entryId === hoveredId) ?? markers.find((m) => m.entryId === activeId);

  const seekFromClientX = useCallback(
    (clientX) => {
      const track = trackRef.current;
      if (!track || !markers.length) return;
      const rect = track.getBoundingClientRect();
      const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
      const marker = nearestMarker(markers, pct);
      if (!marker) return;
      setActiveId(marker.entryId);
      onSeek?.(marker.entryId);
    },
    [markers, onSeek],
  );

  const onTrackKeyDown = (event) => {
    if (!markers.length) return;
    const idx = markers.findIndex((m) => m.entryId === activeId);
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      const next = markers[Math.min(markers.length - 1, idx < 0 ? 0 : idx + 1)];
      setActiveId(next.entryId);
      onSeek?.(next.entryId);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      const prev = markers[Math.max(0, idx <= 0 ? 0 : idx - 1)];
      setActiveId(prev.entryId);
      onSeek?.(prev.entryId);
    }
  };

  return (
    <div className="shrink-0 rounded border border-airship-border bg-airship-surface/95 px-2 py-2 text-xs shadow-sm backdrop-blur-sm">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="font-semibold text-airship-navy">Timeline</span>
        <span className="text-airship-muted">({eventCount} with occurred)</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-airship-body" title={spanLabel}>
          {spanLabel}
        </span>
        {displayHovered && (
          <span className="shrink-0 rounded bg-airship-blue-light px-1.5 py-0.5 font-mono text-[10px] font-medium text-airship-navy">
            {displayHovered.type} · {displayHovered.label}
          </span>
        )}
      </div>

      {labelTicks.length > 0 && (
        <div className="relative mb-1 h-4">
          {labelTicks.map((tick) => {
            const pos = tickLabelPositionHorizontal(tick);
            return (
              <span
                key={`label-${tick.ms}-${tick.role}`}
                className={`pointer-events-none absolute top-0 max-w-[5.5rem] truncate font-mono leading-none ${
                  tick.major ? "text-[10px] font-semibold text-airship-navy" : "text-[9px] text-airship-muted"
                }`}
                style={{ left: pos.left, transform: pos.transform, textAlign: pos.textAlign }}
                title={tick.label}
              >
                {tick.label}
              </span>
            );
          })}
        </div>
      )}

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Navigate events by occurred time"
        aria-valuemin={0}
        aria-valuemax={100}
        className="relative h-10 cursor-pointer rounded border border-airship-border bg-gradient-to-r from-airship-off-white via-airship-blue-light/25 to-airship-off-white focus:outline-none focus-visible:ring-2 focus-visible:ring-airship-blue"
        onClick={(e) => seekFromClientX(e.clientX)}
        onKeyDown={onTrackKeyDown}
      >
        {gridTicks.map((tick) => (
          <div
            key={`grid-${tick.ms}-${tick.role}`}
            className={`pointer-events-none absolute bottom-0 top-0 w-px ${
              tick.major ? "bg-airship-blue/35" : "bg-airship-border-strong/80"
            }`}
            style={{ left: `${tick.pct}%`, transform: "translateX(-50%)" }}
            aria-hidden
          />
        ))}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-airship-border-strong" />
        {markers.map((marker) => (
          <button
            key={marker.entryId}
            type="button"
            title={`${marker.type} · ${marker.label}`}
            className={`absolute top-1/2 z-[1] h-3.5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-sm transition hover:h-6 hover:w-1.5 ${
              activeId === marker.entryId ? "h-6 w-1.5 ring-1 ring-airship-navy" : ""
            }`}
            style={{ left: `${marker.pct}%`, backgroundColor: marker.color }}
            onMouseEnter={() => setHoveredId(marker.entryId)}
            onMouseLeave={() => setHoveredId(null)}
            onClick={(event) => {
              event.stopPropagation();
              setActiveId(marker.entryId);
              onSeek?.(marker.entryId);
            }}
          />
        ))}
      </div>

      <p className="mt-1 text-[10px] text-airship-muted">
        Oldest left, newest right · click the bar or a tick to jump
      </p>
    </div>
  );
}

function VerticalTimeline({ markers, axisTicks, spanLabel, spanMs, eventCount, onSeek }) {
  const trackRef = useRef(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [activeId, setActiveId] = useState(null);

  const labelTicks = axisTicks.filter((t) => t.showLabel);
  const gridTicks = labelTicks.length ? labelTicks : axisTicks.filter((t) => t.major);
  const spanHint = formatSpanDuration(spanMs);

  const hovered = markers.find((m) => m.entryId === hoveredId) ?? markers.find((m) => m.entryId === activeId);

  const seekFromClientY = useCallback(
    (clientY) => {
      const track = trackRef.current;
      if (!track || !markers.length) return;
      const rect = track.getBoundingClientRect();
      const pct = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));
      const marker = nearestMarker(markers, pct);
      if (!marker) return;
      setActiveId(marker.entryId);
      onSeek?.(marker.entryId);
    },
    [markers, onSeek],
  );

  const onTrackKeyDown = (event) => {
    if (!markers.length) return;
    const idx = markers.findIndex((m) => m.entryId === activeId);
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      const next = markers[Math.min(markers.length - 1, idx < 0 ? 0 : idx + 1)];
      setActiveId(next.entryId);
      onSeek?.(next.entryId);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      const prev = markers[Math.max(0, idx <= 0 ? 0 : idx - 1)];
      setActiveId(prev.entryId);
      onSeek?.(prev.entryId);
    }
  };

  return (
    <aside
      className={`hidden w-36 shrink-0 self-stretch sm:block md:w-44 lg:w-48 ${STREAM_PANEL_HEIGHT}`}
      aria-label="Event timeline"
    >
      <div className="flex h-full flex-col overflow-hidden rounded-xl border-2 border-airship-blue/25 bg-airship-surface/98 shadow-md backdrop-blur-sm">
        <div className="shrink-0 border-b border-airship-border bg-airship-blue-light/20 px-2 py-2 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wide text-airship-navy">Timeline</p>
          <p className="text-[10px] text-airship-muted">{eventCount} events{spanHint ? ` · ${spanHint}` : ""}</p>
        </div>

        <div className="relative flex min-h-0 flex-1 px-2 py-3">
          {/* Time labels */}
          <div className="relative w-16 shrink-0 md:w-[4.5rem]">
            {labelTicks.map((tick) => {
              const pos = tickLabelPositionVertical(tick);
              return (
                <span
                  key={`vlabel-${tick.ms}-${tick.role}`}
                  className="pointer-events-none absolute left-0 max-w-full font-mono text-[9px] font-semibold leading-tight text-airship-navy md:text-[10px]"
                  style={{ top: pos.top, transform: pos.transform }}
                  title={tick.label}
                >
                  {tick.label}
                </span>
              );
            })}
          </div>

          {/* Vertical track */}
          <div
            ref={trackRef}
            role="slider"
            tabIndex={0}
            aria-label="Navigate events by occurred time"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-orientation="vertical"
            className="relative mx-1 w-5 flex-1 cursor-pointer rounded-lg border border-airship-border bg-gradient-to-b from-airship-off-white via-airship-blue-light/30 to-airship-off-white focus:outline-none focus-visible:ring-2 focus-visible:ring-airship-blue md:w-6"
            onClick={(e) => seekFromClientY(e.clientY)}
            onKeyDown={onTrackKeyDown}
          >
            {gridTicks.map((tick) => (
              <div
                key={`vgrid-${tick.ms}-${tick.role}`}
                className="pointer-events-none absolute left-0 right-0 h-px bg-airship-blue/35"
                style={{ top: `${tick.pct}%` }}
                aria-hidden
              />
            ))}

            <div className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-airship-border-strong" />

            {markers.map((marker) => (
              <button
                key={marker.entryId}
                type="button"
                title={`${marker.type} · ${marker.label}`}
                className={`absolute left-1/2 z-[1] h-1.5 w-5 rounded-sm transition hover:h-2 hover:w-8 md:w-6 ${
                  activeId === marker.entryId ? "h-2 w-8 ring-2 ring-airship-navy ring-offset-1" : ""
                }`}
                style={{
                  top: `${marker.pct}%`,
                  backgroundColor: marker.color,
                  transform: "translate(-50%, -50%)",
                }}
                onMouseEnter={() => setHoveredId(marker.entryId)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveId(marker.entryId);
                  onSeek?.(marker.entryId);
                }}
              />
            ))}
          </div>
        </div>

        <div className="shrink-0 border-t border-airship-border bg-airship-off-white/80 px-2 py-2">
          {hovered ? (
            <p className="font-mono text-[9px] font-semibold leading-snug text-airship-navy md:text-[10px]" title={`${hovered.type} · ${hovered.label}`}>
              {hovered.type}
            </p>
          ) : (
            <p className="font-mono text-[9px] leading-snug text-airship-muted md:text-[10px]" title={spanLabel}>
              {spanLabel}
            </p>
          )}
          <p className="mt-1 text-[9px] text-airship-muted">↑ oldest · ↓ newest</p>
        </div>
      </div>
    </aside>
  );
}

export default function StreamTimeline({ entries, timezone, onSeek, layout = "horizontal" }) {
  const { markers, axisTicks, spanLabel, spanMs } = useMemo(
    () => buildOccurredTimeline(entries, timezone),
    [entries, timezone],
  );

  const eventCount = markers.length;
  if (eventCount === 0) return null;

  if (layout === "sidebar") {
    return (
      <VerticalTimeline
        markers={markers}
        axisTicks={axisTicks}
        spanLabel={spanLabel}
        spanMs={spanMs}
        eventCount={eventCount}
        onSeek={onSeek}
      />
    );
  }

  return (
    <HorizontalTimeline
      markers={markers}
      axisTicks={axisTicks}
      spanLabel={spanLabel}
      eventCount={eventCount}
      onSeek={onSeek}
    />
  );
}
