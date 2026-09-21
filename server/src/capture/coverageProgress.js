/**
 * Coverage snapshot attached to every download progress event: what has been
 * discovered so far, and how far along the four plateau checks are.
 *
 * The checks are reported in both stop modes. Real-time acts on them; manual does
 * not, but they are still the only honest answer to "have I captured enough yet?",
 * which beats stopping on a hunch.
 */

import { distinctKeyBreakdown } from "../audit/coveragePlateau.js";

export function buildCoverageProgress(acc, plateauStopper) {
  const plateau = plateauStopper.progress(acc);
  return {
    keys: distinctKeyBreakdown(acc),
    events: acc?.total ?? 0,
    plateau: {
      events: { current: plateau.events, target: plateau.thresholds.minEvents },
      processedSpanMs: {
        current: plateau.processedSpanMs,
        target: plateau.thresholds.minProcessedSpanMs,
      },
      eventsSinceLastNewKey: {
        current: plateau.eventsSinceLastNewKey,
        target: plateau.thresholds.plateauMargin,
      },
      spanSinceLastNewKeyMs: {
        current: plateau.spanSinceLastNewKeyMs,
        target: plateau.thresholds.plateauSpanMs,
      },
    },
  };
}
