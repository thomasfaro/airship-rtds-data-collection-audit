import { effectiveEventType, eventMeta } from "./eventRegistry.js";

/** Parse RTDS `occurred` (ISO string) to epoch ms, or null if missing/invalid. */
export function parseOccurredMs(occurred) {
  if (occurred == null || occurred === "") return null;
  const ms = new Date(occurred).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Sort stream entries oldest → newest.
 * Events use `occurred`; ties and non-events use `receivedAt` (set when the entry was created).
 */
export function compareEntriesChronologically(a, b) {
  const rank = (entry) => {
    if (entry.kind !== "event") return [2, entry.receivedAt ?? 0];
    const ms = parseOccurredMs(entry.event?.occurred);
    if (ms != null) return [0, ms];
    return [1, entry.receivedAt ?? 0];
  };

  const [ra, ka] = rank(a);
  const [rb, kb] = rank(b);
  if (ra !== rb) return ra - rb;
  if (ka !== kb) return ka - kb;
  return String(a.id).localeCompare(String(b.id));
}

export function sortEntriesChronologically(entries) {
  return [...entries].sort(compareEntriesChronologically);
}

export function formatOccurredShort(value, timezone = "Europe/Paris") {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: timezone,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

const TIMELINE_TICK_STEPS_MS = [
  100, 200, 500,
  1_000, 2_000, 5_000, 10_000, 15_000, 30_000,
  60_000, 120_000, 300_000, 600_000, 900_000,
  1_800_000, 3_600_000, 7_200_000, 10_800_000, 21_600_000, 43_200_000, 86_400_000,
];

const DEFAULT_MAX_TIMELINE_LABELS = 4;
const MIN_TIMELINE_LABEL_GAP_PCT = 16;

/** Pick a readable tick interval for a timeline span (few labels). */
export function pickTimelineTickStepMs(spanMs, targetLabels = DEFAULT_MAX_TIMELINE_LABELS) {
  if (!Number.isFinite(spanMs) || spanMs <= 0) return 1_000;
  const divisions = Math.max(1, targetLabels - 1);
  const raw = spanMs / divisions;
  for (const step of TIMELINE_TICK_STEPS_MS) {
    if (step >= raw) return step;
  }
  return TIMELINE_TICK_STEPS_MS[TIMELINE_TICK_STEPS_MS.length - 1];
}

/** Compact label for timeline axis ticks (format adapts to observed span). */
export function formatTimelineTick(ms, timezone = "Europe/Paris", { spanMs = 0 } = {}) {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "—";

  try {
    if (spanMs > 0 && spanMs < 5_000) {
      return new Intl.DateTimeFormat("fr-FR", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        fractionalSecondDigits: 3,
        hour12: false,
      }).format(date);
    }
    if (spanMs < 120_000) {
      return new Intl.DateTimeFormat("fr-FR", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(date);
    }
    if (spanMs < 3_600_000) {
      return new Intl.DateTimeFormat("fr-FR", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(date);
    }
    if (spanMs < 86_400_000) {
      return new Intl.DateTimeFormat("fr-FR", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
    }
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: timezone,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function dedupeTimelineTicks(ticks) {
  const byMs = new Map();
  for (const tick of ticks) {
    const existing = byMs.get(tick.ms);
    if (!existing || tick.major) byMs.set(tick.ms, tick);
  }
  return Array.from(byMs.values()).sort((a, b) => a.ms - b.ms);
}

function selectTimelineLabels(ticks, { maxLabels = DEFAULT_MAX_TIMELINE_LABELS, minGapPct = MIN_TIMELINE_LABEL_GAP_PCT } = {}) {
  if (!ticks.length) return [];
  if (ticks.length === 1) return [{ ...ticks[0], showLabel: true }];

  const start = ticks.find((t) => t.role === "start") ?? ticks[0];
  const end = ticks.find((t) => t.role === "end") ?? ticks[ticks.length - 1];
  const mids = ticks.filter((t) => t.role === "mid");

  const chosen = [];
  const add = (tick) => {
    if (!tick) return;
    if (chosen.some((t) => t.ms === tick.ms)) return;
    if (chosen.length && tick.pct - chosen[chosen.length - 1].pct < minGapPct) return;
    chosen.push({ ...tick, showLabel: true, major: true });
  };

  add(start);

  const slotsLeft = Math.max(0, maxLabels - 2);
  if (slotsLeft > 0 && mids.length) {
    const step = Math.max(1, Math.ceil(mids.length / slotsLeft));
    for (let i = 0; i < mids.length && chosen.length < maxLabels - 1; i += step) {
      add(mids[i]);
    }
  }

  if (end.ms !== start.ms) {
    const last = chosen[chosen.length - 1];
    if (!last || end.pct - last.pct >= minGapPct) {
      add(end);
    } else if (chosen.length > 1 && end.role === "end") {
      chosen[chosen.length - 1] = { ...end, showLabel: true, major: true };
    } else if (chosen.length === 1) {
      add(end);
    }
  }

  return chosen.slice(0, maxLabels);
}

/**
 * Time axis ticks for the observed window [minMs, maxMs].
 * Each tick: { ms, pct, label, major, role, showLabel }.
 * Only a few ticks have showLabel — the rest are optional grid hints.
 */
export function buildTimelineAxisTicks(
  minMs,
  maxMs,
  timezone = "Europe/Paris",
  { maxLabels = DEFAULT_MAX_TIMELINE_LABELS } = {},
) {
  if (minMs == null || maxMs == null) return [];

  const span = maxMs - minMs;
  const format = (ms) => formatTimelineTick(ms, timezone, { spanMs: span });

  if (span <= 0) {
    return [{ ms: minMs, pct: 50, label: format(minMs), major: true, showLabel: true, role: "single" }];
  }

  const step = pickTimelineTickStepMs(span, maxLabels);
  const rawTicks = [];

  const push = (ms, role, major) => {
    rawTicks.push({
      ms,
      pct: ((ms - minMs) / span) * 100,
      label: format(ms),
      major,
      showLabel: false,
      role,
    });
  };

  push(minMs, "start", true);

  let t = Math.ceil(minMs / step) * step;
  if (t <= minMs) t += step;
  while (t < maxMs) {
    push(t, "mid", false);
    t += step;
  }

  push(maxMs, "end", true);

  const ticks = dedupeTimelineTicks(rawTicks);
  const labels = selectTimelineLabels(ticks, { maxLabels });
  const labelMs = new Set(labels.map((t) => t.ms));

  return ticks.map((tick) => ({
    ...tick,
    showLabel: labelMs.has(tick.ms),
    major: tick.major || labelMs.has(tick.ms),
  }));
}

export function streamEntryDomId(entryId) {
  return `stream-entry-${entryId}`;
}

/** Timeline markers for events that have a valid `occurred` timestamp. */
export function buildOccurredTimeline(entries, timezone = "Europe/Paris") {
  const markers = [];

  for (const entry of entries) {
    if (entry.kind !== "event") continue;
    const ms = parseOccurredMs(entry.event?.occurred);
    if (ms == null) continue;
    const type = effectiveEventType(entry);
    markers.push({
      entryId: entry.id,
      ms,
      type,
      occurred: entry.event.occurred,
      label: formatOccurredShort(entry.event.occurred, timezone),
      color: eventMeta(entry.event).color,
    });
  }

  markers.sort((a, b) => a.ms - b.ms);

  if (markers.length === 0) {
    return { markers: [], minMs: null, maxMs: null, spanMs: null, spanLabel: null, axisTicks: [] };
  }

  const minMs = markers[0].ms;
  const maxMs = markers[markers.length - 1].ms;
  const span = maxMs - minMs;

  const positioned = markers.map((marker) => ({
    ...marker,
    pct: span === 0 ? 50 : ((marker.ms - minMs) / span) * 100,
  }));

  const axisTicks = buildTimelineAxisTicks(minMs, maxMs, timezone, { maxLabels: 4 });

  return {
    markers: positioned,
    minMs,
    maxMs,
    spanMs: span,
    axisTicks,
    spanLabel:
      span === 0
        ? formatOccurredShort(markers[0].occurred, timezone)
        : `${formatOccurredShort(new Date(minMs).toISOString(), timezone)} → ${formatOccurredShort(new Date(maxMs).toISOString(), timezone)}`,
  };
}
