import { compareSemver, normalizeTag, sdkPlatformForDeviceType } from "./sdkReleaseDates.js";
import { isActionablePlatformGap } from "./analyzeInsights.js";
import { maxSdkVersionInRow } from "./sdkReleaseDates.js";
export function buildCustomEventPlatformWarnings(customEvents) {
  const expected = customEvents?.platformLabelsInSample ?? [];
  if (expected.length < 2) return [];

  const warnings = [];
  const sections = [
    { key: "sdk", label: "SDK" },
    { key: "api", label: "API" },
    { key: "unknown", label: "Unknown source" },
  ];

  const hasSections = sections.some(({ key }) => customEvents[key]?.top?.length);
  if (hasSections) {
    for (const { key, label } of sections) {
      for (const row of customEvents[key]?.top ?? []) {
        const present = row.presentPlatforms ?? [];
        const missing = row.missingPlatforms ?? [];
        if (!row.platformMismatch || !isActionablePlatformGap(present, missing)) continue;
        warnings.push({
          severity: "warning",
          category: "custom_event_platform_mismatch",
          message: `Custom event "${row.name}" (${label}): present on ${present.join(", ")} only — not on ${missing.join(", ")} (${row.count.toLocaleString()} hits).`,
          name: row.name,
          source: row.source ?? key.toUpperCase(),
          presentOn: present,
          missingOn: missing,
          kpiIds: row.sampleKpiIds ?? (row.byDeviceBreakdown ?? []).map((d) => d.sampleKpiId).filter(Boolean),
        });
      }
    }
  } else {
    for (const row of customEvents.top ?? []) {
      const present = row.presentPlatforms ?? [];
      const missing = row.missingPlatforms ?? [];
      if (!row.platformMismatch || !isActionablePlatformGap(present, missing)) continue;
      warnings.push({
        severity: "warning",
        category: "custom_event_platform_mismatch",
        message: `Custom event "${row.name}": present on ${present.join(", ")} only — not on ${missing.join(", ")} (${row.count.toLocaleString()} hits).`,
        name: row.name,
        presentOn: present,
        missingOn: missing,
        kpiIds: row.sampleKpiIds ?? (row.byDeviceBreakdown ?? []).map((d) => d.sampleKpiId).filter(Boolean),
      });
    }
  }

  return warnings.slice(0, 25);
}

export function buildScreenPlatformWarnings(screenViewed) {
  const expected = screenViewed?.platformLabelsInSample ?? [];
  if (expected.length < 2 || !screenViewed?.top?.length) return [];

  const warnings = [];
  for (const row of screenViewed.top) {
    const present = row.presentPlatforms ?? [];
    const missing = row.missingPlatforms ?? [];
    if (!row.platformMismatch || !isActionablePlatformGap(present, missing)) continue;
    warnings.push({
      severity: "warning",
      category: "screen_platform_mismatch",
      message: `Screen "${row.name}": SCREEN_VIEWED on ${present.join(", ")} only — not on ${missing.join(", ")} (${row.count.toLocaleString()} views).`,
      screen: row.name,
      presentOn: present,
      missingOn: missing,
      kpiIds:
        row.sampleKpiIds ??
        (row.byDeviceBreakdown ?? []).map((d) => d.sampleKpiId).filter(Boolean),
    });
  }
  return warnings.slice(0, 25);
}

export function buildSdkCrossPlatformMajorSummary(sdkVersions) {
  let iosMax = null;
  let androidMax = null;

  for (const row of sdkVersions ?? []) {
    const platformKey = sdkPlatformForDeviceType(row.deviceType);
    const max = maxSdkVersionInRow(row);
    if (!platformKey || !max?.version) continue;
    if (platformKey === "ios" && (!iosMax || compareSemver(max.version, iosMax) > 0)) {
      iosMax = max.version;
    }
    if (platformKey === "android" && (!androidMax || compareSemver(max.version, androidMax) > 0)) {
      androidMax = max.version;
    }
  }

  if (!iosMax || !androidMax) {
    return { iosMaxVersion: iosMax, androidMaxVersion: androidMax, majorMismatch: false };
  }

  const iosMajor = parseInt(normalizeTag(iosMax).split(".")[0], 10) || 0;
  const androidMajor = parseInt(normalizeTag(androidMax).split(".")[0], 10) || 0;

  return {
    iosMaxVersion: iosMax,
    androidMaxVersion: androidMax,
    iosMajor,
    androidMajor,
    majorMismatch: iosMajor !== androidMajor,
  };
}

export function buildSdkCrossPlatformMajorWarnings(sdkCrossPlatform) {
  if (!sdkCrossPlatform?.majorMismatch) return [];
  return [
    {
      severity: "warning",
      category: "sdk_major_cross_platform",
      message: `SDK major version mismatch between platforms: iOS max ${sdkCrossPlatform.iosMaxVersion} (major ${sdkCrossPlatform.iosMajor}) vs Android max ${sdkCrossPlatform.androidMaxVersion} (major ${sdkCrossPlatform.androidMajor}).`,
      iosVersion: sdkCrossPlatform.iosMaxVersion,
      androidVersion: sdkCrossPlatform.androidMaxVersion,
    },
  ];
}

function pushPropertyMismatchWarnings(warnings, { category, label, rows, formatName }) {
  for (const row of rows ?? []) {
    for (const diff of row.propertyDiffs ?? []) {
      const onlyA = diff.onlyOnA?.length ? diff.onlyOnA.join(", ") : "—";
      const onlyB = diff.onlyOnB?.length ? diff.onlyOnB.join(", ") : "—";
      const kpiIds = (row.propertyDiffKpis ?? [])
        .filter((k) => k.device === diff.deviceA || k.device === diff.deviceB)
        .map((k) => k.kpiId);
      warnings.push({
        severity: "warning",
        category,
        message: `${label} "${formatName(row)}": property mismatch — ${diff.deviceA} only: ${onlyA}; ${diff.deviceB} only: ${onlyB}.`,
        name: formatName(row),
        normalized: formatName(row),
        deviceA: diff.deviceA,
        deviceB: diff.deviceB,
        onlyOnA: diff.onlyOnA,
        onlyOnB: diff.onlyOnB,
        kpiIds,
      });
    }
  }
}

function pushAttributeWarnings(warnings, insights, { audienceLabel }) {
  for (const c of insights?.caseConflicts ?? []) {
    const variants = c.variants?.map((v) => `${v.key} (${v.count})`).join(", ") ?? "";
    warnings.push({
      severity: "warning",
      category: "attribute_case_mismatch",
      message: `${audienceLabel}: attribute key casing variants for "${c.normalized}" — ${variants}.`,
      key: c.normalized,
      normalized: c.normalized,
      kpiIds: [`attr.case.${c.normalized}`],
    });
  }
  for (const row of insights?.topKeys ?? []) {
    if (row.platformMismatch && isActionablePlatformGap(row.presentPlatforms, row.missingPlatforms)) {
      warnings.push({
        severity: "warning",
        category: "attribute_device_gap",
        message: `${audienceLabel}: "${row.key}" has operations on ${row.presentPlatforms?.join(", ")} only — not on ${row.missingPlatforms?.join(", ")} (${row.count.toLocaleString()} ops).`,
        key: row.key,
        normalized: row.normalized ?? row.key,
        presentOn: row.presentPlatforms,
        missingOn: row.missingPlatforms,
        kpiIds: (row.byDeviceBreakdown ?? []).map((d) => d.sampleKpiId).filter(Boolean),
      });
    }
    if (row.valueFormatDiff?.devices?.length) {
      const devices = row.valueFormatDiff.devices.map((d) => d.deviceType).join(", ");
      warnings.push({
        severity: "warning",
        category: "attribute_value_mismatch",
        message: `${audienceLabel}: value type/shape differs by device_type for "${row.key}" (${devices}) — not letter casing alone.`,
        key: row.key,
        normalized: row.normalized ?? row.key,
        kpiIds: (row.valueFormatDiff?.devices ?? []).map(
          (d) => `attr.value.${row.normalized ?? row.key}.${d.deviceType}`,
        ),
      });
    }
  }
}

/**
 * Collect QA warnings surfaced in the executive summary.
 * @param {object} report - finalized audit report (before executive summary)
 * @param {object[]} sdkWarnings - from enrichSdkVersionsReport
 */
export function collectAuditWarnings(report, sdkWarnings = []) {
  const warnings = [...sdkWarnings];

  pushPropertyMismatchWarnings(warnings, {
    category: "custom_property_mismatch",
    label: "Custom event (SDK)",
    rows: report.customEvents?.sdk?.top ?? report.customEvents?.top,
    formatName: (row) => row.name,
  });

  warnings.push(...buildCustomEventPlatformWarnings(report.customEvents));

  for (const row of report.emailFeedback?.rows ?? []) {
    if (!row.propertyDiffs?.length) continue;
    for (const diff of row.propertyDiffs) {
      warnings.push({
        severity: "warning",
        category: "email_property_mismatch",
        message: `Email feedback "${row.label ?? row.name}": property mismatch — ${diff.deviceA} only: ${diff.onlyOnA?.join(", ") || "—"}; ${diff.deviceB} only: ${diff.onlyOnB?.join(", ") || "—"}.`,
        name: row.name,
        label: row.label,
        deviceA: diff.deviceA,
        deviceB: diff.deviceB,
        onlyOnA: diff.onlyOnA,
        onlyOnB: diff.onlyOnB,
        kpiIds: [
          row.sampleKpiId,
          ...(diff.onlyOnA ?? []).map((prop) => `email_custom.prop.${row.name}.${diff.deviceA}.${prop}`),
          ...(diff.onlyOnB ?? []).map((prop) => `email_custom.prop.${row.name}.${diff.deviceB}.${prop}`),
        ].filter(Boolean),
      });
    }
  }

  pushAttributeWarnings(warnings, report.attributes, { audienceLabel: "Attributes" });

  warnings.push(...buildScreenPlatformWarnings(report.screenViewed));

  const openGap = report.openEvents?.platformGapWarning;
  if (openGap?.message) {
    warnings.push({
      severity: "warning",
      category: "open_triggering_push_platform_gap",
      message: openGap.message,
      gapPct: openGap.gapPct,
      kpiIds: [
        report.openEvents?.sampleKpiIds?.triggeringPush,
        report.openEvents?.sampleKpiIds?.lastDelivered,
      ].filter(Boolean),
    });
  }

  warnings.push(...buildSdkCrossPlatformMajorWarnings(report.sdkCrossPlatform));

  for (const row of report.sdkVersions ?? []) {
    const platform = row.deviceType;
    const byCount = [...(row.versions ?? [])].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
    if (byCount.length < 2) continue;
    const first = byCount[0];
    const second = byCount.find((v) => v.version !== first.version && v.pctOfDevice >= 10);
    if (second) {
      warnings.push({
        severity: "warning",
        category: "sdk_version_split",
        message: `${platform}: multiple SDK versions in use — ${first.version} (${first.pctOfDevice}%) and ${second.version} (${second.pctOfDevice}%) both ≥10% of platform events.`,
        deviceType: platform,
        kpiIds: [first.sampleKpiId, second.sampleKpiId].filter(Boolean),
      });
    }
  }

  return warnings;
}
