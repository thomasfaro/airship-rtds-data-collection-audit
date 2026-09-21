import test from "node:test";
import assert from "node:assert/strict";
import { createCoveragePlateauStopper } from "../audit/coveragePlateau.js";
import { REALTIME_THRESHOLDS } from "./captureOptions.js";
import { buildCoverageProgress } from "./coverageProgress.js";

test("each plateau check is reported as current against its target", () => {
  const stopper = createCoveragePlateauStopper(REALTIME_THRESHOLDS);
  const acc = {
    total: 12,
    minProcessed: 0,
    maxProcessed: 60_000,
    customEventNames: new Set(["purchase"]),
  };
  stopper.observe(acc);

  const progress = buildCoverageProgress(acc, stopper);
  assert.equal(progress.events, 12);
  assert.equal(typeof progress.keys.customEvents, "number");
  assert.deepEqual(Object.keys(progress.plateau), [
    "events",
    "processedSpanMs",
    "eventsSinceLastNewKey",
    "spanSinceLastNewKeyMs",
  ]);
  assert.equal(progress.plateau.events.current, 12);
  assert.equal(progress.plateau.events.target, REALTIME_THRESHOLDS.minEvents);
  assert.equal(progress.plateau.processedSpanMs.current, 60_000);
  assert.equal(
    progress.plateau.spanSinceLastNewKeyMs.target,
    REALTIME_THRESHOLDS.plateauSpanMs,
  );
});

test("an empty accumulator reports zero rather than undefined", () => {
  const stopper = createCoveragePlateauStopper(REALTIME_THRESHOLDS);
  const progress = buildCoverageProgress(null, stopper);
  assert.equal(progress.events, 0);
  assert.equal(progress.plateau.events.current, 0);
});
