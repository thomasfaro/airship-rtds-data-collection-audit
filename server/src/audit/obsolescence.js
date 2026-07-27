/**
 * Conservative detection of "potentially obsolete" tracking: data points whose
 * app-version coverage shows they only appear on older app versions and never on
 * the platform's most recent versions.
 *
 * Because app_version only exists on device (SDK) events, this is naturally
 * restricted to SDK/live data. API-only data points have no coverage and are
 * never flagged.
 */

import { compareSemver } from "./sdkReleaseDates.js";
import { isSemverish } from "./appVersionCoverage.js";
import { deriveItemVersionScope } from "./versionScope.js";

export const OBSOLESCENCE_DEFAULTS = {
  /** A data point must be absent from the N highest app versions of a platform. */
  recentVersions: 3,
  /** Minimum events on a platform before we trust an obsolescence signal. */
  minVolume: 5,
  /** The platform must expose at least this many distinct app versions. */
  minPlatformVersions: 2,
};

/** Per-platform app version landscape from the audit accumulator (acc.appByDevice). */
function platformVersionInfo(appByDevice, recentN) {
  const info = {};
  for (const [deviceType, bucket] of Object.entries(appByDevice ?? {})) {
    const versions = Object.keys(bucket?.versions ?? {}).filter(isSemverish);
    if (!versions.length) continue;
    const sorted = [...new Set(versions)].sort((a, b) => compareSemver(b, a));
    info[deviceType] = {
      maxVersion: sorted[0],
      recent: new Set(sorted.slice(0, Math.max(1, recentN))),
      versionCount: sorted.length,
    };
  }
  return info;
}

/**
 * Decide obsolescence for one data point given its coverage and the platform landscape.
 * @returns {{ potentiallyObsolete: boolean, platforms: object[], maxVersionSeen: string|null,
 *   platformMaxVersion: string|null, lastProcessed: string|null, reason: string }}
 */
export function computeRowObsolescence(appVersionsByDevice, platformInfo, params = OBSOLESCENCE_DEFAULTS) {
  const coverage = appVersionsByDevice ?? {};
  const flagged = [];
  let presentOnCurrent = false;
  let hasComparablePlatform = false;

  for (const [deviceType, cov] of Object.entries(coverage)) {
    const info = platformInfo[deviceType];
    if (!info || info.versionCount < params.minPlatformVersions) continue;
    if (!cov.max || !isSemverish(cov.max)) continue;
    hasComparablePlatform = true;

    const onCurrent = compareSemver(cov.max, info.maxVersion) >= 0 || info.recent.has(cov.max);
    if (onCurrent) {
      presentOnCurrent = true;
      continue;
    }

    const olderThanMax = compareSemver(cov.max, info.maxVersion) < 0;
    const enoughVolume = (cov.count ?? 0) >= params.minVolume;
    if (olderThanMax && enoughVolume) {
      flagged.push({
        deviceType,
        maxVersionSeen: cov.max,
        minVersionSeen: cov.min ?? null,
        platformMaxVersion: info.maxVersion,
        volume: cov.count ?? 0,
        lastProcessed: cov.lastProcessed ?? null,
      });
    }
  }

  const potentiallyObsolete = hasComparablePlatform && flagged.length > 0 && !presentOnCurrent;
  const primary = flagged[0] ?? null;
  let reason = "";
  if (potentiallyObsolete && primary) {
    reason =
      `Last seen on app ${primary.maxVersionSeen} (${primary.deviceType}); ` +
      `platform now at ${primary.platformMaxVersion} and not present in the latest ${params.recentVersions} version(s).`;
  }

  return {
    potentiallyObsolete,
    platforms: flagged,
    maxVersionSeen: primary?.maxVersionSeen ?? null,
    platformMaxVersion: primary?.platformMaxVersion ?? null,
    lastProcessed: primary?.lastProcessed ?? null,
    reason,
  };
}

function lookupCoverage(source) {
  return source?.appVersionsByDevice ?? null;
}

/**
 * Annotate report rows in-place with `.obsolescence` and build `report.obsolescence`.
 * Reads coverage from the live accumulator (`acc`).
 */
export function annotateReportObsolescence(report, acc, params = OBSOLESCENCE_DEFAULTS) {
  const platformInfo = platformVersionInfo(acc?.appByDevice, params.recentVersions);
  const items = [];

  const annotate = (row, coverage, descriptor) => {
    const result = computeRowObsolescence(coverage, platformInfo, params);
    row.obsolescence = result;
    row.versionScope = deriveItemVersionScope({
      appVersionsByDevice: coverage,
      sources: row.sources ?? null,
      source: row.source ?? descriptor?.source ?? null,
    });
    if (result.potentiallyObsolete) {
      for (const platform of result.platforms) {
        items.push({
          ...descriptor,
          platform: platform.deviceType,
          maxVersionSeen: platform.maxVersionSeen,
          platformMaxVersion: platform.platformMaxVersion,
          volume: platform.volume,
          lastProcessed: platform.lastProcessed,
          reason: result.reason,
        });
      }
    }
    return result;
  };

  // Custom events (SDK + API; API has no coverage so never flags).
  for (const section of ["sdk", "api", "unknown"]) {
    for (const row of report.customEvents?.[section]?.top ?? []) {
      const bucket = acc?.customBySource?.[String(section).toUpperCase()]?.[row.name];
      annotate(row, lookupCoverage(bucket), {
        type: "custom_event",
        name: row.name,
        source: row.source ?? section.toUpperCase(),
      });
    }
  }

  // Attributes.
  for (const row of report.attributes?.topKeys ?? []) {
    const bucket = acc?.attributeKeys?.[row.normalized];
    annotate(row, lookupCoverage(bucket), {
      type: "attribute",
      name: row.key ?? row.normalized,
      source: "SDK",
    });
  }

  // Tags (coverage stored per tag key in acc.tagCoverage).
  const seenTagKeys = new Set();
  for (const row of [...(report.tags?.topAdded ?? []), ...(report.tags?.topRemoved ?? [])]) {
    if (seenTagKeys.has(row.key)) {
      // Still attach to this row instance for downstream readers.
      const cov = acc?.tagCoverage?.[row.key];
      row.obsolescence = computeRowObsolescence(lookupCoverage(cov), platformInfo, params);
      row.versionScope = deriveItemVersionScope({
        appVersionsByDevice: lookupCoverage(cov),
        sources: row.sources ?? null,
        source: row.source ?? "SDK",
      });
      continue;
    }
    seenTagKeys.add(row.key);
    const cov = acc?.tagCoverage?.[row.key];
    annotate(row, lookupCoverage(cov), { type: "tag", name: row.key, source: "SDK" });
  }

  // Screens.
  for (const row of report.screenViewed?.top ?? []) {
    const bucket = acc?.screenByName?.[row.name];
    annotate(row, lookupCoverage(bucket), { type: "screen", name: row.name, source: "SDK" });
  }

  // Subscription lists.
  for (const row of report.subscriptionLists?.byList ?? []) {
    const bucket = acc?.subscriptionLists?.byList?.[row.listId];
    annotate(row, lookupCoverage(bucket), {
      type: "subscription_list",
      name: row.listId,
      source: row.source ?? "SDK",
    });
  }

  items.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));

  report.obsolescence = {
    description:
      "Data points whose SDK (live) coverage only appears on older app versions and never on the platform's most recent versions — likely no longer tracked in current app builds. Reliability improves with longer captures.",
    params: { ...params },
    flaggedCount: items.length,
    items,
  };

  return report;
}
