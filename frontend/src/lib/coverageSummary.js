import { canonicalPlatform } from "./audit/taggingPlanExport.js";

/**
 * Flatten an audit report into the rows the coverage summary screen renders:
 * one entry per tracked item, with its event count, data source and the
 * platforms it was seen on. Pure so it can be unit-tested without a browser.
 */

const SOURCE_LABELS = { SDK: "SDK", API: "API", UNKNOWN: "Unknown" };

export function normalizeSource(source) {
  const value = String(source ?? "").toUpperCase();
  return SOURCE_LABELS[value] ?? (value ? value : "Unknown");
}

/** Ordered, deduplicated platform labels for one report row. */
export function platformsForRow(row) {
  const counts = new Map();
  for (const entry of row?.byDeviceBreakdown ?? []) {
    const label = canonicalPlatform(entry.deviceType);
    counts.set(label, (counts.get(label) ?? 0) + (entry.count ?? 0));
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([platform, count]) => ({ platform, count }));
}

/** Sources for a row that tracks them as a `{ SDK: n, API: n }` map. */
function sourcesFromMap(map) {
  return Object.entries(map ?? {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([source]) => normalizeSource(source));
}

function versionScopeLabel(versionScope) {
  if (!versionScope) return null;
  const { firstSeenVersion, lastSeenVersion } = versionScope;
  if (firstSeenVersion && lastSeenVersion) {
    return firstSeenVersion === lastSeenVersion
      ? firstSeenVersion
      : `${firstSeenVersion} → ${lastSeenVersion}`;
  }
  return firstSeenVersion ?? lastSeenVersion ?? null;
}

function baseItem(row, { name, count, sources }) {
  return {
    name,
    count: count ?? 0,
    sources,
    platforms: platformsForRow(row),
    versionScope: versionScopeLabel(row?.versionScope),
    platformMismatch: Boolean(row?.platformMismatch),
    missingPlatforms: (row?.missingPlatforms ?? []).map(canonicalPlatform),
  };
}

function customEventItems(report) {
  const items = [];
  for (const [section, source] of [
    ["sdk", "SDK"],
    ["api", "API"],
    ["unknown", "UNKNOWN"],
  ]) {
    for (const row of report?.customEvents?.[section]?.top ?? []) {
      items.push({
        ...baseItem(row, {
          name: row.name,
          count: row.count,
          sources: [normalizeSource(row.source ?? source)],
        }),
        properties: (row.propertyValueStats ?? []).map((stat) => stat.property).filter(Boolean),
      });
    }
  }
  return items.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function attributeItems(report) {
  return (report?.attributes?.topKeys ?? [])
    .map((row) =>
      baseItem(row, {
        name: row.key,
        count: row.count,
        sources: sourcesFromMap(row.sources),
      }),
    )
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function tagItems(report) {
  const byKey = new Map();
  const ingest = (rows, field) => {
    for (const row of rows ?? []) {
      if (!row?.key) continue;
      if (!byKey.has(row.key)) {
        byKey.set(row.key, {
          name: row.key,
          group: row.group ?? null,
          added: 0,
          removed: 0,
          versionScope: versionScopeLabel(row.versionScope),
        });
      }
      byKey.get(row.key)[field] = row.count ?? 0;
    }
  };
  ingest(report?.tags?.topAdded, "added");
  ingest(report?.tags?.topRemoved, "removed");

  return [...byKey.values()]
    .map((row) => ({
      ...row,
      count: row.added + row.removed,
      sources: [],
      platforms: [],
      missingPlatforms: [],
      platformMismatch: false,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function screenItems(report) {
  return (report?.screenViewed?.top ?? [])
    .map((row) => baseItem(row, { name: row.name, count: row.count, sources: ["SDK"] }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function subscriptionListItems(report) {
  return (report?.subscriptionLists?.byList ?? [])
    .map((row) => ({
      ...baseItem(row, {
        name: row.listId,
        count: (row.subscribe ?? 0) + (row.unsubscribe ?? 0),
        sources: row.source ? [normalizeSource(row.source)] : [],
      }),
      subscribe: row.subscribe ?? 0,
      unsubscribe: row.unsubscribe ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export const COVERAGE_CATEGORIES = [
  {
    id: "customEvents",
    label: "Custom events",
    countLabel: "events",
    build: customEventItems,
    emptyHint: "No custom events were seen in this capture.",
  },
  {
    id: "attributes",
    label: "Attributes",
    countLabel: "operations",
    build: attributeItems,
    emptyHint: "No attribute operations were seen in this capture.",
  },
  {
    id: "tags",
    label: "Tags",
    countLabel: "changes",
    build: tagItems,
    emptyHint: "No tag changes were seen in this capture.",
  },
  {
    id: "screens",
    label: "Screens",
    countLabel: "views",
    build: screenItems,
    emptyHint: "No screen views were seen in this capture.",
  },
  {
    id: "subscriptionLists",
    label: "Subscription lists",
    countLabel: "changes",
    build: subscriptionListItems,
    emptyHint: "No subscription list changes were seen in this capture.",
  },
];

/** Per-category items plus the platforms present across the whole report. */
export function buildCoverageSummary(report) {
  const categories = COVERAGE_CATEGORIES.map((category) => {
    const items = category.build(report);
    return {
      id: category.id,
      label: category.label,
      countLabel: category.countLabel,
      emptyHint: category.emptyHint,
      items,
      itemCount: items.length,
      eventCount: items.reduce((sum, item) => sum + item.count, 0),
    };
  });

  const platforms = new Set();
  for (const category of categories) {
    for (const item of category.items) {
      for (const entry of item.platforms) platforms.add(entry.platform);
    }
  }

  return {
    categories,
    platforms: [...platforms],
    totalKeys: categories.reduce((sum, category) => sum + category.itemCount, 0),
  };
}
