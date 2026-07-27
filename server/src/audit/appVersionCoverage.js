/**
 * Per-data-point app version coverage (used for obsolescence detection).
 *
 * app_version only exists on device (SDK) events — Audience API named-user
 * events carry no device, hence no app_version. So coverage is naturally
 * restricted to SDK/live data, which is exactly what the conservative
 * obsolescence rule requires.
 */

import { compareSemver } from "./sdkReleaseDates.js";

/** Looks like a version (has at least one digit) so semver comparison is meaningful. */
export function isSemverish(value) {
  return /\d/.test(String(value ?? ""));
}

/**
 * Record that `target` (a custom-event / attribute / tag / screen / list bucket)
 * was seen on `deviceType` carrying `appVersion`. Mutates `target.appVersionsByDevice`.
 */
export function trackAppVersionCoverage(target, deviceType, appVersion, processedIso) {
  if (!target || appVersion == null || appVersion === "") return;
  const ver = String(appVersion);
  const dt = String(deviceType ?? "UNKNOWN").toUpperCase();

  if (!target.appVersionsByDevice) target.appVersionsByDevice = {};
  let cov = target.appVersionsByDevice[dt];
  if (!cov) {
    cov = { versions: {}, min: null, max: null, lastProcessed: null, count: 0 };
    target.appVersionsByDevice[dt] = cov;
  }

  cov.versions[ver] = (cov.versions[ver] ?? 0) + 1;
  cov.count += 1;

  if (isSemverish(ver)) {
    if (cov.min == null || compareSemver(ver, cov.min) < 0) cov.min = ver;
    if (cov.max == null || compareSemver(ver, cov.max) > 0) cov.max = ver;
  }

  if (processedIso && (cov.lastProcessed == null || processedIso > cov.lastProcessed)) {
    cov.lastProcessed = processedIso;
  }
}
