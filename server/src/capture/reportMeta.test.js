import test from "node:test";
import assert from "node:assert/strict";
import { attachReportMeta } from "./reportMeta.js";

const options = {
  captureWindow: { latencyMs: 3_600_000, hours: 1, label: "1h" },
  streamMode: { id: "earliest_manual" },
  startPosition: "earliest",
  stopMode: "manual",
  realTime: false,
  realtimeThresholds: null,
};

const downloadResult = {
  linesWritten: 42,
  request: { body: {} },
  types: ["CUSTOM", "SCREEN_VIEWED"],
  oldestProcessed: "2026-07-28T06:00:00.000Z",
  newestProcessed: "2026-07-28T10:00:00.000Z",
  elapsedLabel: "4h 00m 00s",
  downloadMs: 1234,
};

test("the report says which window, types and stem produced it", () => {
  const report = attachReportMeta({ meta: { queryContext: {} } }, {
    downloadResult,
    options,
    storagePath: "/tmp/.stored-files/audit-Demo-abc.ndjson",
  });

  assert.equal(report.meta.windowMs, 3_600_000);
  assert.equal(report.meta.windowLabel, "1h");
  assert.equal(report.meta.streamMode, "earliest_manual");
  assert.equal(report.meta.taggingPlanMode, true);
  assert.deepEqual(report.meta.typesRequested, ["CUSTOM", "SCREEN_VIEWED"]);
  assert.equal(report.meta.storage.sourceFileName, "audit-Demo-abc.ndjson");
  assert.equal(report.meta.phaseTimings.downloadMs, 1234);
  assert.ok(report.meta.appVersion, "the version that produced the plan is stamped in");
});

test("no latency is said in words rather than left null-ish", () => {
  const report = attachReportMeta({ meta: {} }, {
    downloadResult,
    options: { ...options, captureWindow: null },
    storagePath: null,
  });

  assert.equal(report.meta.windowMs, null);
  assert.equal(report.meta.windowHours, null);
  assert.equal(report.meta.windowLabel, "no latency");
  assert.equal(report.meta.storage.sourceFileName, undefined);
});

test("the processed range is derived once and mirrored into the query context", () => {
  const report = attachReportMeta({ meta: { queryContext: {} } }, {
    downloadResult,
    options,
    storagePath: null,
  });

  assert.deepEqual(
    report.meta.queryContext.processedRange,
    report.meta.downloadHours.processedRange,
  );
  assert.equal(report.meta.queryContext.processedRangeSource, "download");
});

test("a capture never claims to have kept a raw file", () => {
  const report = attachReportMeta({ meta: {} }, { downloadResult, options, storagePath: null });
  assert.equal(report.meta.storage.analysisOnly, true);
  assert.equal(report.meta.storage.rawFileKept, false);
  assert.equal(report.meta.storage.rawFileBytes, 0);
  assert.equal(report.meta.storage.rawFileLines, 42);
});

test("the coverage lists only the tracking types as requested", () => {
  const report = attachReportMeta({ meta: {} }, { downloadResult, options, storagePath: null });
  assert.deepEqual(report.meta.typesCoverage.requested, [
    "ATTRIBUTE_OPERATION",
    "CUSTOM",
    "SCREEN_VIEWED",
    "SUBSCRIPTION_LIST",
    "TAG_CHANGE",
  ]);
  assert.ok(report.meta.typesCoverage.notRequested.includes("OPEN"));
});
