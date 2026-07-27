/** Look up Airship native SDK release dates from GitHub (ios-library / android-library). */

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const REPOS = {
  ios: "urbanairship/ios-library",
  android: "urbanairship/android-library",
};

/** @type {Map<string, { fetchedAt: number, byTag: Record<string, string> }>} */
const releaseCache = new Map();

export function sdkPlatformForDeviceType(deviceType) {
  const dt = String(deviceType ?? "").toUpperCase();
  if (dt === "IOS" || dt === "IPHONE" || dt === "IPAD" || dt === "TVOS") return "ios";
  if (dt === "ANDROID" || dt === "AMAZON") return "android";
  return null;
}

export function normalizeTag(version) {
  return String(version ?? "")
    .trim()
    .replace(/^v/i, "");
}

/** Display order: newest semver first, then highest event count. */
export function sortVersionRowsBySemverDesc(rows) {
  return [...(rows ?? [])].sort((a, b) => {
    const cmp = compareSemver(b.version, a.version);
    if (cmp !== 0) return cmp;
    return (b.count ?? 0) - (a.count ?? 0);
  });
}

/** Display order: highest event count first, then newest semver as tie-breaker. */
export function sortVersionRowsByCountDesc(rows) {
  return [...(rows ?? [])].sort((a, b) => {
    const diff = (b.count ?? 0) - (a.count ?? 0);
    if (diff !== 0) return diff;
    return compareSemver(b.version, a.version);
  });
}

/** Dominant row by event volume (warnings / stale SDK), not display order. */
export function dominantVersionByCount(rows) {
  const sorted = sortVersionRowsByCountDesc(rows);
  return sorted[0] ?? null;
}

/** @returns {-1|0|1} */
export function compareSemver(a, b) {
  const pa = normalizeTag(a).split(".").map((x) => parseInt(x, 10) || 0);
  const pb = normalizeTag(b).split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da > db ? 1 : -1;
  }
  return 0;
}

/** Highest semver among all ua_sdk_version values seen for a device row. */
export function maxSdkVersionInRow(sdkRow) {
  let best = null;
  let bestCount = 0;
  for (const entry of sdkRow?.versions ?? []) {
    const tag = normalizeTag(entry.version);
    if (!tag) continue;
    if (!best || compareSemver(tag, best) > 0) {
      best = tag;
      bestCount = entry.count ?? 0;
    }
  }
  return best ? { version: best, count: bestCount } : null;
}

export async function fetchLatestSdkVersion(platform, { releaseMaps } = {}) {
  if (!platform) return null;
  const cachedMap = releaseMapForPlatform(releaseMaps, platform);
  if (cachedMap) return latestVersionFromMap(cachedMap);

  const repo = REPOS[platform];
  if (!repo) return null;
  try {
    const map = await fetchReleaseMap(repo);
    return latestVersionFromMap(map);
  } catch {
    return null;
  }
}

function formatReleaseDate(iso, timezone = "UTC") {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      dateStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso?.slice(0, 10) ?? "—";
  }
}

function formatAge(ms) {
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days < 60) return `${days} day(s)`;
  const months = Math.round(days / 30);
  if (months < 24) return `${months} month(s)`;
  const years = Math.round((days / 365) * 10) / 10;
  return `${years} year(s)`;
}

async function fetchReleaseMap(repo) {
  const cached = releaseCache.get(repo);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.byTag;
  }

  const byTag = {};
  for (let page = 1; page <= 4; page += 1) {
    const url = `https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "airship-rtds-qa-audit",
      },
    });
    if (!response.ok) break;
    const releases = await response.json();
    if (!Array.isArray(releases) || releases.length === 0) break;
    for (const release of releases) {
      const tag = normalizeTag(release.tag_name);
      if (tag && release.published_at && !byTag[tag]) {
        byTag[tag] = release.published_at;
      }
    }
    if (releases.length < 100) break;
  }

  releaseCache.set(repo, { fetchedAt: Date.now(), byTag });
  return byTag;
}

/** Preload GitHub release maps for both platforms in parallel (cached). */
export async function preloadReleaseMaps() {
  const [ios, android] = await Promise.all([
    fetchReleaseMap(REPOS.ios).catch(() => ({})),
    fetchReleaseMap(REPOS.android).catch(() => ({})),
  ]);
  return { ios, android };
}

export function latestVersionFromMap(map) {
  let latest = null;
  for (const tag of Object.keys(map ?? {})) {
    if (!latest || compareSemver(tag, latest) > 0) latest = tag;
  }
  return latest;
}

function releaseMapForPlatform(maps, platform) {
  if (!maps) return null;
  return platform === "ios" ? maps.ios : platform === "android" ? maps.android : null;
}

export function lookupSdkReleaseFromMap(maps, platform, version, { timezone = "UTC" } = {}) {
  const tag = normalizeTag(version);
  if (!tag || !platform) return null;
  const map = releaseMapForPlatform(maps, platform);
  if (!map) return null;

  const publishedAt = map[tag];
  if (!publishedAt) {
    return { version: tag, platform, releaseDate: null, releaseDateLabel: null, unknown: true };
  }
  const ageMs = Date.now() - new Date(publishedAt).getTime();
  return {
    version: tag,
    platform,
    releaseDate: publishedAt,
    releaseDateLabel: formatReleaseDate(publishedAt, timezone),
    ageMs,
    ageLabel: formatAge(ageMs),
    isStale: ageMs > ONE_YEAR_MS,
    unknown: false,
  };
}

export async function lookupSdkRelease(platform, version, { timezone = "UTC", releaseMaps } = {}) {
  const tag = normalizeTag(version);
  if (!tag || !platform) return null;

  if (releaseMaps) {
    return lookupSdkReleaseFromMap(releaseMaps, platform, tag, { timezone });
  }

  const repo = REPOS[platform];
  if (!repo) return null;

  try {
    const map = await fetchReleaseMap(repo);
    const publishedAt = map[tag];
    if (!publishedAt) {
      return { version: tag, platform, releaseDate: null, releaseDateLabel: null, unknown: true };
    }
    const ageMs = Date.now() - new Date(publishedAt).getTime();
    return {
      version: tag,
      platform,
      releaseDate: publishedAt,
      releaseDateLabel: formatReleaseDate(publishedAt, timezone),
      ageMs,
      ageLabel: formatAge(ageMs),
      isStale: ageMs > ONE_YEAR_MS,
      unknown: false,
    };
  } catch {
    return { version: tag, platform, releaseDate: null, releaseDateLabel: null, unknown: true, fetchError: true };
  }
}

function enrichVersionRowFromMaps(maps, platform, version, timezone) {
  const meta = lookupSdkReleaseFromMap(maps, platform, version, { timezone });
  if (!meta) return { releaseDate: null, releaseDateLabel: null, isStale: false, releaseUnknown: true };
  return {
    releaseDate: meta.releaseDate,
    releaseDateLabel: meta.releaseDateLabel,
    isStale: Boolean(meta.isStale),
    releaseUnknown: Boolean(meta.unknown),
    sdkAgeLabel: meta.ageLabel ?? null,
  };
}

async function enrichVersionRow(platform, version, timezone, releaseMaps) {
  if (releaseMaps) {
    return enrichVersionRowFromMaps(releaseMaps, platform, version, timezone);
  }
  const meta = await lookupSdkRelease(platform, version, { timezone });
  if (!meta) return { releaseDate: null, releaseDateLabel: null, isStale: false, releaseUnknown: true };
  return {
    releaseDate: meta.releaseDate,
    releaseDateLabel: meta.releaseDateLabel,
    isStale: Boolean(meta.isStale),
    releaseUnknown: Boolean(meta.unknown),
    sdkAgeLabel: meta.ageLabel ?? null,
  };
}

export async function enrichSdkVersionsReport(sdkVersions, { timezone = "UTC", releaseMaps } = {}) {
  const sdkWarnings = [];
  const enriched = [];

  for (const row of sdkVersions ?? []) {
    const platform = sdkPlatformForDeviceType(row.deviceType);
    const versions = [];
    for (const v of row.versions ?? []) {
      if (platform) {
        const releaseMeta = await enrichVersionRow(platform, v.version, timezone, releaseMaps);
        versions.push({ ...v, ...releaseMeta });
      } else {
        versions.push({ ...v, releaseDate: null, releaseDateLabel: null, isStale: false, releaseUnknown: true });
      }
    }
    const versionsSorted = sortVersionRowsByCountDesc(versions);
    enriched.push({ ...row, versions: versionsSorted });

    if (!platform) continue;
    const dominant = dominantVersionByCount(versionsSorted);
    if (!dominant?.version) continue;
    if (dominant.isStale) {
      sdkWarnings.push({
        severity: "warning",
        category: "sdk_stale",
        message: `${row.deviceType}: dominant SDK ${dominant.version} is over 1 year old (released ${dominant.releaseDateLabel ?? "unknown date"}).`,
        deviceType: row.deviceType,
        platform,
        version: dominant.version,
        releaseDate: dominant.releaseDate,
      });
    } else if (dominant.releaseUnknown) {
      sdkWarnings.push({
        severity: "info",
        category: "sdk_release_unknown",
        message: `${row.deviceType}: could not resolve GitHub release date for SDK ${dominant.version}.`,
        deviceType: row.deviceType,
        platform,
        version: dominant.version,
      });
    }
  }

  return { sdkVersions: enriched, sdkWarnings };
}

export async function enrichAppVersionsReport(appVersions, { timezone = "UTC", releaseMaps } = {}) {
  const enriched = [];
  for (const row of appVersions ?? []) {
    const platform = sdkPlatformForDeviceType(row.deviceType);
    const versions = [];
    for (const v of row.versions ?? []) {
      const sdkVersions = [];
      for (const s of v.sdkVersions ?? []) {
        if (platform) {
          const releaseMeta = await enrichVersionRow(platform, s.version, timezone, releaseMaps);
          sdkVersions.push({ ...s, ...releaseMeta });
        } else {
          sdkVersions.push(s);
        }
      }
      versions.push({ ...v, sdkVersions });
    }
    enriched.push({ ...row, versions });
  }
  return enriched;
}
