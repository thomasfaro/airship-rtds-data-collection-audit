/**
 * Per-item source/version scope for the Data collection audit.
 *
 * Each tracked item (custom event, attribute, tag, subscription list, screen)
 * carries a source split (SDK vs API) and, for SDK-origin data, app-version
 * coverage (`appVersionsByDevice`). API-origin data carries no device and hence
 * no `app_version`, so it is inherently version-agnostic.
 *
 * This derives a compact `{ maxAppVersion, sourceScope, label }` used by the
 * report UI and the JSON/xlsx exports so client teams can tell "this is tracked
 * up to app X on the SDK" apart from "this comes from the API (any version)".
 */

import { compareSemver } from "./sdkReleaseDates.js";
import { isSemverish } from "./appVersionCoverage.js";

/** Highest semver-looking app version across all device coverage buckets. */
function maxAppVersionFromCoverage(appVersionsByDevice) {
  let max = null;
  for (const cov of Object.values(appVersionsByDevice ?? {})) {
    const candidate = cov?.max;
    if (!candidate || !isSemverish(candidate)) continue;
    if (max == null || compareSemver(candidate, max) > 0) max = candidate;
  }
  return max;
}

/**
 * @param {object} input
 * @param {object|null} input.appVersionsByDevice - SDK coverage buckets (may be null).
 * @param {object|null} [input.sources] - `{ SDK, API, UNKNOWN }` count map.
 * @param {string|null} [input.source] - single source hint ("SDK"/"API"/"UNKNOWN").
 * @returns {{ maxAppVersion: string|null, sourceScope: 'sdk'|'api'|'mixed'|'unknown', label: string, hasSdk: boolean, hasApi: boolean }}
 */
export function deriveItemVersionScope({ appVersionsByDevice = null, sources = null, source = null } = {}) {
  const maxAppVersion = maxAppVersionFromCoverage(appVersionsByDevice);
  const hasCoverage = Boolean(appVersionsByDevice && Object.keys(appVersionsByDevice).length);

  let hasSdk = hasCoverage;
  let hasApi = false;
  if (sources && typeof sources === "object") {
    hasSdk = hasSdk || (sources.SDK ?? 0) > 0;
    hasApi = hasApi || (sources.API ?? 0) > 0;
  } else if (source) {
    const key = String(source).toUpperCase();
    if (key === "SDK") hasSdk = true;
    else if (key === "API") hasApi = true;
  }

  let sourceScope = "unknown";
  if (hasSdk && hasApi) sourceScope = "mixed";
  else if (hasSdk) sourceScope = "sdk";
  else if (hasApi) sourceScope = "api";

  let label;
  switch (sourceScope) {
    case "api":
      label = "API — version-agnostic";
      break;
    case "sdk":
      label = maxAppVersion ? `SDK · latest app ${maxAppVersion}` : "SDK";
      break;
    case "mixed":
      label = maxAppVersion ? `SDK (latest app ${maxAppVersion}) + API` : "SDK + API";
      break;
    default:
      label = "Unknown source";
  }

  return { maxAppVersion, sourceScope, label, hasSdk, hasApi };
}
