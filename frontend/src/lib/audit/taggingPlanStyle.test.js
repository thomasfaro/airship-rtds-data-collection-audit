import test from "node:test";
import assert from "node:assert/strict";

import { BAR_UNITS, groupValueRows, shareBar, shareColumn, withShares } from "./taggingPlanStyle.js";

test("a full share fills the bar, and half of it fills half", () => {
  assert.equal(shareBar(1).length, BAR_UNITS);
  assert.equal(shareBar(0.5).length, BAR_UNITS / 2);
});

test("anything above zero leaves a mark, so a long tail reads as small", () => {
  assert.equal(shareBar(0), "");
  assert.equal(shareBar(null), "");
  assert.equal(shareBar(-1), "");
  assert.equal(shareBar(0.0001).length, 1, "a sliver rather than nothing");
  assert.ok(shareBar(0.05).length >= 1);
});

test("a share over one is clamped instead of overflowing the column", () => {
  assert.equal(shareBar(4).length, BAR_UNITS);
});

test("withShares divides each row by the column total", () => {
  const rows = [{ total: 30 }, { total: 10 }];
  withShares(rows, (r) => r.total);
  assert.equal(rows[0].share, 0.75);
  assert.equal(rows[1].share, 0.25);
});

test("bands and total rows are left out of the denominator and of the result", () => {
  const rows = [{ __section: "SDK" }, { total: 30 }, { total: 10 }, { total: 40, __total: true }];
  withShares(rows, (r) => r.total);
  assert.equal(rows[1].share, 0.75, "the total row would otherwise halve every share");
  assert.equal(rows[0].share, undefined);
  assert.equal(rows[3].share, undefined);
});

test("an empty sheet reports a zero share rather than dividing by zero", () => {
  const rows = [{ total: 0 }];
  withShares(rows, (r) => r.total);
  assert.equal(rows[0].share, 0);
});

test("the share column asks the writer for a bar beside it", () => {
  const col = shareColumn("% of key");
  assert.equal(col.label, "% of key");
  assert.equal(col.type, "pct");
  assert.equal(col.bar, true);
});

test("value rows are grouped by weight, then by count inside a group", () => {
  const rows = [
    { key: "city", value: "Lyon", count: 5 },
    { key: "lang", value: "fr", count: 90 },
    { key: "city", value: "Paris", count: 15 },
    { key: "lang", value: "en", count: 10 },
  ];
  const out = groupValueRows(rows, (r) => r.key);

  assert.deepEqual(
    out.map((r) => `${r.key}:${r.value}`),
    ["lang:fr", "lang:en", "city:Paris", "city:Lyon"],
    "the heaviest key first, its top value first",
  );
  // Shares answer "how does this key split", so they add up to 1 per group.
  assert.equal(out[0].share, 0.9);
  assert.equal(out[1].share, 0.1);
  assert.equal(out[2].share, 0.75);
  assert.equal(out[3].share, 0.25);
});

test("only the first row of a group is marked, so one separator is drawn", () => {
  const rows = [
    { key: "lang", count: 2 },
    { key: "lang", count: 1 },
    { key: "city", count: 1 },
  ];
  const out = groupValueRows(rows, (r) => r.key);
  assert.deepEqual(
    out.map((r) => Boolean(r.__groupStart)),
    [true, false, true],
  );
});

test("grouping leaves the collected rows untouched", () => {
  const rows = [{ key: "lang", count: 1 }];
  const out = groupValueRows(rows, (r) => r.key);
  assert.equal(rows[0].share, undefined, "the JSON export keeps the collector's rows");
  assert.equal(out[0].share, 1);
});

test("a group with no counts at all reports an unknown share, not zero", () => {
  const out = groupValueRows([{ key: "lang", count: null }], (r) => r.key);
  assert.equal(out[0].share, null, "the fallback path has sample values and no volumes");
});
