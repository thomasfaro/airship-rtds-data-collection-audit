import test from "node:test";
import assert from "node:assert/strict";
import { annotateReportObsolescence } from "./obsolescence.js";

function emptyReportSections() {
  return {
    customEvents: { sdk: { top: [] }, api: { top: [] }, unknown: { top: [] } },
    attributes: { topKeys: [] },
    tags: { topAdded: [], topRemoved: [] },
    screenViewed: { top: [] },
    subscriptionLists: { byList: [] },
  };
}

function buildAcc() {
  return {
    // Platform exposes 5 distinct versions; latest is 1.4.0, recent (3) = 1.4.0/1.3.0/1.2.0.
    appByDevice: {
      IOS: { versions: { "1.0.0": 5, "1.1.0": 5, "1.2.0": 5, "1.3.0": 5, "1.4.0": 20 } },
    },
    customBySource: {
      SDK: {
        old_event: { appVersionsByDevice: { IOS: { versions: { "1.0.0": 8 }, min: "1.0.0", max: "1.0.0", count: 8, lastProcessed: "2026-01-01T00:00:00Z" } } },
        current_event: { appVersionsByDevice: { IOS: { versions: { "1.4.0": 30 }, min: "1.4.0", max: "1.4.0", count: 30, lastProcessed: "2026-06-01T00:00:00Z" } } },
        rare_event: { appVersionsByDevice: { IOS: { versions: { "1.0.0": 2 }, min: "1.0.0", max: "1.0.0", count: 2, lastProcessed: "2026-01-01T00:00:00Z" } } },
        weird_event: { appVersionsByDevice: { IOS: { versions: { "release-x": 10 }, min: null, max: null, count: 10, lastProcessed: "2026-01-01T00:00:00Z" } } },
      },
      API: { api_event: {} },
      UNKNOWN: {},
    },
    attributeKeys: {},
    tagCoverage: {},
    screenByName: {},
    subscriptionLists: { byList: {} },
  };
}

test("annotateReportObsolescence flags SDK data only on old versions, conservatively", () => {
  const acc = buildAcc();
  const report = emptyReportSections();
  report.customEvents.sdk.top = [
    { name: "old_event", source: "SDK", byDeviceBreakdown: [{ deviceType: "IOS", count: 8 }] },
    { name: "current_event", source: "SDK", byDeviceBreakdown: [{ deviceType: "IOS", count: 30 }] },
    { name: "rare_event", source: "SDK", byDeviceBreakdown: [{ deviceType: "IOS", count: 2 }] },
    { name: "weird_event", source: "SDK", byDeviceBreakdown: [{ deviceType: "IOS", count: 10 }] },
  ];
  report.customEvents.api.top = [
    { name: "api_event", source: "API", byDeviceBreakdown: [{ deviceType: "API_NAMED_USER_EVENTS", count: 50 }] },
  ];

  annotateReportObsolescence(report, acc);

  const byName = Object.fromEntries(report.customEvents.sdk.top.map((r) => [r.name, r]));
  assert.equal(byName.old_event.obsolescence.potentiallyObsolete, true, "old event flagged");
  assert.equal(byName.current_event.obsolescence.potentiallyObsolete, false, "present on latest => not flagged");
  assert.equal(byName.rare_event.obsolescence.potentiallyObsolete, false, "below min volume => not flagged");
  assert.equal(byName.weird_event.obsolescence.potentiallyObsolete, false, "non-semver coverage => not flagged");
  assert.equal(report.customEvents.api.top[0].obsolescence.potentiallyObsolete, false, "API has no coverage => not flagged");

  assert.equal(report.obsolescence.flaggedCount, 1);
  assert.equal(report.obsolescence.items[0].name, "old_event");
  assert.equal(report.obsolescence.items[0].type, "custom_event");
  assert.equal(report.obsolescence.items[0].platform, "IOS");
  assert.equal(report.obsolescence.items[0].maxVersionSeen, "1.0.0");
  assert.equal(report.obsolescence.items[0].platformMaxVersion, "1.4.0");
});

test("annotateReportObsolescence reports the version landscape it judged against", () => {
  const report = emptyReportSections();
  annotateReportObsolescence(report, buildAcc());

  assert.deepEqual(report.obsolescence.platforms, [
    { deviceType: "IOS", currentVersion: "1.4.0", recentVersions: ["1.4.0", "1.3.0", "1.2.0"], versionCount: 5 },
  ]);
});

test("annotateReportObsolescence reports no landscape when no event carried an app version", () => {
  const acc = buildAcc();
  acc.appByDevice = { WEB: { versions: {} } };
  const report = emptyReportSections();
  annotateReportObsolescence(report, acc);

  assert.deepEqual(report.obsolescence.platforms, []);
});

test("annotateReportObsolescence does not flag when the platform has too few versions", () => {
  const acc = buildAcc();
  acc.appByDevice = { IOS: { versions: { "1.0.0": 5 } } }; // single version
  const report = emptyReportSections();
  report.customEvents.sdk.top = [
    { name: "old_event", source: "SDK", byDeviceBreakdown: [{ deviceType: "IOS", count: 8 }] },
  ];
  annotateReportObsolescence(report, acc);
  assert.equal(report.customEvents.sdk.top[0].obsolescence.potentiallyObsolete, false);
  assert.equal(report.obsolescence.flaggedCount, 0);
});
