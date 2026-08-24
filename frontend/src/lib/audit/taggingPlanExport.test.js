import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTaggingPlanWorkbookModel,
  buildTaggingPlanJsonPayload,
  canonicalPlatform,
  collectValueExtracts,
} from "./taggingPlanExport.js";

function sampleReport() {
  return {
    meta: {
      profile: "Demo",
      generatedAt: "2026-06-26T10:00:00.000Z",
      timezone: "Europe/Paris",
      totalEvents: 100,
      queryContext: {
        streamModeLabel: "LATEST + manual stop",
        processedRange: { from: "2026-06-25T10:00:00Z", to: "2026-06-26T10:00:00Z", spanLabel: "24 h" },
      },
    },
    byDeviceType: [
      { deviceType: "IOS", count: 60, eventTypes: [{ type: "CUSTOM", count: 30, pct: 50 }] },
      { deviceType: "ANDROID", count: 40, eventTypes: [{ type: "CUSTOM", count: 20, pct: 50 }] },
    ],
    customEvents: {
      sdk: {
        top: [
          {
            name: "add_to_cart",
            source: "SDK",
            count: 30,
            byDeviceBreakdown: [{ deviceType: "IOS", count: 30 }],
            properties: ["sku"],
            propertyValueStats: [{ property: "sku", trackedValueCount: 4, valuesCapped: false }],
            presentPlatforms: ["iOS"],
            missingPlatforms: ["Android"],
            platformMismatch: true,
            obsolescence: { potentiallyObsolete: true, maxVersionSeen: "1.0.0" },
          },
        ],
      },
      api: {
        top: [
          {
            name: "server_event",
            source: "API",
            count: 10,
            byDeviceBreakdown: [{ deviceType: "API_NAMED_USER_EVENTS", count: 10 }],
            properties: [],
            propertyValueStats: [],
            presentPlatforms: [],
            missingPlatforms: [],
            platformMismatch: false,
            obsolescence: { potentiallyObsolete: false },
          },
        ],
      },
    },
    attributes: {
      topKeys: [
        {
          key: "loyalty_tier",
          normalized: "loyalty_tier",
          count: 20,
          actions: { set: 20 },
          sources: { SDK: 20 },
          byDeviceBreakdown: [
            { deviceType: "IOS", count: 12 },
            { deviceType: "ANDROID", count: 8 },
          ],
          trackedValueCount: 3,
          valuesCapped: false,
          presentPlatforms: ["iOS", "Android"],
          missingPlatforms: [],
          platformMismatch: false,
          obsolescence: { potentiallyObsolete: false },
        },
      ],
    },
    tags: {
      topAdded: [{ key: "lang:fr", group: "lang", value: "fr", count: 5, obsolescence: { potentiallyObsolete: false } }],
      topRemoved: [],
    },
    subscriptionLists: {
      byList: [
        {
          listId: "news",
          subscribe: 7,
          unsubscribe: 2,
          net: 5,
          byDeviceBreakdown: [{ deviceType: "IOS", count: 9 }],
          byScope: [{ scope: "app", count: 9 }],
          source: "SDK",
          presentPlatforms: ["iOS"],
          missingPlatforms: ["Android"],
          platformMismatch: true,
          obsolescence: { potentiallyObsolete: false },
        },
      ],
    },
    screenViewed: { top: [{ name: "home", count: 15, byDeviceBreakdown: [{ deviceType: "IOS", count: 15 }], presentPlatforms: ["iOS"], missingPlatforms: ["Android"], platformMismatch: true, obsolescence: { potentiallyObsolete: false } }] },
    sdkVersions: [{ deviceType: "IOS", versions: [{ version: "18.0.0", count: 60, pctOfDevice: 100 }] }],
    appVersions: [
      {
        deviceType: "IOS",
        deviceEventTotal: 60,
        eventsWithVersion: 55,
        versions: [
          {
            version: "2.0.0",
            count: 40,
            pctOfDevice: 66.7,
            sdkVersions: [{ version: "18.0.0", count: 35 }, { version: "17.9.0", count: 3 }],
            sdkLabel: "18.0.0",
          },
          {
            version: "1.9.0",
            count: 15,
            pctOfDevice: 25,
            sdkVersions: [{ version: "17.8.0", count: 15 }],
            sdkLabel: "17.8.0",
          },
        ],
      },
      {
        deviceType: "ANDROID",
        deviceEventTotal: 40,
        eventsWithVersion: 40,
        versions: [{ version: "2.0.0", count: 40, pctOfDevice: 100, sdkVersions: [], sdkLabel: "18.0.0" }],
      },
    ],
    obsolescence: {
      params: { recentVersions: 3, minVolume: 5 },
      flaggedCount: 1,
      items: [
        {
          type: "custom_event",
          name: "add_to_cart",
          platform: "IOS",
          source: "SDK",
          volume: 30,
          maxVersionSeen: "1.0.0",
          platformMaxVersion: "1.4.0",
          lastProcessed: "2026-01-01T00:00:00Z",
          reason: "old",
        },
      ],
    },
  };
}

test("canonicalPlatform maps device types", () => {
  assert.equal(canonicalPlatform("IOS"), "iOS");
  assert.equal(canonicalPlatform("ANDROID"), "Android");
  assert.equal(canonicalPlatform("API_NAMED_USER_EVENTS"), "API");
  assert.equal(canonicalPlatform("UNKNOWN"), "Unknown");
});

test("buildTaggingPlanWorkbookModel derives platform columns and rows", () => {
  const model = buildTaggingPlanWorkbookModel(sampleReport());

  // iOS first, Android next, API after.
  assert.deepEqual(model.platforms.slice(0, 3), ["iOS", "Android", "API"]);

  const byName = Object.fromEntries(model.dataSheets.map((s) => [s.name, s]));
  assert.ok(byName["Custom Events"]);
  assert.ok(byName["Attributes"]);
  assert.ok(byName["Subscription Lists"]);
  assert.ok(byName["Absent from latest version"]);
  assert.equal(byName["Obsolescence"], undefined, "flat Obsolescence sheet replaced");

  // Platform columns exist for iOS/Android.
  const ceCols = byName["Custom Events"].columns.map((c) => c.key);
  assert.ok(ceCols.includes("plat_iOS"));
  assert.ok(ceCols.includes("plat_Android"));

  const addToCart = byName["Custom Events"].rows.find((r) => r.name === "add_to_cart");
  assert.equal(addToCart.plat_iOS, 30);
  assert.equal(addToCart.plat_Android, null, "absent platform left blank");
  assert.equal(addToCart.__mismatch, true);
  assert.equal(addToCart.obsFlag, "Yes");
  assert.equal(addToCart.__obsolete, true);

  // Analyse scope sheet: scope info block (above the table) + event-type matrix.
  const scope = byName["Analyse scope"];
  assert.ok(scope);
  assert.equal(scope.infoBlock.title, "Capture summary");
  const durationRow = scope.infoBlock.rows.find((r) => r.label === "Duration analyzed");
  assert.equal(durationRow.value, "24 h");
  const fromRow = scope.infoBlock.rows.find((r) => r.label === "Processed from");
  assert.ok(String(fromRow.value).includes("2026"));
  const toRow = scope.infoBlock.rows.find((r) => r.label === "Processed to");
  assert.ok(String(toRow.value).includes("2026"));
  const totalEventsRow = scope.infoBlock.rows.find((r) => r.label === "Total events in scope");
  assert.equal(totalEventsRow.value, 100);
  // The scope block doubles as a cover page: what the plan holds, and how much
  // of it the audit flagged.
  const contentsRow = (label) => scope.infoBlock.rows.find((r) => r.label === label)?.value;
  assert.equal(contentsRow("Custom events tracked"), 2);
  assert.equal(contentsRow("Attributes tracked"), 1);
  assert.equal(contentsRow("Screens tracked"), 1);
  assert.equal(contentsRow("Absent from latest version"), 1);
  assert.equal(contentsRow("Platform mismatches"), 0);
  // Platform rows carry their share of the traffic; the total row is left out.
  assert.equal(scope.rows.find((r) => r.platform === "iOS").share, 0.6);
  assert.equal(scope.rows.find((r) => r.__total).share, undefined);
  // Scope metadata is kept out of the data rows.
  assert.ok(!scope.rows.some((r) => r.label === "Duration analyzed"));

  const customCol = scope.columns.find((c) => c.label === "CUSTOM");
  assert.ok(customCol, "event type becomes a column");
  const iosRow = scope.rows.find((r) => r.platform === "iOS");
  assert.equal(iosRow.total, 60);
  assert.equal(iosRow[customCol.key], 30);
  const totalRow = scope.rows.find((r) => r.__total);
  assert.ok(totalRow, "matrix has a total row");
  assert.equal(totalRow.total, 100);
  assert.equal(totalRow[customCol.key], 50);

  // Every volume column carries the item's share of its sheet, and asks the
  // writer for a bar beside it.
  const shareCol = byName["Custom Events"].columns.find((c) => c.key === "share");
  assert.equal(shareCol.label, "% of events");
  assert.equal(shareCol.bar, true);
  assert.equal(addToCart.share, 0.75);
  assert.equal(byName["Custom Events"].rows.find((r) => r.name === "server_event").share, 0.25);
  assert.equal(byName["Attributes"].rows[0].share, 1);
  assert.equal(byName["Tags"].rows[0].share, 1);

  // The flag columns declare which colour they raise, so the writer can tint
  // the word instead of the whole row.
  const flagOf = (sheet, key) => sheet.columns.find((c) => c.key === key)?.flag;
  assert.equal(flagOf(byName["Custom Events"], "mismatch"), "danger");
  assert.equal(flagOf(byName["Custom Events"], "obsFlag"), "warn");
  assert.equal(flagOf(byName["Attributes"], "capped"), "warn");
  // A sheet that is entirely about flagged items does not tint every row.
  assert.equal(byName["Mismatches"].flagRows, false);
  assert.equal(byName["Absent from latest version"].flagRows, false);

  // App Versions sheet counts the tracking events per app + SDK version.
  const versions = byName["App Versions"];
  assert.ok(versions);
  const iosLatest = versions.rows.find(
    (r) => r.os === "iOS" && r.appVersion === "2.0.0" && r.sdkVersion === "18.0.0",
  );
  assert.equal(iosLatest.eventCount, 35);
  assert.equal(iosLatest.pctOfOs, 35 / 60);
  assert.equal(iosLatest.pctOfAppVersion, 35 / 40);
  // An event can carry app_version without ua_sdk_version: it keeps its own row.
  const iosUnknownSdk = versions.rows.find(
    (r) => r.os === "iOS" && r.appVersion === "2.0.0" && r.sdkVersion === "—",
  );
  assert.equal(iosUnknownSdk.eventCount, 2);
  // No SDK breakdown at all: the dominant label stands for the whole app version.
  const android = versions.rows.find((r) => r.os === "Android");
  assert.equal(android.sdkVersion, "18.0.0");
  assert.equal(android.eventCount, 40);
  assert.ok(!versions.columns.some((c) => c.key === "deviceType"), "RTDS device type column removed");
  // The note states how much of the device traffic carried a version at all.
  assert.ok(versions.note.includes("95 of 100"), versions.note);

  // Absent-from-latest sheet groups the flagged item under a section band.
  const absent = byName["Absent from latest version"];
  assert.ok(absent.rows.some((r) => r.__section === "Custom events"));
  const flagged = absent.rows.find((r) => r.name === "add_to_cart");
  assert.ok(flagged, "flagged item present");
  assert.equal(flagged.__obsolete, true);

  // Versions and Legend/Overview sheets are not present.
  assert.equal(byName["Versions"], undefined);
  assert.equal(model.overview, undefined);
  assert.equal(model.legend, undefined);
});

test("Mismatches sheet groups coverage + value/property warnings and excludes SDK/parse", () => {
  const report = sampleReport();
  report.executiveSummary = {
    warnings: [
      {
        severity: "warning",
        category: "custom_property_mismatch",
        message: 'Custom event (SDK) "add_to_cart": property mismatch — iOS only: color; Android only: size.',
        name: "add_to_cart",
        deviceA: "iOS",
        deviceB: "Android",
        onlyOnA: ["color"],
        onlyOnB: ["size"],
      },
      {
        severity: "warning",
        category: "attribute_device_gap",
        message: 'Attributes: "loyalty_tier" has operations on iOS only — not on Android (20 ops).',
        key: "loyalty_tier",
        normalized: "loyalty_tier",
        presentOn: ["iOS"],
        missingOn: ["Android"],
      },
      {
        severity: "warning",
        category: "sdk_version_split",
        message: "iOS: multiple SDK versions in use.",
        deviceType: "iOS",
      },
      { category: "parse_errors", message: "12 skipped lines" },
    ],
  };

  const model = buildTaggingPlanWorkbookModel(report);
  const sheet = model.dataSheets.find((s) => s.name === "Mismatches");
  assert.ok(sheet, "Mismatches sheet present");

  // Both retained families get a section band.
  assert.ok(sheet.rows.some((r) => r.__section === "Missing on platform"));
  assert.ok(sheet.rows.some((r) => r.__section === "Cross-platform inconsistency"));

  // Value/property mismatch row carries the only-on diff and category label.
  const propRow = sheet.rows.find((r) => r.name === "add_to_cart" && !r.__section);
  assert.ok(propRow);
  assert.equal(propRow.issue, "Custom event · properties");
  assert.match(propRow.details, /iOS only: color/);
  assert.match(propRow.details, /Android only: size/);
  assert.equal(propRow.__mismatch, true);

  // Platform coverage row carries present/missing platforms.
  const gapRow = sheet.rows.find((r) => r.name === "loyalty_tier" && !r.__section);
  assert.ok(gapRow);
  assert.equal(gapRow.present, "iOS");
  assert.equal(gapRow.missing, "Android");

  // SDK version issues and capture parse noise are excluded.
  assert.ok(!sheet.rows.some((r) => r.issue === "SDK · version split"));
  assert.ok(!sheet.rows.some((r) => String(r.message).includes("skipped lines")));
});

test("Mismatches sheet shows an empty-state note without warnings", () => {
  const model = buildTaggingPlanWorkbookModel(sampleReport());
  const sheet = model.dataSheets.find((s) => s.name === "Mismatches");
  assert.ok(sheet);
  assert.equal(sheet.rows.length, 0);
  assert.match(sheet.note, /No cross-platform/);
});

test("Custom Events sheet surfaces event value samples and one line per property", () => {
  const report = sampleReport();
  const extracts = {
    customValues: [
      { source: "SDK", event: "add_to_cart", property: "value", value: "9.99" },
      { source: "SDK", event: "add_to_cart", property: "value", value: "4.50" },
      { source: "SDK", event: "add_to_cart", property: "sku", value: "ABC" },
      { source: "SDK", event: "add_to_cart", property: "sku", value: "DEF" },
    ],
    attributeValues: [],
  };
  const model = buildTaggingPlanWorkbookModel(report, { extracts });
  const ce = model.dataSheets.find((s) => s.name === "Custom Events");
  assert.ok(ce.columns.some((c) => c.key === "eventValues"), "event value column exists");

  const row = ce.rows.find((r) => r.name === "add_to_cart");
  assert.equal(row.eventValues, "9.99, 4.50");
  assert.match(row.propSamples, /sku: ABC, DEF/);
  // "value" is shown in its own column, not duplicated in property samples.
  assert.ok(!row.propSamples.includes("value:"));
});

test("Subscription Lists sheet explains an empty result via entitlements", () => {
  const report = sampleReport();
  report.subscriptionLists = { byList: [] };
  report.meta.excludedEntitlements = ["SUBSCRIPTION_LIST"];
  const model = buildTaggingPlanWorkbookModel(report);
  const subs = model.dataSheets.find((s) => s.name === "Subscription Lists");
  assert.equal(subs.rows.length, 0);
  assert.match(subs.note, /not entitled/);
});

test("buildAbsentFromLatestSheet shows an empty-state note when nothing is flagged", () => {
  const report = sampleReport();
  report.obsolescence = { items: [] };
  const model = buildTaggingPlanWorkbookModel(report);
  const absent = model.dataSheets.find((s) => s.name === "Absent from latest version");
  assert.equal(absent.rows.length, 0);
  assert.match(absent.note, /No custom events/);
});

test("collectValueExtracts paginates with concurrency, cap and fallback", async () => {
  const report = sampleReport();

  // Fallback path when no file name.
  const fallback = await collectValueExtracts({ report });
  assert.equal(fallback.available, false);
  assert.equal(fallback.usedFallback, true);

  // Real path with mocked fetchers.
  let attrCalls = 0;
  const fetchAttributeValues = async ({ offset, limit }) => {
    attrCalls += 1;
    // 150 total values across 2 pages of 100; capped flag set.
    if (offset === 0) {
      return {
        total: 150,
        capped: true,
        values: Array.from({ length: limit }, (_, i) => ({ value: `v${i}`, count: 150 - i, deviceTypes: [{ deviceType: "IOS", count: 1 }] })),
      };
    }
    return {
      total: 150,
      capped: true,
      values: Array.from({ length: 50 }, (_, i) => ({ value: `w${i}`, count: 49 - i, deviceTypes: [] })),
    };
  };
  const fetchCustomPropertyValues = async () => ({
    total: 4,
    capped: false,
    values: [{ value: "sku-1", count: 10, deviceTypes: [{ deviceType: "IOS", count: 10 }] }],
  });

  const result = await collectValueExtracts({
    report,
    ndjsonFileName: "capture.ndjson",
    scopeId: "baseline",
    fetchAttributeValues,
    fetchCustomPropertyValues,
    perKeyCap: 100,
    limit: 100,
  });

  assert.equal(result.available, true);
  assert.ok(result.attributeValues.length > 0);
  assert.equal(result.attributeValues[0].key, "loyalty_tier");
  assert.equal(result.attributeValues[0].capped, "100+");
  assert.ok(result.customValues.some((v) => v.value === "sku-1"));
  // perKeyCap=100 with limit 100 => only the first page fetched per key.
  assert.equal(attrCalls, 1);
});

test("buildTaggingPlanJsonPayload carries meta, model, values and per-item version scope", () => {
  const report = sampleReport();
  report.meta.taggingPlanMode = true;
  report.meta.typesRequested = [
    "ATTRIBUTE_OPERATION",
    "CUSTOM",
    "SCREEN_VIEWED",
    "SUBSCRIPTION_LIST",
    "TAG_CHANGE",
  ];
  report.customEvents.sdk.top[0].versionScope = {
    maxAppVersion: "1.0.0",
    sourceScope: "sdk",
    label: "SDK · latest app 1.0.0",
  };
  report.customEvents.api.top[0].versionScope = {
    maxAppVersion: null,
    sourceScope: "api",
    label: "API — version-agnostic",
  };

  const extracts = { available: true, truncated: false, attributeValues: [], customValues: [] };
  const payload = buildTaggingPlanJsonPayload(report, { extracts, profileName: "Demo" });

  assert.equal(payload.kind, "airship-rtds-tagging-plan");
  assert.equal(payload.meta.taggingPlanMode, true);
  assert.equal(payload.meta.profile, "Demo");
  assert.deepEqual(payload.meta.typesRequested, [
    "ATTRIBUTE_OPERATION",
    "CUSTOM",
    "SCREEN_VIEWED",
    "SUBSCRIPTION_LIST",
    "TAG_CHANGE",
  ]);
  assert.ok(Array.isArray(payload.meta.platforms));
  assert.ok(payload.model?.dataSheets?.length);
  assert.equal(payload.values.available, true);

  const ce = payload.model.dataSheets.find((s) => s.name === "Custom Events");
  const sdkRow = ce.rows.find((r) => r.name === "add_to_cart");
  assert.equal(sdkRow.versionScope, "SDK · latest app 1.0.0");
  assert.equal(sdkRow.__versionScope.sourceScope, "sdk");
  const apiRow = ce.rows.find((r) => r.name === "server_event");
  assert.equal(apiRow.versionScope, "API — version-agnostic");
  assert.equal(apiRow.__versionScope.sourceScope, "api");
});

test("collectValueExtracts respects the global value cap", async () => {
  const report = sampleReport();
  const fetchAttributeValues = async ({ limit }) => ({
    total: 1000,
    capped: true,
    values: Array.from({ length: limit }, (_, i) => ({ value: `v${i}`, count: 1, deviceTypes: [] })),
  });
  const fetchCustomPropertyValues = async () => ({ total: 0, capped: false, values: [] });

  const result = await collectValueExtracts({
    report,
    ndjsonFileName: "capture.ndjson",
    fetchAttributeValues,
    fetchCustomPropertyValues,
    maxValueRows: 10,
    perKeyCap: 100,
    limit: 100,
  });
  assert.ok(result.attributeValues.length <= 10);
  assert.equal(result.truncated, true);
});
