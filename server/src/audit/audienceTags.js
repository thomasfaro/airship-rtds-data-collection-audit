/** Audience TAG_CHANGE parsing and grouped report (excl. ua_*). */

import {
  filterNonAirshipTags,
  isAirshipAutoTag,
  tagGroupKey,
  tagValuePart,
} from "./airshipAutoTags.js";
import { AUDIT_REPORT_TOP_LIST_LIMIT } from "./reportTopLimits.js";

/** Max distinct tag keys (added/removed flat maps) retained in the audit report. */
export const MAX_TAG_KEYS_IN_REPORT = 500;

function inc(map, key, amount = 1) {
  if (!key) return;
  map[key] = (map[key] ?? 0) + amount;
}

/**
 * Expand RTDS TAG_CHANGE add/remove maps (values are usually string arrays per group).
 * @returns {{ group: string, value: string | null, key: string }[]}
 */
export function expandTagEntries(map) {
  if (!map || typeof map !== "object" || Array.isArray(map)) return [];
  const out = [];
  for (const [group, raw] of Object.entries(map)) {
    if (Array.isArray(raw)) {
      if (raw.length === 0) {
        out.push({ group, value: null, key: group });
      } else {
        for (const item of raw) {
          const value = String(item);
          out.push({ group, value, key: `${group}:${value}` });
        }
      }
    } else if (raw != null && typeof raw === "object") {
      continue;
    } else if (raw != null && raw !== "") {
      const value = String(raw);
      out.push({ group, value, key: `${group}:${value}` });
    } else {
      out.push({ group, value: null, key: group });
    }
  }
  return out;
}

export function extractTagChanges(body) {
  const added = [];
  const removed = [];

  const pushEntries = (target, entries) => {
    for (const { key } of entries) {
      target.push(key);
    }
  };

  if (Array.isArray(body?.added)) {
    for (const item of body.added) added.push(String(item));
  }
  if (Array.isArray(body?.removed)) {
    for (const item of body.removed) removed.push(String(item));
  }

  pushEntries(added, expandTagEntries(body?.add));
  pushEntries(removed, expandTagEntries(body?.remove));

  // Legacy flat list on current (not additive state snapshots as objects)
  if (Array.isArray(body?.current)) {
    for (const item of body.current) added.push(String(item));
  }

  return { added, removed };
}

function topEntries(map, limit = 12) {
  return Object.entries(map ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function ingestFlatMap(byGroup, flatMap, direction) {
  for (const [key, count] of Object.entries(flatMap ?? {})) {
    if (isAirshipAutoTag(key)) continue;
    const group = tagGroupKey(key);
    const value = tagValuePart(key);
    if (!byGroup[group]) {
      byGroup[group] = {
        added: 0,
        removed: 0,
        valuesAdded: {},
        valuesRemoved: {},
        groupOnlyAdded: 0,
        groupOnlyRemoved: 0,
      };
    }
    const row = byGroup[group];
    if (direction === "added") {
      row.added += count;
      if (value) inc(row.valuesAdded, value, count);
      else row.groupOnlyAdded += count;
    } else {
      row.removed += count;
      if (value) inc(row.valuesRemoved, value, count);
      else row.groupOnlyRemoved += count;
    }
  }
}

function enrichFlatRow(key, count, direction) {
  const group = tagGroupKey(key);
  const value = tagValuePart(key);
  return {
    key,
    group,
    value,
    count,
    isGroupOnly: value == null,
    label: value ? `${group} → ${value}` : group,
    sampleKpiId: `tags.${direction}.${key}`,
  };
}

export function buildAudienceTagsReport(tagsAdded, tagsRemoved) {
  const addedMap = filterNonAirshipTags(tagsAdded);
  const removedMap = filterNonAirshipTags(tagsRemoved);
  const byGroupAcc = {};
  ingestFlatMap(byGroupAcc, addedMap, "added");
  ingestFlatMap(byGroupAcc, removedMap, "removed");

  const totalAdded = Object.values(addedMap).reduce((a, b) => a + b, 0);
  const totalRemoved = Object.values(removedMap).reduce((a, b) => a + b, 0);

  const byGroup = Object.entries(byGroupAcc)
    .sort((a, b) => b[1].added + b[1].removed - (a[1].added + a[1].removed))
    .map(([group, data]) => {
      const uniqueValuesAdded = Object.keys(data.valuesAdded).length;
      const uniqueValuesRemoved = Object.keys(data.valuesRemoved).length;
      const hasRecurringValues =
        uniqueValuesAdded > 1 ||
        uniqueValuesRemoved > 1 ||
        (uniqueValuesAdded > 0 && uniqueValuesRemoved > 0);

      return {
        group,
        added: data.added,
        removed: data.removed,
        net: data.added - data.removed,
        groupOnlyAdded: data.groupOnlyAdded,
        groupOnlyRemoved: data.groupOnlyRemoved,
        uniqueValuesAdded,
        uniqueValuesRemoved,
        hasRecurringValues,
        topValuesAdded: topEntries(data.valuesAdded, 15),
        topValuesRemoved: topEntries(data.valuesRemoved, 15),
        sampleKpiIdAdded: `tags.group.added.${group}`,
        sampleKpiIdRemoved: `tags.group.removed.${group}`,
      };
    });

  const recurringGroups = byGroup.filter((g) => g.hasRecurringValues);
  const groupOnlyGroups = byGroup.filter(
    (g) => (g.groupOnlyAdded > 0 || g.groupOnlyRemoved > 0) && !g.hasRecurringValues,
  );

  return {
    description:
      "Tags from TAG_CHANGE (excl. ua_*). Tag groups can hold many values (e.g. language → BU_LANGUAGE_fr); boolean-style changes appear as group-only rows without a value.",
    maxKeysTracked: MAX_TAG_KEYS_IN_REPORT,
    totalAdded,
    totalRemoved,
    totalChanges: totalAdded + totalRemoved,
    uniqueGroups: byGroup.length,
    recurringGroupCount: recurringGroups.length,
    topAdded: topEntries(addedMap, AUDIT_REPORT_TOP_LIST_LIMIT).map((row) =>
      enrichFlatRow(row.key, row.count, "added"),
    ),
    topRemoved: topEntries(removedMap, AUDIT_REPORT_TOP_LIST_LIMIT).map((row) =>
      enrichFlatRow(row.key, row.count, "removed"),
    ),
    byGroup,
    recurringGroups,
    groupOnlyGroups,
  };
}
