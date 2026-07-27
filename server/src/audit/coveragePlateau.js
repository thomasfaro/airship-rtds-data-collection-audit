/**
 * Coverage-plateau auto-stop for the "Real time" data collection audit.
 *
 * When a client only sends data in real time (no daily API batch), the set of
 * distinct tracking keys (custom event names, attribute keys, tag keys, screen
 * names, subscription list ids) stops growing once every recurring signal has
 * been seen at least once. This helper watches the live accumulator during an
 * analysis-only capture and reports when that plateau has held for long enough
 * (a large safety margin) that it is safe to stop the RTDS stream early.
 *
 * Exhaustiveness is the priority. A plateau alone is NOT enough: tracking keys
 * come and go with the time of day (off-peak "heures creuses" send far fewer
 * signals, and some events only fire during specific daily windows). We
 * therefore refuse to stop until the capture has covered BOTH a large number of
 * events AND a meaningful processed-time span, and until the plateau itself has
 * held across a large number of events AND a meaningful processed-time span.
 * Below ~1h of processed span or ~1M events the capture is considered certainly
 * incomplete and we never stop.
 *
 * No event is ever filtered: we simply stop capturing sooner when nothing new
 * appears. Clients that push daily API batches must NOT enable this, since the
 * whole batch window has to be scanned.
 */

/** Never stop before this many events have been analyzed. */
export const DEFAULT_MIN_EVENTS = 1_000_000;
/** Never stop before the processed timestamps span at least this long (1h). */
export const DEFAULT_MIN_PROCESSED_SPAN_MS = 60 * 60 * 1_000;
/** Events without a new distinct key before the plateau is considered held. */
export const DEFAULT_PLATEAU_MARGIN = 250_000;
/** Processed-time span without a new distinct key before the plateau holds (30 min). */
export const DEFAULT_PLATEAU_SPAN_MS = 30 * 60 * 1_000;
/** Recompute the distinct count at most this often (events). */
export const DEFAULT_CHECK_EVERY = 5_000;

/**
 * Distinct tracking keys per category, as discovered so far. Drives both the
 * plateau detection and the live "keys discovered" panel during a capture.
 * @returns {{ customEvents: number, attributes: number, tags: number, screens: number, subscriptionLists: number, total: number }}
 */
export function distinctKeyBreakdown(acc) {
  if (!acc) {
    return {
      customEvents: 0,
      attributes: 0,
      tags: 0,
      screens: 0,
      subscriptionLists: 0,
      total: 0,
    };
  }
  const customNames = new Set();
  const customBySource = acc.customBySource ?? {};
  for (const sourceKey of ["SDK", "API", "UNKNOWN"]) {
    for (const name of Object.keys(customBySource[sourceKey] ?? {})) {
      customNames.add(name);
    }
  }
  const tagKeys = new Set([
    ...Object.keys(acc.tagsAdded ?? {}),
    ...Object.keys(acc.tagsRemoved ?? {}),
  ]);

  const breakdown = {
    customEvents: customNames.size,
    attributes: Object.keys(acc.attributeKeys ?? {}).length,
    tags: tagKeys.size,
    screens: Object.keys(acc.screenByName ?? {}).length,
    subscriptionLists: Object.keys(acc.subscriptionLists?.byList ?? {}).length,
  };
  breakdown.total =
    breakdown.customEvents +
    breakdown.attributes +
    breakdown.tags +
    breakdown.screens +
    breakdown.subscriptionLists;
  return breakdown;
}

/** Count the distinct tracking keys currently held by the accumulator. */
export function distinctKeyCount(acc) {
  return distinctKeyBreakdown(acc).total;
}

/**
 * Processed-time span (ms) currently covered by the accumulator. Uses the
 * `processed` timestamp range, falling back to `occurred` when processed is
 * unavailable. Returns 0 when no timestamp range is known (treated as unsafe).
 */
export function processedSpanMs(acc) {
  if (!acc) return 0;
  const min = acc.minProcessed ?? acc.minOccurred ?? null;
  const max = acc.maxProcessed ?? acc.maxOccurred ?? null;
  if (min === null || max === null) return 0;
  const span = max - min;
  return Number.isFinite(span) && span > 0 ? span : 0;
}

function positiveOr(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Build a stateful stopper.
 * @param {object} [options]
 * @param {number} [options.minEvents=1_000_000] Never stop before this many events.
 * @param {number} [options.minProcessedSpanMs=3_600_000] Never stop before the processed span reaches this (1h).
 * @param {number} [options.plateauMargin=250_000] Events without a new key before the plateau holds.
 * @param {number} [options.plateauSpanMs=1_800_000] Processed-time span without a new key before the plateau holds (30 min).
 * @param {number} [options.checkEvery=5_000] Recompute the distinct count at most this often.
 * @returns {{ observe(acc: object): boolean, thresholds: object }} observe() returns true once it is safe to stop.
 */
export function createCoveragePlateauStopper({
  minEvents = DEFAULT_MIN_EVENTS,
  minProcessedSpanMs = DEFAULT_MIN_PROCESSED_SPAN_MS,
  plateauMargin = DEFAULT_PLATEAU_MARGIN,
  plateauSpanMs = DEFAULT_PLATEAU_SPAN_MS,
  checkEvery = DEFAULT_CHECK_EVERY,
} = {}) {
  const safeMinEvents = positiveOr(minEvents, DEFAULT_MIN_EVENTS);
  const safeMinSpan = positiveOr(minProcessedSpanMs, DEFAULT_MIN_PROCESSED_SPAN_MS);
  const safePlateauMargin = positiveOr(plateauMargin, DEFAULT_PLATEAU_MARGIN);
  const safePlateauSpan = positiveOr(plateauSpanMs, DEFAULT_PLATEAU_SPAN_MS);
  const safeCheckEvery = positiveOr(checkEvery, DEFAULT_CHECK_EVERY);

  let lastCount = 0;
  let lastNewKeyAtTotal = 0; // events count when the distinct key count last grew
  let lastNewKeyAtSpan = 0; // processed span (ms) when the distinct key count last grew
  let lastCheckedTotal = 0;

  const thresholds = {
    minEvents: safeMinEvents,
    minProcessedSpanMs: safeMinSpan,
    plateauMargin: safePlateauMargin,
    plateauSpanMs: safePlateauSpan,
  };

  return {
    thresholds,
    /**
     * Current progress toward each of the four stop conditions, so the UI can
     * explain why a real-time capture is still running.
     */
    progress(acc) {
      const total = acc?.total ?? 0;
      const span = processedSpanMs(acc);
      return {
        thresholds,
        events: total,
        processedSpanMs: span,
        eventsSinceLastNewKey: Math.max(0, total - lastNewKeyAtTotal),
        spanSinceLastNewKeyMs: Math.max(0, span - lastNewKeyAtSpan),
        distinctKeys: lastCount,
      };
    },
    observe(acc) {
      const total = acc?.total ?? 0;
      if (total - lastCheckedTotal < safeCheckEvery) return false;
      lastCheckedTotal = total;

      const span = processedSpanMs(acc);
      const count = distinctKeyCount(acc);
      if (count > lastCount) {
        lastCount = count;
        lastNewKeyAtTotal = total;
        lastNewKeyAtSpan = span;
        return false;
      }

      const eventsSinceLastNewKey = total - lastNewKeyAtTotal;
      const spanSinceLastNewKey = span - lastNewKeyAtSpan;
      return (
        total >= safeMinEvents &&
        span >= safeMinSpan &&
        eventsSinceLastNewKey >= safePlateauMargin &&
        spanSinceLastNewKey >= safePlateauSpan
      );
    },
  };
}
