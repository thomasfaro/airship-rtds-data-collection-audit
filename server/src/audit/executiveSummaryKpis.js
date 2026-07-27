import { adjustDeviceTypeRowsForExecutiveSummary, filterSendRejectedReasonsForExecutiveSummary, isCriticalExecutiveSummarySendRejectedReason } from "./executiveSummaryFilters.js";
import { compareSemver, normalizeTag, sdkPlatformForDeviceType } from "./sdkReleaseDates.js";
import { enrichSendRejectedReasonRow } from "./sendRejectedReasons.js";

function isUnknownScreenName(name) {
  const n = String(name ?? "")
    .trim()
    .toLowerCase();
  return !n || n === "unknown" || n === "(unnamed)" || n === "unnamed";
}

function isIosOnlyPlatformGap(row) {
  const present = row?.presentPlatforms ?? [];
  const missing = row?.missingPlatforms ?? [];
  const hasIos = present.some((p) => /^ios$/i.test(String(p)));
  const missingAndroid = missing.some((p) => /^android$/i.test(String(p)));
  return hasIos && missingAndroid;
}

function collectCustomEventRows(customEvents) {
  if (!customEvents) return [];
  const sections = ["sdk", "api", "unknown"];
  const rows = [];
  for (const key of sections) {
    for (const row of customEvents[key]?.top ?? []) rows.push({ ...row, source: row.source ?? key.toUpperCase() });
  }
  for (const row of customEvents.top ?? []) rows.push(row);
  return rows;
}

function latestSdkByPlatform(sdkVersions) {
  const byPlatform = new Map();

  for (const row of sdkVersions ?? []) {
    const platform = sdkPlatformForDeviceType(row.deviceType);
    if (!platform) continue;

    for (const v of row.versions ?? []) {
      const tag = normalizeTag(v.version);
      if (!tag) continue;

      const cur = byPlatform.get(platform);
      if (!cur || compareSemver(tag, cur.version) > 0) {
        byPlatform.set(platform, {
          platform,
          platformLabel: platform === "ios" ? "iOS" : "Android",
          version: v.version,
          releaseDateLabel: v.releaseDateLabel ?? null,
          isStale: Boolean(v.isStale),
          releaseUnknown: Boolean(v.releaseUnknown),
          deviceTypes: [row.deviceType],
        });
      } else if (cur && compareSemver(tag, cur.version) === 0 && !cur.deviceTypes.includes(row.deviceType)) {
        cur.deviceTypes.push(row.deviceType);
      }
    }
  }

  return [...byPlatform.values()].sort((a, b) => a.platformLabel.localeCompare(b.platformLabel));
}

export function buildExecutiveSummarySendRejectedKpi(report) {
  const sendRejectedRows = filterSendRejectedReasonsForExecutiveSummary(
    report?.messagingFailures?.sendRejected?.byReason,
  ).map((row) => {
    const enriched = row.guide ? row : enrichSendRejectedReasonRow(row);
    return {
      ...enriched,
      critical: isCriticalExecutiveSummarySendRejectedReason(row.reason),
    };
  });
  const total = sendRejectedRows.reduce((sum, row) => sum + (row.count ?? 0), 0);
  const criticalTotal = sendRejectedRows
    .filter((row) => row.critical)
    .reduce((sum, row) => sum + (row.count ?? 0), 0);

  return {
    problem: total > 0,
    total,
    criticalTotal,
    reasons: sendRejectedRows,
  };
}

/**
 * Structured KPIs for the audit executive summary (rendered prominently in the UI).
 */
export function buildExecutiveSummaryKpis(report) {
  const total = report?.meta?.totalEvents ?? 0;
  const adjustedRows = adjustDeviceTypeRowsForExecutiveSummary(report?.byDeviceType);
  const adjustedTotal = adjustedRows.reduce((sum, row) => sum + row.count, 0);
  const deviceTypes = adjustedRows
    .map((row) => ({
      deviceType: row.deviceType,
      count: row.count,
      pct: adjustedTotal > 0 ? Math.round((row.count / adjustedTotal) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const custom = report?.customEvents ?? {};
  const customEventSources = {
    sdk: custom.sdk?.total ?? 0,
    api: custom.api?.total ?? 0,
    unknown: custom.unknown?.total ?? 0,
    total: custom.total ?? 0,
  };

  const sdkLatest = latestSdkByPlatform(report?.sdkVersions);

  const unknownScreens = (report?.screenViewed?.top ?? []).filter((row) => isUnknownScreenName(row.name));
  const unknownScreenCount = unknownScreens.reduce((sum, row) => sum + (row.count ?? 0), 0);

  const iosOnlyCustomEvents = collectCustomEventRows(custom)
    .filter((row) => row.platformMismatch && isIosOnlyPlatformGap(row))
    .map((row) => ({ name: row.name, source: row.source, count: row.count }));

  const iosOnlyAttributes = (report?.attributes?.topKeys ?? [])
    .filter((row) => row.platformMismatch && isIosOnlyPlatformGap(row))
    .map((row) => ({ key: row.key, count: row.count }));

  const sendRejected = buildExecutiveSummarySendRejectedKpi(report);

  return {
    deviceTypes,
    customEventSources,
    sdkLatest,
    screenUnknown: {
      problem: unknownScreens.length > 0,
      viewCount: unknownScreenCount,
      names: unknownScreens.map((row) => ({ name: row.name, count: row.count })),
    },
    iosOnlyGaps: {
      problem: iosOnlyCustomEvents.length > 0 || iosOnlyAttributes.length > 0,
      customEvents: iosOnlyCustomEvents.slice(0, 12),
      attributes: iosOnlyAttributes.slice(0, 12),
      customEventOverflow: Math.max(0, iosOnlyCustomEvents.length - 12),
      attributeOverflow: Math.max(0, iosOnlyAttributes.length - 12),
    },
    sendRejected,
  };
}
