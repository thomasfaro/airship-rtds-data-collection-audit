/** Tags whose group name starts with ua_ — auto-managed by Airship (SDK/channel metadata). */

import { AUDIT_REPORT_TOP_LIST_LIMIT } from "./reportTopLimits.js";

export const AIRSHIP_AUTO_TAG_PREFIX = "ua_";

export function tagGroupKey(tagEntry) {
  const raw = String(tagEntry ?? "").trim();
  const colon = raw.indexOf(":");
  return colon >= 0 ? raw.slice(0, colon) : raw;
}

export function tagValuePart(tagEntry) {
  const raw = String(tagEntry ?? "").trim();
  const colon = raw.indexOf(":");
  return colon >= 0 ? raw.slice(colon + 1) : null;
}

export function isAirshipAutoTag(tagEntry) {
  return tagGroupKey(tagEntry).startsWith(AIRSHIP_AUTO_TAG_PREFIX);
}

export function createAirshipTagsAccumulator() {
  return {
    added: {},
    removed: {},
    byGroup: {},
  };
}

function inc(map, key, amount = 1) {
  if (!key) return;
  map[key] = (map[key] ?? 0) + amount;
}

function trackByGroup(acc, tagEntry, direction) {
  const group = tagGroupKey(tagEntry);
  if (!acc.byGroup[group]) {
    acc.byGroup[group] = { added: 0, removed: 0, valuesAdded: {}, valuesRemoved: {} };
  }
  const row = acc.byGroup[group];
  const value = tagValuePart(tagEntry);
  if (direction === "added") {
    row.added += 1;
    if (value) inc(row.valuesAdded, value);
  } else {
    row.removed += 1;
    if (value) inc(row.valuesRemoved, value);
  }
}

/**
 * @param {"added"|"removed"} direction
 */
export function processAirshipAutoTag(acc, tagEntry, direction) {
  if (!isAirshipAutoTag(tagEntry)) return;
  if (direction === "added") {
    inc(acc.added, tagEntry);
  } else {
    inc(acc.removed, tagEntry);
  }
  trackByGroup(acc, tagEntry, direction);
}

function topEntries(map, limit = 25) {
  return Object.entries(map ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

export function buildAirshipAutoTagsReport(acc) {
  const topAdded = topEntries(acc.added, AUDIT_REPORT_TOP_LIST_LIMIT);
  const topRemoved = topEntries(acc.removed, AUDIT_REPORT_TOP_LIST_LIMIT);
  const totalAdded = Object.values(acc.added).reduce((a, b) => a + b, 0);
  const totalRemoved = Object.values(acc.removed).reduce((a, b) => a + b, 0);
  const total = totalAdded + totalRemoved;

  const byGroup = Object.entries(acc.byGroup)
    .sort((a, b) => b[1].added + b[1].removed - (a[1].added + a[1].removed))
    .map(([group, data]) => ({
      group,
      added: data.added,
      removed: data.removed,
      net: data.added - data.removed,
      topValuesAdded: topEntries(data.valuesAdded, 8),
      topValuesRemoved: topEntries(data.valuesRemoved, 8),
      sampleKpiIdAdded: `airship_tags.added.${group}`,
      sampleKpiIdRemoved: `airship_tags.removed.${group}`,
    }));

  const summaryLines = [];
  if (!total) {
    summaryLines.push("No ua_* tag changes in this sample.");
  } else {
    summaryLines.push(
      `${total.toLocaleString()} ua_* tag change(s) (${totalAdded.toLocaleString()} added, ${totalRemoved.toLocaleString()} removed) — auto-managed by Airship.`,
    );
    const topGroup = byGroup[0];
    if (topGroup) {
      summaryLines.push(`Most active tag group: ${topGroup.group} (${topGroup.added + topGroup.removed} changes).`);
    }
  }

  return {
    description:
      "Tags whose name starts with ua_ are set automatically by Airship (SDK versions, OS, opt-in state, locale segments, etc.). They are excluded from the audience tags table below.",
    prefix: AIRSHIP_AUTO_TAG_PREFIX,
    total,
    totalAdded,
    totalRemoved,
    uniqueGroups: byGroup.length,
    topAdded: topAdded.map((row) => ({
      ...row,
      group: tagGroupKey(row.key),
      sampleKpiId: `airship_tags.added.${tagGroupKey(row.key)}`,
    })),
    topRemoved: topRemoved.map((row) => ({
      ...row,
      group: tagGroupKey(row.key),
      sampleKpiId: `airship_tags.removed.${tagGroupKey(row.key)}`,
    })),
    byGroup,
    summaryLines,
  };
}

export function filterNonAirshipTags(map) {
  const out = {};
  for (const [key, count] of Object.entries(map ?? {})) {
    if (!isAirshipAutoTag(key)) out[key] = count;
  }
  return out;
}
