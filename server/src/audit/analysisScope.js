import { createHash } from "node:crypto";
import { compareSemver, sortVersionRowsBySemverDesc } from "./sdkReleaseDates.js";

const MOBILE_DEVICE_TYPES = new Set(["IOS", "ANDROID"]);

export function parseTimestampMs(value) {
  if (value == null || value === "") return null;
  const ms = Date.parse(String(value));
  return Number.isNaN(ms) ? null : ms;
}

/** @deprecated use parseTimestampMs */

function normalizeVersionList(raw) {
  return [...new Set(
    (raw ?? [])
      .map((v) => String(v ?? "").trim())
      .filter(Boolean),
  )].sort((a, b) => compareSemver(b, a) || a.localeCompare(b));
}

function normalizeAppVersionScope(rawAppVersion = {}) {
  const appVersion = {};
  const ios = normalizeVersionList(rawAppVersion.ios ?? rawAppVersion.IOS);
  const android = normalizeVersionList(rawAppVersion.android ?? rawAppVersion.ANDROID);
  if (ios.length) appVersion.ios = ios;
  if (android.length) appVersion.android = android;

  const iosMin = String(rawAppVersion.iosMin ?? "").trim();
  const androidMin = String(rawAppVersion.androidMin ?? "").trim();
  if (iosMin && !ios.length) appVersion.iosMin = iosMin;
  if (androidMin && !android.length) appVersion.androidMin = androidMin;

  return appVersion;
}

function normalizeTimeRange(raw, legacyFromKey, legacyToKey) {
  const range = {};
  const from = raw?.from ?? raw?.[legacyFromKey] ?? null;
  const to = raw?.to ?? raw?.[legacyToKey] ?? null;
  if (from) range.from = String(from);
  if (to) range.to = String(to);
  return range;
}

export function normalizeAnalysisScope(raw) {
  if (!raw || typeof raw !== "object") return null;

  const deviceTypes = [...new Set(
    (raw.deviceTypes ?? [])
      .map((dt) => String(dt ?? "").trim().toUpperCase())
      .filter(Boolean),
  )].sort();

  const excludedDeviceTypes = [...new Set(
    (raw.excludedDeviceTypes ?? [])
      .map((dt) => String(dt ?? "").trim().toUpperCase())
      .filter(Boolean),
  )].sort();

  const appVersion = normalizeAppVersionScope(raw.appVersion ?? {});

  const processed = normalizeTimeRange(
    raw.processed ?? (raw.occurred ? raw.occurred : null),
    "processedFrom",
    "processedTo",
  );

  const scope = {};
  if (deviceTypes.length) scope.deviceTypes = deviceTypes;
  if (excludedDeviceTypes.length) scope.excludedDeviceTypes = excludedDeviceTypes;
  if (Object.keys(appVersion).length) scope.appVersion = appVersion;
  if (Object.keys(processed).length) scope.processed = processed;

  return Object.keys(scope).length ? scope : null;
}

export function analysisScopeIsActive(scope) {
  return scope != null && typeof scope === "object" && Object.keys(scope).length > 0;
}

/** Scoped analysis saved as a separate report (include filters, time range, app version). */
export function scopedPersistenceFiltersActive(scope) {
  const normalized = normalizeAnalysisScope(scope);
  if (!normalized) return false;
  return Boolean(
    normalized.deviceTypes?.length ||
      Object.keys(normalized.appVersion ?? {}).length ||
      Object.keys(normalized.processed ?? {}).length,
  );
}

export function analysisFiltersActive(scope) {
  const normalized = normalizeAnalysisScope(scope);
  if (!normalized) return false;
  return scopedPersistenceFiltersActive(normalized) || Boolean(normalized.excludedDeviceTypes?.length);
}

export function scopeIsEmpty(scope) {
  return !analysisScopeIsActive(scope);
}

export function computeScopeId(scope) {
  const normalized = normalizeAnalysisScope(scope);
  if (!normalized) return null;
  const payload = JSON.stringify(normalized);
  return createHash("sha256").update(payload).digest("hex").slice(0, 8);
}

export function scopesEqual(a, b) {
  const na = normalizeAnalysisScope(a);
  const nb = normalizeAnalysisScope(b);
  if (!na && !nb) return true;
  if (!na || !nb) return false;
  return computeScopeId(na) === computeScopeId(nb);
}

function passesAppMin(appVersion, minVersion) {
  if (!minVersion) return true;
  if (!appVersion) return false;
  return compareSemver(String(appVersion), String(minVersion)) >= 0;
}

function passesAppVersionList(appVersion, allowedVersions) {
  if (!allowedVersions?.length) return true;
  if (!appVersion) return false;
  return allowedVersions.includes(String(appVersion));
}

function passesAppVersionFilter(event, deviceType, appVersionScope) {
  if (!appVersionScope) return true;
  const ver = event?.device?.attributes?.app_version;
  if (deviceType === "IOS") {
    if (appVersionScope.ios?.length) return passesAppVersionList(ver, appVersionScope.ios);
    if (appVersionScope.iosMin) return passesAppMin(ver, appVersionScope.iosMin);
  }
  if (deviceType === "ANDROID") {
    if (appVersionScope.android?.length) return passesAppVersionList(ver, appVersionScope.android);
    if (appVersionScope.androidMin) return passesAppMin(ver, appVersionScope.androidMin);
  }
  return true;
}

export function eventPassesAnalysisScope(event, deviceType, scope) {
  if (scopeIsEmpty(scope)) return true;

  const dt = String(deviceType ?? "UNKNOWN").toUpperCase();

  if (scope.excludedDeviceTypes?.length && scope.excludedDeviceTypes.includes(dt)) {
    return false;
  }

  if (scope.deviceTypes?.length && !scope.deviceTypes.includes(dt)) {
    return false;
  }

  const timeRange = scope.processed ?? scope.occurred;
  if (timeRange?.from || timeRange?.to) {
    const useOccurred = !scope.processed && Boolean(scope.occurred);
    const field = useOccurred ? event?.occurred : event?.processed;
    const t = parseTimestampMs(field);
    if (t == null) return false;
    const fromMs = parseTimestampMs(timeRange.from);
    const toMs = parseTimestampMs(timeRange.to);
    if (fromMs != null && t < fromMs) return false;
    if (toMs != null && t > toMs) return false;
  }

  if (!passesAppVersionFilter(event, dt, scope.appVersion)) {
    return false;
  }

  return true;
}

function formatInstant(iso, timezone) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone ?? "UTC",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
}

function formatVersionListLabel(versions, { max = 3 } = {}) {
  if (!versions?.length) return "";
  if (versions.length <= max) return versions.join(", ");
  return `${versions.slice(0, max).join(", ")} +${versions.length - max}`;
}

export function formatAnalysisScopeLabel(scope, { timezone = "UTC" } = {}) {
  const normalized = normalizeAnalysisScope(scope);
  if (!normalized) return "Full capture";

  const parts = [];
  if (normalized.deviceTypes?.length) {
    parts.push(normalized.deviceTypes.join(", "));
  }
  if (normalized.excludedDeviceTypes?.length) {
    parts.push(`excluding ${normalized.excludedDeviceTypes.join(", ")}`);
  }
  if (normalized.appVersion?.ios?.length) {
    parts.push(`iOS ${formatVersionListLabel(normalized.appVersion.ios)}`);
  } else if (normalized.appVersion?.iosMin) {
    parts.push(`iOS ≥ ${normalized.appVersion.iosMin}`);
  }
  if (normalized.appVersion?.android?.length) {
    parts.push(`Android ${formatVersionListLabel(normalized.appVersion.android)}`);
  } else if (normalized.appVersion?.androidMin) {
    parts.push(`Android ≥ ${normalized.appVersion.androidMin}`);
  }
  if (normalized.processed?.from || normalized.processed?.to) {
    const from = formatInstant(normalized.processed.from, timezone);
    const to = formatInstant(normalized.processed.to, timezone);
    parts.push(`processed ${from} → ${to}`);
  }
  return parts.join(" · ") || "Scoped analysis";
}

function formatSpanDuration(ms) {
  if (ms == null || ms <= 0) return "—";
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (ms < hour) return `${Math.max(1, Math.round(ms / minute))} min`;
  if (ms < day) return `${(ms / hour).toFixed(1)} h`;
  if (ms < day * 45) return `${(ms / day).toFixed(1)} days`;
  return `${(ms / (day * 30)).toFixed(1)} mo`;
}

function formatRangeLabel(fromIso, toIso, timezone) {
  if (!fromIso && !toIso) return "—";
  if (fromIso && toIso) return `${formatInstant(fromIso, timezone)} → ${formatInstant(toIso, timezone)}`;
  if (fromIso) return `from ${formatInstant(fromIso, timezone)}`;
  return `until ${formatInstant(toIso, timezone)}`;
}

export function formatCaptureProcessedSummary(timeRange, { timezone = "UTC" } = {}) {
  if (!timeRange?.from || !timeRange?.to) return null;
  const fromMs = parseTimestampMs(timeRange.from);
  const toMs = parseTimestampMs(timeRange.to);
  if (fromMs == null || toMs == null || toMs <= fromMs) return null;
  return {
    rangeLabel: formatRangeLabel(timeRange.from, timeRange.to, timezone),
    spanLabel: formatSpanDuration(toMs - fromMs),
    timezone,
    field: "processed",
  };
}

export function appVersionOptionsFromReport(appVersions) {
  const options = { IOS: [], ANDROID: [] };
  for (const row of appVersions ?? []) {
    const dt = String(row.deviceType ?? "").toUpperCase();
    if (!MOBILE_DEVICE_TYPES.has(dt)) continue;
    const versions = sortVersionRowsBySemverDesc(
      (row.versions ?? []).map((v) => ({
        version: String(v.version ?? ""),
        count: v.count ?? 0,
      })).filter((v) => v.version),
    );
    options[dt] = versions;
  }
  return options;
}

export function mobileDeviceTypesFromScope(scope) {
  const normalized = normalizeAnalysisScope(scope);
  if (!normalized?.deviceTypes?.length) return [...MOBILE_DEVICE_TYPES];
  return normalized.deviceTypes.filter((dt) => MOBILE_DEVICE_TYPES.has(dt));
}

export { MOBILE_DEVICE_TYPES };
