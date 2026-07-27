/** Group executive-summary warnings by mismatch type, then data domain. */

import { formatPlatformCoverageLabel, getPlatformCoverageKey } from "../platformCoverage.js";

const MISMATCH_ORDER = [
  "platform_coverage",
  "cross_platform_inconsistency",
  "sdk_versions",
  "other",
];

export const MISMATCH_LABELS = {
  platform_coverage: "Missing on platform",
  cross_platform_inconsistency: "Cross-platform inconsistency",
  sdk_versions: "SDK version issues",
  other: "Other",
};

export const MISMATCH_VISUAL = {
  platform_coverage: {
    accent: "bg-rose-500",
    surface: "bg-rose-50/80",
    border: "border-rose-200",
    text: "text-rose-950",
    muted: "text-rose-800/80",
    bar: "#FF3976",
  },
  cross_platform_inconsistency: {
    accent: "bg-amber-500",
    surface: "bg-amber-50/80",
    border: "border-amber-200",
    text: "text-amber-950",
    muted: "text-amber-900/75",
    bar: "#F59E0B",
  },
  sdk_versions: {
    accent: "bg-sky-500",
    surface: "bg-sky-50/80",
    border: "border-sky-200",
    text: "text-sky-950",
    muted: "text-sky-900/75",
    bar: "#056DFF",
  },
  other: {
    accent: "bg-violet-500",
    surface: "bg-violet-50/80",
    border: "border-violet-200",
    text: "text-violet-950",
    muted: "text-violet-900/75",
    bar: "#7C3AED",
  },
};

export const WARNING_CATEGORY_LABELS = {
  custom_event_platform_mismatch: "Custom event · platform",
  custom_property_mismatch: "Custom event · properties",
  attribute_case_mismatch: "Attribute · casing",
  attribute_device_gap: "Attribute · platform gap",
  attribute_value_mismatch: "Attribute · value shape",
  screen_platform_mismatch: "Screen · platform",
  open_triggering_push_platform_gap: "OPEN · push gap",
  email_property_mismatch: "Email · properties",
  sdk_major_cross_platform: "SDK · major mismatch",
  sdk_version_split: "SDK · version split",
  sdk_stale: "SDK · stale",
  sdk_release_unknown: "SDK · release unknown",
};

const DATA_TYPE_ORDER = [
  "custom_events",
  "attributes",
  "screens",
  "open_events",
  "email",
  "sdk",
  "capture",
  "other",
];

const DATA_TYPE_LABELS = {
  custom_events: "Custom events",
  attributes: "Attributes",
  screens: "Screen views",
  open_events: "OPEN events",
  email: "Email feedback",
  sdk: "SDK",
  capture: "Capture file",
  other: "Other",
};

const CATEGORY_TO_MISMATCH = {
  custom_event_platform_mismatch: "platform_coverage",
  screen_platform_mismatch: "platform_coverage",
  attribute_device_gap: "platform_coverage",
  custom_property_mismatch: "cross_platform_inconsistency",
  attribute_value_mismatch: "cross_platform_inconsistency",
  attribute_case_mismatch: "cross_platform_inconsistency",
  email_property_mismatch: "cross_platform_inconsistency",
  open_triggering_push_platform_gap: "cross_platform_inconsistency",
  sdk_major_cross_platform: "cross_platform_inconsistency",
  sdk_version_split: "sdk_versions",
  sdk_stale: "sdk_versions",
  sdk_release_unknown: "sdk_versions",
};

const CATEGORY_TO_DATA_TYPE = {
  custom_event_platform_mismatch: "custom_events",
  custom_property_mismatch: "custom_events",
  attribute_case_mismatch: "attributes",
  attribute_device_gap: "attributes",
  attribute_value_mismatch: "attributes",
  screen_platform_mismatch: "screens",
  open_triggering_push_platform_gap: "open_events",
  email_property_mismatch: "email",
  sdk_major_cross_platform: "sdk",
  sdk_version_split: "sdk",
  sdk_stale: "sdk",
  sdk_release_unknown: "sdk",
};

function warningMismatchKey(item) {
  if (typeof item === "string") return "other";
  return CATEGORY_TO_MISMATCH[item.category] ?? "other";
}

function warningDataTypeKey(item) {
  if (typeof item === "string") return "other";
  return CATEGORY_TO_DATA_TYPE[item.category] ?? "other";
}

function sortSubgroups(subgroups) {
  return DATA_TYPE_ORDER.filter((key) => subgroups.has(key)).map((key) => ({
    key,
    label: DATA_TYPE_LABELS[key],
    items: subgroups.get(key),
  }));
}

function bucketByDataType(items) {
  const dataBuckets = new Map();
  for (const item of items ?? []) {
    const dataTypeKey = warningDataTypeKey(item);
    if (!dataBuckets.has(dataTypeKey)) {
      dataBuckets.set(dataTypeKey, []);
    }
    dataBuckets.get(dataTypeKey).push(item);
  }
  return sortSubgroups(dataBuckets);
}

function groupPlatformPatterns(items) {
  const patternBuckets = new Map();
  for (const item of items ?? []) {
    const patternKey = getPlatformCoverageKey(item);
    if (!patternBuckets.has(patternKey)) {
      patternBuckets.set(patternKey, []);
    }
    patternBuckets.get(patternKey).push(item);
  }

  return [...patternBuckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, patternItems]) => ({
      key,
      label: formatPlatformCoverageLabel(patternItems[0]),
      count: patternItems.length,
      subgroups: bucketByDataType(patternItems),
    }));
}

/** @param {{ subgroups?: { items?: unknown[] }[], platformPatterns?: { subgroups?: { items?: unknown[] }[] }[] }} group */
export function collectMismatchGroupItems(group) {
  if (group.platformPatterns?.length) {
    return group.platformPatterns.flatMap((pattern) =>
      pattern.subgroups.flatMap((subgroup) => subgroup.items ?? []),
    );
  }
  return (group.subgroups ?? []).flatMap((subgroup) => subgroup.items ?? []);
}

/** @param {{ subgroups?: { items?: unknown[] }[] }} patternGroup */
export function collectPlatformPatternItems(patternGroup) {
  return (patternGroup.subgroups ?? []).flatMap((subgroup) => subgroup.items ?? []);
}

/**
 * @returns {{
 *   key: string,
 *   label: string,
 *   count: number,
 *   subgroups: { key: string, label: string, items: unknown[] }[]
 * }[]}
 */
export function groupAuditWarnings(warnings) {
  const mismatchBuckets = new Map();

  for (const item of warnings ?? []) {
    const mismatchKey = warningMismatchKey(item);
    if (!mismatchBuckets.has(mismatchKey)) {
      mismatchBuckets.set(mismatchKey, []);
    }
    mismatchBuckets.get(mismatchKey).push(item);
  }

  return MISMATCH_ORDER.filter((key) => mismatchBuckets.has(key)).map((key) => {
    const items = mismatchBuckets.get(key);
    if (key === "platform_coverage") {
      const platformPatterns = groupPlatformPatterns(items);
      const count = platformPatterns.reduce((sum, pattern) => sum + pattern.count, 0);
      return {
        key,
        label: MISMATCH_LABELS[key],
        count,
        platformPatterns,
      };
    }

    const subgroups = bucketByDataType(items);
    const count = subgroups.reduce((sum, group) => sum + group.items.length, 0);
    return {
      key,
      label: MISMATCH_LABELS[key],
      count,
      subgroups,
    };
  });
}

/** Flatten grouped warnings for CSV export (preserves mismatch + data type metadata). */
export function flattenGroupedAuditWarnings(groups) {
  const rows = [];
  for (const group of groups ?? []) {
    if (group.platformPatterns?.length) {
      for (const pattern of group.platformPatterns) {
        for (const subgroup of pattern.subgroups ?? []) {
          for (const item of subgroup.items ?? []) {
            rows.push({
              item,
              mismatchGroup: group.label,
              mismatchKey: group.key,
              platformPattern: pattern.label,
              platformPatternKey: pattern.key,
              dataTypeGroup: subgroup.label,
              dataTypeKey: subgroup.key,
            });
          }
        }
      }
      continue;
    }

    for (const subgroup of group.subgroups ?? []) {
      for (const item of subgroup.items ?? []) {
        rows.push({
          item,
          mismatchGroup: group.label,
          mismatchKey: group.key,
          platformPattern: "",
          platformPatternKey: "",
          dataTypeGroup: subgroup.label,
          dataTypeKey: subgroup.key,
        });
      }
    }
  }
  return rows;
}

export {
  DATA_TYPE_LABELS,
  CATEGORY_TO_MISMATCH,
  CATEGORY_TO_DATA_TYPE,
};
