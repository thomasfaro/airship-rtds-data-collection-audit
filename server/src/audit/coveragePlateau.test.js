import test from "node:test";
import assert from "node:assert/strict";
import {
  createCoveragePlateauStopper,
  distinctKeyBreakdown,
  distinctKeyCount,
  processedSpanMs,
} from "./coveragePlateau.js";

function makeAcc({
  total = 0,
  custom = {},
  attributes = [],
  tags = [],
  screens = [],
  lists = [],
  minProcessed = null,
  maxProcessed = null,
  minOccurred = null,
  maxOccurred = null,
} = {}) {
  const customBySource = { SDK: {}, API: {}, UNKNOWN: {} };
  for (const [source, names] of Object.entries(custom)) {
    for (const name of names) customBySource[source][name] = { count: 1 };
  }
  const attributeKeys = {};
  for (const k of attributes) attributeKeys[k] = { count: 1 };
  const tagsAdded = {};
  for (const t of tags) tagsAdded[t] = { count: 1 };
  const screenByName = {};
  for (const s of screens) screenByName[s] = { count: 1 };
  const byList = {};
  for (const l of lists) byList[l] = { total: 1 };
  return {
    total,
    customBySource,
    attributeKeys,
    tagsAdded,
    tagsRemoved: {},
    screenByName,
    subscriptionLists: { byList },
    minProcessed,
    maxProcessed,
    minOccurred,
    maxOccurred,
  };
}

// Small thresholds so tests stay fast; the real defaults (1M events / 1h span)
// are validated separately below.
const FAST = { minEvents: 10_000, minProcessedSpanMs: 10_000, plateauMargin: 1_000, plateauSpanMs: 1_000, checkEvery: 1_000 };

test("distinctKeyCount sums distinct tracking keys across all buckets", () => {
  const acc = makeAcc({
    custom: { SDK: ["purchase"], API: ["purchase", "signup"] },
    attributes: ["first_name", "age"],
    tags: ["premium"],
    screens: ["home", "cart"],
    lists: ["newsletter"],
  });
  // custom distinct names: purchase, signup = 2; attrs 2, tags 1, screens 2, lists 1 -> 8
  assert.equal(distinctKeyCount(acc), 8);
});

test("distinctKeyCount is 0 for a null/empty accumulator", () => {
  assert.equal(distinctKeyCount(null), 0);
  assert.equal(distinctKeyCount(makeAcc()), 0);
});

test("distinctKeyBreakdown reports each tracking category separately", () => {
  const acc = makeAcc({
    custom: { SDK: ["purchase"], API: ["purchase", "signup"] },
    attributes: ["first_name", "age"],
    tags: ["premium"],
    screens: ["home", "cart"],
    lists: ["newsletter"],
  });
  assert.deepEqual(distinctKeyBreakdown(acc), {
    customEvents: 2,
    attributes: 2,
    tags: 1,
    screens: 2,
    subscriptionLists: 1,
    total: 8,
  });
});

test("distinctKeyBreakdown is all zeros for a null accumulator", () => {
  assert.deepEqual(distinctKeyBreakdown(null), {
    customEvents: 0,
    attributes: 0,
    tags: 0,
    screens: 0,
    subscriptionLists: 0,
    total: 0,
  });
});

test("progress reports how far each stop condition is from its threshold", () => {
  const stopper = createCoveragePlateauStopper({
    minEvents: 10_000,
    minProcessedSpanMs: 10_000,
    plateauMargin: 4_000,
    plateauSpanMs: 4_000,
    checkEvery: 1_000,
  });
  const acc = makeAcc({ total: 0, custom: { SDK: ["a"] }, minProcessed: 0, maxProcessed: 0 });

  acc.total = 1_000;
  acc.maxProcessed = 1_000;
  stopper.observe(acc); // establishes the plateau baseline at 1_000 / 1_000

  acc.total = 3_000;
  acc.maxProcessed = 3_000;
  const progress = stopper.progress(acc);
  assert.equal(progress.events, 3_000);
  assert.equal(progress.processedSpanMs, 3_000);
  assert.equal(progress.eventsSinceLastNewKey, 2_000);
  assert.equal(progress.spanSinceLastNewKeyMs, 2_000);
  assert.equal(progress.distinctKeys, 1);
  assert.equal(progress.thresholds.minEvents, 10_000);
  assert.equal(progress.thresholds.plateauMargin, 4_000);
});

test("progress never reports negative distances", () => {
  const stopper = createCoveragePlateauStopper(FAST);
  const progress = stopper.progress(makeAcc({ total: 0 }));
  assert.equal(progress.eventsSinceLastNewKey, 0);
  assert.equal(progress.spanSinceLastNewKeyMs, 0);
});

test("processedSpanMs uses processed range, falls back to occurred, else 0", () => {
  assert.equal(processedSpanMs(makeAcc({ minProcessed: 1_000, maxProcessed: 5_000 })), 4_000);
  assert.equal(processedSpanMs(makeAcc({ minOccurred: 0, maxOccurred: 3_000 })), 3_000);
  assert.equal(processedSpanMs(makeAcc()), 0);
  assert.equal(processedSpanMs(null), 0);
});

test("default thresholds enforce ~1M events and ~1h processed span", () => {
  const stopper = createCoveragePlateauStopper();
  assert.equal(stopper.thresholds.minEvents, 1_000_000);
  assert.equal(stopper.thresholds.minProcessedSpanMs, 3_600_000);
});

test("never stops before minEvents, even on a long plateau with enough span", () => {
  const stopper = createCoveragePlateauStopper(FAST);
  const acc = makeAcc({ total: 0, custom: { SDK: ["a"] }, minProcessed: 0 });
  let stopped = false;
  // Span grows with total; key established at total=1000, then a flat plateau.
  for (let total = 1_000; total <= 9_000; total += 1_000) {
    acc.total = total;
    acc.maxProcessed = total; // span == total here
    stopped = stopper.observe(acc) || stopped;
  }
  assert.equal(stopped, false); // total never reached minEvents (10_000)

  acc.total = 11_000;
  acc.maxProcessed = 11_000;
  assert.equal(stopper.observe(acc), true); // now all four conditions hold
});

test("never stops before minProcessedSpanMs, even with plenty of events", () => {
  const stopper = createCoveragePlateauStopper(FAST);
  const acc = makeAcc({ total: 0, custom: { SDK: ["a"] }, minProcessed: 0, maxProcessed: 5_000 });
  let stopped = false;
  // Lots of events but processed span capped at 5_000 (< minProcessedSpanMs 10_000).
  for (let total = 1_000; total <= 40_000; total += 1_000) {
    acc.total = total;
    stopped = stopper.observe(acc) || stopped;
  }
  assert.equal(stopped, false);

  // Span finally crosses the minimum -> safe to stop.
  acc.total = 41_000;
  acc.maxProcessed = 12_000;
  assert.equal(stopper.observe(acc), true);
});

test("plateau must hold across both an event margin AND a span margin", () => {
  const stopper = createCoveragePlateauStopper({
    minEvents: 1_000,
    minProcessedSpanMs: 1_000,
    plateauMargin: 4_000,
    plateauSpanMs: 4_000,
    checkEvery: 1_000,
  });
  const acc = makeAcc({ total: 0, custom: { SDK: ["a"] }, minProcessed: 0, maxProcessed: 0 });

  const results = [];
  // key at total=1000 (span 1000); plateau afterwards, span == total.
  for (let total = 1_000; total <= 6_000; total += 1_000) {
    acc.total = total;
    acc.maxProcessed = total;
    results.push(stopper.observe(acc));
  }
  // Plateau baseline set at total=1000/span=1000. It holds once eventsSince>=4000
  // AND spanSince>=4000, i.e. at total=5000 (5000-1000=4000). minEvents/minSpan met.
  assert.deepEqual(results, [false, false, false, false, true, true]);
});

test("resets the plateau (events + span baselines) whenever a new key appears", () => {
  const stopper = createCoveragePlateauStopper({
    minEvents: 1_000,
    minProcessedSpanMs: 1_000,
    plateauMargin: 3_000,
    plateauSpanMs: 3_000,
    checkEvery: 1_000,
  });
  const acc = makeAcc({ total: 0, custom: { SDK: ["a"] }, minProcessed: 0, maxProcessed: 0 });

  acc.total = 1_000; acc.maxProcessed = 1_000;
  assert.equal(stopper.observe(acc), false); // key a

  acc.total = 2_000; acc.maxProcessed = 2_000;
  assert.equal(stopper.observe(acc), false); // plateau 1000 < 3000

  // New key at total=3000 resets both baselines.
  acc.customBySource.SDK.b = { count: 1 };
  acc.total = 3_000; acc.maxProcessed = 3_000;
  assert.equal(stopper.observe(acc), false);

  acc.total = 5_000; acc.maxProcessed = 5_000;
  assert.equal(stopper.observe(acc), false); // plateau 2000 < 3000

  acc.total = 6_000; acc.maxProcessed = 6_000;
  assert.equal(stopper.observe(acc), true); // plateau 3000 >= 3000 (events & span)
});

test("throttles checks to checkEvery events", () => {
  const stopper = createCoveragePlateauStopper({ ...FAST, checkEvery: 1_000 });
  const acc = makeAcc({ total: 500, custom: { SDK: ["a"] }, minProcessed: 0, maxProcessed: 999_999 });
  // Below checkEvery from the initial 0 -> not evaluated yet.
  assert.equal(stopper.observe(acc), false);
});
