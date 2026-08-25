import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCoverageSummary,
  normalizeSource,
  platformsForRow,
} from "./coverageSummary.js";

const REPORT = {
  customEvents: {
    sdk: {
      top: [
        {
          name: "purchase",
          count: 120,
          source: "SDK",
          byDeviceBreakdown: [
            { deviceType: "IOS", count: 100 },
            { deviceType: "ANDROID", count: 20 },
          ],
          propertyValueStats: [{ property: "sku" }, { property: "value" }],
          versionScope: {
            maxAppVersion: "3.2.0",
            sourceScope: "sdk",
            label: "SDK · latest app 3.2.0",
          },
        },
      ],
    },
    api: {
      top: [{ name: "crm_sync", count: 400, source: "API", byDeviceBreakdown: [] }],
    },
    unknown: { top: [] },
  },
  attributes: {
    topKeys: [
      {
        key: "city",
        count: 50,
        sources: { SDK: 40, API: 10 },
        byDeviceBreakdown: [{ deviceType: "WEB", count: 50 }],
        platformMismatch: true,
        missingPlatforms: ["ANDROID"],
      },
    ],
  },
  tags: {
    topAdded: [{ key: "loyalty:vip", group: "loyalty", count: 30 }],
    topRemoved: [{ key: "loyalty:vip", group: "loyalty", count: 5 }],
  },
  screenViewed: {
    top: [{ name: "home", count: 900, byDeviceBreakdown: [{ deviceType: "IPHONE", count: 900 }] }],
  },
  subscriptionLists: {
    byList: [
      {
        listId: "newsletter",
        subscribe: 12,
        unsubscribe: 3,
        source: "sdk",
        byDeviceBreakdown: [{ deviceType: "IOS", count: 15 }],
      },
    ],
  },
};

test("normalizeSource maps the known RTDS sources and falls back to Unknown", () => {
  assert.equal(normalizeSource("sdk"), "SDK");
  assert.equal(normalizeSource("API"), "API");
  assert.equal(normalizeSource("unknown"), "Unknown");
  assert.equal(normalizeSource(null), "Unknown");
});

test("platformsForRow merges device types into canonical platforms, busiest first", () => {
  const platforms = platformsForRow({
    byDeviceBreakdown: [
      { deviceType: "IPHONE", count: 5 },
      { deviceType: "IOS", count: 10 },
      { deviceType: "ANDROID", count: 20 },
    ],
  });
  assert.deepEqual(platforms, [
    { platform: "Android", count: 20 },
    { platform: "iOS", count: 15 },
  ]);
});

test("platformsForRow drops platforms the item was never seen on", () => {
  const platforms = platformsForRow({
    byDeviceBreakdown: [
      { deviceType: "IOS", count: 3 },
      { deviceType: "ANDROID", count: 0 },
    ],
  });
  assert.deepEqual(platforms, [{ platform: "iOS", count: 3 }]);
});

test("platformsForRow returns an empty list when the row has no breakdown", () => {
  assert.deepEqual(platformsForRow({}), []);
  assert.deepEqual(platformsForRow(null), []);
});

test("every tracking category is represented, in a stable order", () => {
  const summary = buildCoverageSummary(REPORT);
  assert.deepEqual(
    summary.categories.map((category) => category.id),
    ["customEvents", "attributes", "tags", "screens", "subscriptionLists"],
  );
  // 2 custom events + 1 attribute + 1 tag + 1 screen + 1 subscription list
  assert.equal(summary.totalKeys, 6);
});

test("custom events carry their source, platforms and property names", () => {
  const { items } = buildCoverageSummary(REPORT).categories[0];
  assert.deepEqual(
    items.map((item) => item.name),
    ["crm_sync", "purchase"],
  );
  const purchase = items.find((item) => item.name === "purchase");
  assert.deepEqual(purchase.sources, ["SDK"]);
  assert.deepEqual(purchase.platforms, [
    { platform: "iOS", count: 100 },
    { platform: "Android", count: 20 },
  ]);
  assert.deepEqual(purchase.properties, ["sku", "value"]);
  assert.equal(purchase.versionScope, "latest app 3.2.0");
});

test("a version-agnostic API item has no version scope to show", () => {
  const [crmSync] = buildCoverageSummary({
    customEvents: {
      api: {
        top: [
          {
            name: "crm_sync",
            count: 1,
            source: "API",
            versionScope: { maxAppVersion: null, sourceScope: "api", label: "API — version-agnostic" },
          },
        ],
      },
    },
  }).categories[0].items;
  assert.equal(crmSync.versionScope, null);
});

test("attributes surface every source and their platform gaps", () => {
  const [attribute] = buildCoverageSummary(REPORT).categories[1].items;
  assert.equal(attribute.name, "city");
  assert.deepEqual(attribute.sources, ["SDK", "API"]);
  assert.equal(attribute.platformMismatch, true);
  assert.deepEqual(attribute.missingPlatforms, ["Android"]);
});

test("tags merge added and removed counts under a single key", () => {
  const [tag] = buildCoverageSummary(REPORT).categories[2].items;
  assert.equal(tag.name, "loyalty:vip");
  assert.equal(tag.added, 30);
  assert.equal(tag.removed, 5);
  assert.equal(tag.count, 35);
});

test("subscription lists keep subscribe and unsubscribe totals", () => {
  const [list] = buildCoverageSummary(REPORT).categories[4].items;
  assert.equal(list.name, "newsletter");
  assert.equal(list.subscribe, 12);
  assert.equal(list.unsubscribe, 3);
  assert.equal(list.count, 15);
  assert.deepEqual(list.sources, ["SDK"]);
});

test("report platforms are the union of every row's platforms", () => {
  const summary = buildCoverageSummary(REPORT);
  assert.deepEqual(summary.platforms.sort(), ["Android", "Web", "iOS"]);
});

test("category event counts sum their items", () => {
  const [customEvents, , tags, screens] = buildCoverageSummary(REPORT).categories;
  assert.equal(customEvents.eventCount, 520);
  assert.equal(tags.eventCount, 35);
  assert.equal(screens.eventCount, 900);
});

test("an empty report yields empty categories instead of throwing", () => {
  const summary = buildCoverageSummary({});
  assert.equal(summary.totalKeys, 0);
  assert.deepEqual(summary.platforms, []);
  for (const category of summary.categories) {
    assert.deepEqual(category.items, []);
    assert.equal(category.eventCount, 0);
  }
});
