/** Helpers for audit report sections (pure functions, no I/O). */

import { trackedValueCountForRow } from "./attributeValues.js";
import { attributeJsonPropertyStatsForRow } from "./attributeJsonSchema.js";
import { propertyValueStatsForBucket } from "./customEventPropertyValues.js";
import { kpiId as sampleKpiId } from "./eventSamples.js";
import { kpiId } from "./eventSamples.js";
import { enrichSendRejectedReasonRow } from "./sendRejectedReasons.js";
import { AUDIT_REPORT_TOP_LIST_LIMIT } from "./reportTopLimits.js";
import { sortVersionRowsByCountDesc, sortVersionRowsBySemverDesc } from "./sdkReleaseDates.js";

export const OPEN_PUSH_FIELD_HELP = {
  triggering_push:
    "Push notification that directly caused the app open (attribution). Contains push_id, campaign categories, and delivery time.",
  last_delivered:
    "Most recent push delivered to the device before this event. Used for session context and last-touch messaging attribution.",
};

const IOS_DEVICE_TYPES = new Set(["IOS", "IPHONE", "IPAD", "TVOS"]);
const ANDROID_DEVICE_TYPES = new Set(["ANDROID", "AMAZON"]);
const WEB_DEVICE_TYPES = new Set(["WEB", "WEB_PUSH"]);

/**
 * Audit bucket for CUSTOM events with missing device_type but Audience API source (named user, no channel).
 */
export const AUDIT_API_NAMED_USER_DEVICE_TYPE = "API_NAMED_USER_EVENTS";

/** Channels excluded from cross-platform gap warnings (SMS, email, etc.). */
const PLATFORM_GAP_IGNORED_DEVICE_TYPES = new Set([
  "SMS",
  "EMAIL",
  "UNKNOWN",
  AUDIT_API_NAMED_USER_DEVICE_TYPE,
]);

/**
 * Device types excluded from audience-attribute mismatch logic:
 * - AMAZON: keep separate from ANDROID; absence should not trigger a gap warning.
 * - UNKNOWN: typically indicates missing/partial device info; ignore mismatches involving it.
 * - API_NAMED_USER_EVENTS: server-side audience API, not a mobile/web platform.
 * - SMS / EMAIL: channel types, not compared to iOS/Android/Web.
 */
export const ATTRIBUTE_GAP_EXCLUDED_DEVICE_TYPES = new Set([
  "AMAZON",
  "SMS",
  "EMAIL",
  ...PLATFORM_GAP_IGNORED_DEVICE_TYPES,
]);

export function isAttributeGapExcludedDeviceType(deviceType) {
  return ATTRIBUTE_GAP_EXCLUDED_DEVICE_TYPES.has(String(deviceType ?? "").toUpperCase());
}

function isWebDeviceType(deviceType) {
  return WEB_DEVICE_TYPES.has(String(deviceType ?? "").toUpperCase());
}

function isIgnoredPlatformGapDeviceType(deviceType) {
  return PLATFORM_GAP_IGNORED_DEVICE_TYPES.has(String(deviceType ?? "").toUpperCase());
}

/** Map device_type to iOS / Android / Web label for cross-platform QA gaps. */
export function gapPlatformLabelFromDeviceType(deviceType) {
  const dt = String(deviceType ?? "").toUpperCase();
  if (IOS_DEVICE_TYPES.has(dt)) return "iOS";
  if (ANDROID_DEVICE_TYPES.has(dt)) return "Android";
  if (isWebDeviceType(dt)) return "Web";
  return null;
}

function pickCanonicalDeviceTypeForLabel(byDeviceType, label) {
  const keys = Object.keys(byDeviceType ?? {}).filter((k) => (byDeviceType[k] ?? 0) > 0);
  if (label === "iOS") {
    return keys.find((k) => IOS_DEVICE_TYPES.has(k.toUpperCase())) ?? null;
  }
  if (label === "Android") {
    return keys.find((k) => ANDROID_DEVICE_TYPES.has(k.toUpperCase())) ?? null;
  }
  if (label === "Web") {
    return keys.find((k) => isWebDeviceType(k)) ?? null;
  }
  return null;
}

/**
 * Platform labels used for cross-platform gap warnings: iOS, Android, and Web when present.
 * Requires at least two comparable platforms (SMS/email never included).
 */
export function crossPlatformGapLabels(byDeviceType) {
  const labels = new Set();
  for (const dt of Object.keys(byDeviceType ?? {})) {
    if ((byDeviceType[dt] ?? 0) <= 0) continue;
    const label = gapPlatformLabelFromDeviceType(dt);
    if (label) labels.add(label);
  }
  const ordered = [];
  if (labels.has("Android")) ordered.push("Android");
  if (labels.has("iOS")) ordered.push("iOS");
  if (labels.has("Web")) ordered.push("Web");
  return ordered.length >= 2 ? ordered : [];
}

/** Device types used when checking whether an attribute key is missing on some platforms. */
export function attributeExpectedDeviceTypes(byDeviceType) {
  const gapLabels = crossPlatformGapLabels(byDeviceType);
  if (gapLabels.length < 2) return [];

  const expected = [];
  for (const label of gapLabels) {
    const dt = pickCanonicalDeviceTypeForLabel(byDeviceType, label);
    if (dt && !isIgnoredPlatformGapDeviceType(dt)) expected.push(dt);
  }
  return [...new Set(expected)].sort();
}

/** True when a platform gap warning is actionable (missing iOS/Android/Web, not SMS/email). */
export function isActionablePlatformGap(presentOn, missingOn) {
  const missing = (missingOn ?? []).filter((p) => {
    const u = String(p ?? "");
    const asDevice = u.toUpperCase();
    if (PLATFORM_GAP_IGNORED_DEVICE_TYPES.has(asDevice)) return false;
    if (asDevice === "SMS" || asDevice === "EMAIL") return false;
    const label = gapPlatformLabelFromDeviceType(u) ?? u;
    return label === "iOS" || label === "Android" || label === "Web";
  });
  if (!missing.length) return false;
  const present = (presentOn ?? []).filter((p) => {
    const label = gapPlatformLabelFromDeviceType(p) ?? String(p ?? "");
    return label === "iOS" || label === "Android" || label === "Web";
  });
  return present.length > 0;
}

/** Minimum OPEN events per platform before comparing triggering_push rates. */
export const OPEN_PLATFORM_COMPARE_MIN = 20;
/** Absolute percentage-point gap that triggers a platform mismatch warning. */
export const OPEN_TRIGGERING_PUSH_GAP_PP = 15;

export function openPlatformLabel(deviceType) {
  const dt = String(deviceType ?? "").toUpperCase();
  if (IOS_DEVICE_TYPES.has(dt)) return "iOS";
  if (ANDROID_DEVICE_TYPES.has(dt)) return "Android";
  return null;
}

/** Canonical platform label for audit breakdown rows (iOS / Android / Web / raw device_type). */
export function platformLabelForEventBreakdown(deviceType) {
  return (
    gapPlatformLabelFromDeviceType(deviceType) ??
    openPlatformLabel(deviceType) ??
    (String(deviceType ?? "").toUpperCase() || "UNKNOWN")
  );
}

export function attachSampleKpisToPlatformRows(byPlatform, byDeviceBreakdown) {
  return (byPlatform ?? []).map((p) => {
    const matching = (byDeviceBreakdown ?? []).filter(
      (d) => platformLabelForEventBreakdown(d.deviceType) === p.platform,
    );
    const sampleKpiIds = matching.map((d) => d.sampleKpiId).filter(Boolean);
    return {
      ...p,
      sampleKpiId: sampleKpiIds[0] ?? null,
      sampleKpiIds,
    };
  });
}

export function buildOpenEventsReport(openAcc) {
  const openTotal = openAcc.total ?? 0;
  const byPlatformMap = {};

  for (const [deviceType, stats] of Object.entries(openAcc.byDevice ?? {})) {
    const label = openPlatformLabel(deviceType) ?? deviceType;
    if (!byPlatformMap[label]) {
      byPlatformMap[label] = {
        platform: label,
        total: 0,
        withTriggeringPush: 0,
        withLastDelivered: 0,
      };
    }
    const row = byPlatformMap[label];
    row.total += stats.total ?? 0;
    row.withTriggeringPush += stats.triggeringPush ?? 0;
    row.withLastDelivered += stats.lastDelivered ?? 0;
  }

  const byPlatform = Object.values(byPlatformMap)
    .map((row) => ({
      ...row,
      pctTriggeringPush: row.total
        ? Math.round((row.withTriggeringPush / row.total) * 1000) / 10
        : 0,
      pctLastDelivered: row.total
        ? Math.round((row.withLastDelivered / row.total) * 1000) / 10
        : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const ios = byPlatform.find((p) => p.platform === "iOS");
  const android = byPlatform.find((p) => p.platform === "Android");
  let platformGapWarning = null;

  if (
    ios &&
    android &&
    ios.total >= OPEN_PLATFORM_COMPARE_MIN &&
    android.total >= OPEN_PLATFORM_COMPARE_MIN
  ) {
    const gapPct = Math.abs(ios.pctTriggeringPush - android.pctTriggeringPush);
    if (gapPct >= OPEN_TRIGGERING_PUSH_GAP_PP) {
      platformGapWarning = {
        field: "triggering_push",
        gapPct: Math.round(gapPct * 10) / 10,
        ios: { total: ios.total, pct: ios.pctTriggeringPush, withField: ios.withTriggeringPush },
        android: {
          total: android.total,
          pct: android.pctTriggeringPush,
          withField: android.withTriggeringPush,
        },
        message: `OPEN triggering_push rate differs by ${gapPct.toFixed(1)} pp: iOS ${ios.pctTriggeringPush}% (${ios.withTriggeringPush.toLocaleString()}/${ios.total.toLocaleString()}) vs Android ${android.pctTriggeringPush}% (${android.withTriggeringPush.toLocaleString()}/${android.total.toLocaleString()}).`,
      };
    }
  }

  return {
    total: openTotal,
    withTriggeringPush: openAcc.triggeringPush ?? 0,
    withLastDelivered: openAcc.lastDelivered ?? 0,
    pctTriggeringPush: openTotal
      ? Math.round((openAcc.triggeringPush / openTotal) * 1000) / 10
      : 0,
    pctLastDelivered: openTotal
      ? Math.round((openAcc.lastDelivered / openTotal) * 1000) / 10
      : 0,
    fieldHelp: OPEN_PUSH_FIELD_HELP,
    byPlatform,
    platformGapWarning,
  };
}

export function normalizeAttrKey(key) {
  return String(key ?? "").toLowerCase();
}

/** RTDS channel id on device — mobile/web SDK events always carry one of these. */
export function eventHasChannel(event) {
  const d = event?.device;
  if (!d) return false;
  return !!(
    d.channel ||
    d.ios_channel ||
    d.android_channel ||
    d.web_channel ||
    d.open_channel ||
    d.amazon_channel
  );
}

export function eventHasNamedUser(event) {
  return !!(event?.user?.named_user_id || event?.device?.named_user_id);
}

/**
 * SDK vs API for audience events (attributes, tags, custom):
 * - SDK: event is tied to a channel (mobile/web device in RTDS payload).
 * - API: named-user audience update with no channel id (server/API only).
 */
function normalizeExplicitSource(raw) {
  const s = raw ? String(raw).trim().toUpperCase() : "";
  if (!s) return "";
  // Accept common variants from instrumentation / pipelines.
  if (s === "SDK" || s.startsWith("SDK_") || s.endsWith("_SDK")) return "SDK";
  if (s === "API" || s.startsWith("API_") || s.endsWith("_API") || s.includes("AUDIENCE_API") || s.includes("API")) {
    return "API";
  }
  return "";
}

/** CUSTOM events: trust body.source when set; otherwise channel / named-user inference. */
export function inferCustomEventSource(body = {}, event = null) {
  const explicit = normalizeExplicitSource(body.source);
  if (explicit) return explicit;
  return inferEventSource("CUSTOM", body, event);
}

export function inferEventSource(type, body = {}, event = null) {
  const explicit = normalizeExplicitSource(body.source);
  const audienceTypes = new Set(["ATTRIBUTE_OPERATION", "TAG_CHANGE", "CUSTOM"]);

  if (audienceTypes.has(type)) {
    if (event && eventHasChannel(event)) return "SDK";
    if (event && eventHasNamedUser(event) && !eventHasChannel(event)) return "API";
    if (explicit) return explicit;
    return "UNKNOWN";
  }

  if (event && eventHasChannel(event)) return "SDK";
  if (explicit) return explicit;
  if (["OPEN", "CLOSE", "SCREEN_VIEWED", "FIRST_OPEN", "WEB_SESSION", "WEB_CLICK", "UNINSTALL"].includes(type)) {
    return "SDK";
  }
  if (["CONTACT_CHANGE", "SUBSCRIPTION_LIST", "COMPLIANCE"].includes(type)) {
    if (event && eventHasChannel(event)) return "SDK";
    return "API";
  }
  return "UNKNOWN";
}

export const SOURCE_INFERENCE_HELP =
  "SDK: event includes a device channel id (mobile/web). API: named-user update with no channel id (Audience API only).";

/**
 * Device type used in audit aggregates. UNKNOWN + CUSTOM + API source → API_NAMED_USER_EVENTS.
 */
export function auditDeviceType(event, eventType) {
  const raw = String(event?.device?.device_type ?? "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
  const type = String(eventType ?? event?.type ?? "").toUpperCase();
  if (raw === "UNKNOWN" && type === "CUSTOM" && inferCustomEventSource(event?.body ?? {}, event) === "API") {
    return AUDIT_API_NAMED_USER_DEVICE_TYPE;
  }
  return raw;
}

/** Custom-event source bucket aligned with auditDeviceType (Audience API named-user events). */
export function resolveCustomEventSource(body, event, auditDeviceTypeKey) {
  const inferred = inferCustomEventSource(body, event);
  if (auditDeviceTypeKey === AUDIT_API_NAMED_USER_DEVICE_TYPE) return "API";
  return inferred;
}

export function valueFingerprint(value, typeHint) {
  if (value === null || value === undefined) return "empty";
  const t = typeHint || typeof value;
  if (t === "NUMBER" || (typeof value === "number" && !Number.isNaN(value))) return "number";
  const s = String(value);
  if (s === "") return "empty";
  if (/^\d+(\.\d+)?$/.test(s)) return "numeric-string";
  if (s === s.toUpperCase() && /[A-Z]/.test(s)) return "uppercase-text";
  if (s === s.toLowerCase()) return "lowercase-text";
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return "mixed-case-text";
  return "text";
}

/** Collapse casing-only text variants so full_name etc. do not false-positive across platforms. */
export function normalizeFingerprintForDeviceCompare(fp) {
  if (fp === "lowercase-text" || fp === "mixed-case-text" || fp === "uppercase-text" || fp === "text") {
    return "text";
  }
  if (fp === "number" || fp === "numeric-string") return "numeric";
  return fp;
}

export function fingerprintLabel(fp) {
  const labels = {
    empty: "empty",
    number: "number",
    "numeric-string": "numeric (string)",
    numeric: "numeric",
    text: "text",
    "lowercase-text": "text",
    "mixed-case-text": "text",
    "uppercase-text": "text",
  };
  return labels[fp] ?? fp;
}

/** True when attribute value shapes differ meaningfully across device types (not letter casing). */
export function detectAttributeValueFormatDiff(byDevice) {
  const devices = Object.entries(byDevice ?? {});
  const comparableDevices = devices.filter(([dt]) => !isAttributeGapExcludedDeviceType(dt));
  if (comparableDevices.length < 2) return null;

  const rows = devices.map(([deviceType, dev]) => {
    const fingerprints = [...(dev.valueFingerprints ?? new Set())].sort();
    const compareFingerprints = [
      ...new Set(fingerprints.map(normalizeFingerprintForDeviceCompare)),
    ].sort();
    return {
      deviceType,
      fingerprints,
      compareFingerprints,
      sampleValues: [...(dev.sampleValues ?? new Set())].slice(0, 3),
    };
  });

  const compareSets = rows.map((r) => r.compareFingerprints.join("|"));
  const comparableCompareSets = rows
    .filter((r) => !isAttributeGapExcludedDeviceType(r.deviceType))
    .map((r) => r.compareFingerprints.join("|"));
  if (new Set(comparableCompareSets).size <= 1) return null;
  return { devices: rows };
}

export function extractCustomPropertyKeys(body) {
  const props = body?.properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) return [];
  return Object.keys(props);
}

function screenFieldToString(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
    const s = String(raw).trim();
    return s || null;
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const nested =
      raw.name ?? raw.screen_name ?? raw.screenName ?? raw.id ?? raw.screen_id ?? raw.title;
    if (nested !== null && nested !== undefined && nested !== "") {
      const s = String(nested).trim();
      return s || null;
    }
  }
  return null;
}

/** RTDS SCREEN_VIEWED: primary field is body.viewed_screen (see Airship RTDS docs). */
export function extractScreenName(body) {
  if (!body || typeof body !== "object") return "(unnamed)";
  for (const raw of [body.viewed_screen, body.screen, body.screen_name, body.screenName, body.name]) {
    const name = screenFieldToString(raw);
    if (name) return name;
  }
  return "(unnamed)";
}

export function screenPlatformsInSample(screenByName) {
  const totals = {};
  for (const data of Object.values(screenByName ?? {})) {
    for (const [dt, count] of Object.entries(data.byDevice ?? {})) {
      totals[dt] = (totals[dt] ?? 0) + count;
    }
  }
  return crossPlatformGapLabels(totals);
}

/** When the audit sample includes comparable mobile/web platforms, compare custom events across them. */
export function expectedIosAndroidPlatforms(byDeviceType) {
  return crossPlatformGapLabels(byDeviceType);
}

export function enrichScreenRowPlatforms(row, expectedPlatforms) {
  const byPlatformMap = {};
  for (const [dt, count] of Object.entries(row.byDevice ?? {})) {
    if (!count) continue;
    const label = platformLabelForEventBreakdown(dt);
    byPlatformMap[label] = (byPlatformMap[label] ?? 0) + count;
  }

  const byPlatform = Object.entries(byPlatformMap)
    .map(([platform, count]) => ({
      platform,
      count,
      pct: row.count ? Math.round((count / row.count) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const presentPlatforms = byPlatform.filter((p) => p.count > 0).map((p) => p.platform);
  const missingPlatforms = expectedPlatforms.filter((p) => !presentPlatforms.includes(p));

  return {
    byPlatform,
    platformMismatch:
      expectedPlatforms.length >= 2 && presentPlatforms.length > 0 && missingPlatforms.length > 0,
    presentPlatforms,
    missingPlatforms,
  };
}

export function buildScreenViewedInsights(screenByName, { namesCapped = false } = {}) {
  const rows = Object.entries(screenByName)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, data]) => ({
      name,
      count: data.count,
      byDevice: { ...data.byDevice },
    }));

  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const platformLabelsInSample = screenPlatformsInSample(screenByName);

  const byDevice = {};
  const byPlatformTotals = {};
  for (const row of rows) {
    for (const [dt, count] of Object.entries(row.byDevice)) {
      byDevice[dt] = (byDevice[dt] ?? 0) + count;
      const label = openPlatformLabel(dt);
      if (label) byPlatformTotals[label] = (byPlatformTotals[label] ?? 0) + count;
    }
  }

  return {
    total,
    uniqueScreens: rows.length,
    namesCapped,
    platformLabelsInSample,
    byPlatform: Object.entries(byPlatformTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([platform, count]) => ({
        platform,
        count,
        pct: total ? Math.round((count / total) * 1000) / 10 : 0,
      })),
    byDevice: Object.entries(byDevice)
      .sort((a, b) => b[1] - a[1])
      .map(([deviceType, count]) => ({
        deviceType,
        count,
        pct: total ? Math.round((count / total) * 1000) / 10 : 0,
      })),
    top: rows.slice(0, 40).map((row) => {
      const platformMeta = enrichScreenRowPlatforms(row, platformLabelsInSample);
      const byDeviceBreakdown = Object.entries(row.byDevice ?? {})
        .sort((a, b) => b[1] - a[1])
        .map(([deviceType, count]) => ({
          deviceType,
          count,
          pct: row.count ? Math.round((count / row.count) * 1000) / 10 : 0,
          sampleKpiId: sampleKpiId("screen", row.name, deviceType),
        }));
      const sampleKpiIds = byDeviceBreakdown.map((d) => d.sampleKpiId).filter(Boolean);
      return {
        ...row,
        ...platformMeta,
        byDeviceBreakdown,
        pct: total ? Math.round((row.count / total) * 1000) / 10 : 0,
        sampleKpiIds,
        sampleKpiId: sampleKpiIds[0] ?? null,
      };
    }),
  };
}

export function extractAttributeOpsDetailed(body) {
  const ops = [];
  if (body?.attribute) {
    ops.push({
      key: String(body.attribute),
      action: body.action || body.operation || "set",
      value: body.value,
      type: body.type,
    });
  }
  if (Array.isArray(body?.attributes)) {
    for (const item of body.attributes) {
      if (item?.name || item?.key) {
        ops.push({
          key: String(item.name || item.key),
          action: item.action || item.operation || "set",
          value: item.value,
          type: item.type,
        });
      }
    }
  }
  if (body?.set && typeof body.set === "object" && !Array.isArray(body.set)) {
    for (const [key, value] of Object.entries(body.set)) {
      ops.push({ key, action: "set", value, type: typeof value });
    }
  }
  if (Array.isArray(body?.set)) {
    for (const item of body.set) {
      if (item?.key) ops.push({ key: String(item.key), action: "set", value: item.value, type: item.type });
    }
  }
  if (Array.isArray(body?.remove)) {
    for (const item of body.remove) {
      if (item?.key) ops.push({ key: String(item.key), action: "remove", value: undefined, type: item.type });
    }
  }
  return ops;
}

export function addToSetMap(map, outerKey, innerKey) {
  if (!map[outerKey]) map[outerKey] = new Set();
  map[outerKey].add(innerKey);
}

export function setMapToArrays(map) {
  const out = {};
  for (const [k, set] of Object.entries(map)) {
    out[k] = [...set].sort();
  }
  return out;
}

export function comparePropertySetsByDevice(propertiesByDevice) {
  const devices = Object.keys(propertiesByDevice);
  if (devices.length < 2) return [];
  const diffs = [];
  for (let i = 0; i < devices.length; i += 1) {
    for (let j = i + 1; j < devices.length; j += 1) {
      const a = devices[i];
      const b = devices[j];
      const setA = new Set(propertiesByDevice[a] ?? []);
      const setB = new Set(propertiesByDevice[b] ?? []);
      const onlyA = [...setA].filter((p) => !setB.has(p)).sort();
      const onlyB = [...setB].filter((p) => !setA.has(p)).sort();
      if (onlyA.length || onlyB.length) {
        diffs.push({ deviceA: a, deviceB: b, onlyOnA: onlyA, onlyOnB: onlyB });
      }
    }
  }
  return diffs;
}

const SDK_VERSION_EXCLUDED_DEVICE_TYPES = new Set(["EMAIL", AUDIT_API_NAMED_USER_DEVICE_TYPE]);

export function buildVersionByDeviceReport(versionsByDevice, byDeviceType, { sortBy = "semver" } = {}) {
  const sortRows =
    sortBy === "count" ? sortVersionRowsByCountDesc : sortVersionRowsBySemverDesc;
  return Object.entries(byDeviceType)
    .filter(([deviceType]) => !SDK_VERSION_EXCLUDED_DEVICE_TYPES.has(deviceType))
    .sort((a, b) => b[1] - a[1])
    .map(([deviceType, deviceTotal]) => {
      const bucket = versionsByDevice[deviceType] ?? { versions: {} };
      const versionRows = sortRows(
        Object.entries(bucket.versions ?? {}).map(([version, count]) => ({
          version,
          count,
          pctOfDevice: deviceTotal ? Math.round((count / deviceTotal) * 1000) / 10 : 0,
        })),
      );
      const withVersion = versionRows.reduce((s, r) => s + r.count, 0);
      return {
        deviceType,
        deviceEventTotal: deviceTotal,
        eventsWithVersion: withVersion,
        pctWithVersion: deviceTotal ? Math.round((withVersion / deviceTotal) * 1000) / 10 : 0,
        versions: versionRows,
      };
    });
}

export function buildSdkVersionReport(sdkByDevice, byDeviceType) {
  return buildVersionByDeviceReport(sdkByDevice, byDeviceType, { sortBy: "count" });
}

function formatAppSdkLabel(sdkRows) {
  if (!sdkRows?.length) return null;
  const dominant = [...sdkRows].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0];
  if (sdkRows.length === 1) return dominant.version;
  if (dominant.pctOfApp >= 98) return dominant.version;
  const significant = sdkRows.filter((r) => r.pctOfApp >= 5);
  if (significant.length <= 1) return dominant.version;
  return significant
    .slice(0, 3)
    .map((r) => r.version)
    .join(", ");
}

/** App versions per device_type, with dominant SDK (ua_sdk_version) per app version. */
export function buildAppVersionReport(appByDevice, byDeviceType) {
  return buildVersionByDeviceReport(appByDevice, byDeviceType, { sortBy: "count" }).map((row) => {
    const bucket = appByDevice[row.deviceType] ?? {};
    const sdkByApp = bucket.sdkByAppVersion ?? {};

    return {
      ...row,
      versions: row.versions.map((v) => {
        const sdkMap = sdkByApp[v.version] ?? {};
        const sdkRows = sortVersionRowsByCountDesc(
          Object.entries(sdkMap).map(([sdkVersion, count]) => ({
            version: sdkVersion,
            count,
            pctOfApp: v.count ? Math.round((count / v.count) * 1000) / 10 : 0,
          })),
        );
        return {
          ...v,
          sdkVersions: sdkRows,
          sdkLabel: formatAppSdkLabel(sdkRows),
        };
      }),
    };
  });
}

/** OPEN events per app version (and SDK), using OPEN counts as the device denominator. */
export function buildOpenAppVersionReport(openAcc) {
  const openTotalsByDevice = {};
  for (const [deviceType, stats] of Object.entries(openAcc?.byDevice ?? {})) {
    openTotalsByDevice[deviceType] = stats.total ?? 0;
  }
  return buildAppVersionReport(openAcc?.appByDevice ?? {}, openTotalsByDevice);
}

export function enrichAttributeRow(row, expectedDeviceTypes = []) {
  const existingMap = new Map((row.byDeviceBreakdown ?? []).map((d) => [d.deviceType, d]));
  const rawExpected =
    expectedDeviceTypes.length > 0 ? [...expectedDeviceTypes] : [...existingMap.keys()];
  const gapExpected = rawExpected.filter((dt) => !isAttributeGapExcludedDeviceType(dt));
  const withData = [...existingMap.entries()]
    .filter(([, d]) => (d.count ?? 0) > 0)
    .map(([dt]) => dt);
  const deviceTypes = [...new Set([...gapExpected, ...withData])].sort();

  const byDeviceBreakdown = deviceTypes
    .map((deviceType) => {
      const hit = existingMap.get(deviceType);
      if (hit) return hit;
      return {
        deviceType,
        count: 0,
        pct: 0,
        sampleKpiId: sampleKpiId("attr", "key", row.normalized, deviceType),
      };
    })
    .sort((a, b) => b.count - a.count);

  const presentPlatforms = byDeviceBreakdown.filter((d) => d.count > 0).map((d) => d.deviceType);
  const missingPlatforms = gapExpected.filter((dt) => !presentPlatforms.includes(dt));

  return {
    byDeviceBreakdown,
    platformMismatch:
      gapExpected.length >= 2 && presentPlatforms.length > 0 && missingPlatforms.length > 0,
    presentPlatforms,
    missingPlatforms,
  };
}

export function buildAttributeInsights(attributeKeys, { expectedDeviceTypes = [] } = {}) {
  const topKeys = [];
  const caseConflicts = [];

  for (const [normalized, data] of Object.entries(attributeKeys)) {
    const variants = Object.entries(data.keyVariants ?? {});
    const canonical = variants.sort((a, b) => b[1] - a[1])[0]?.[0] ?? normalized;
    const byDeviceBreakdown = Object.entries(data.byDevice ?? {})
      .map(([deviceType, dev]) => ({
        deviceType,
        count: dev.count ?? 0,
        pct: data.count ? Math.round(((dev.count ?? 0) / data.count) * 1000) / 10 : 0,
        sampleKpiId: sampleKpiId("attr", "key", normalized, deviceType),
      }))
      .sort((a, b) => b.count - a.count);

    const valueFormatDiff = detectAttributeValueFormatDiff(data.byDevice);

    const baseRow = {
      key: canonical,
      normalized,
      count: data.count,
      actions: data.actions,
      sources: data.sources,
      deviceTypes: byDeviceBreakdown.map((d) => d.deviceType),
      byDeviceBreakdown,
      valueFormatDiff,
      trackedValueCount: trackedValueCountForRow(data),
      valuesCapped: Boolean(data.valuesCapped),
      sampleKpiId: byDeviceBreakdown[0]?.sampleKpiId ?? sampleKpiId("attr", "key", normalized),
    };

    const jsonPropertyValueStats = attributeJsonPropertyStatsForRow(data);

    topKeys.push({
      ...baseRow,
      ...enrichAttributeRow(baseRow, expectedDeviceTypes),
      hasJsonValues: Boolean(data.hasJsonValues),
      jsonProperties: jsonPropertyValueStats.map((p) => p.property),
      jsonPropertyValueStats,
    });

    if (variants.length > 1) {
      caseConflicts.push({
        normalized,
        sampleKpiId: `attr.case.${normalized}`,
        variants: variants.map(([key, count]) => ({ key, count })),
        byDevice: Object.fromEntries(
          Object.entries(data.byDevice ?? {}).map(([dt, row]) => [dt, [...(row.keyVariants ?? new Set())]]),
        ),
      });
    }
  }

  topKeys.sort((a, b) => b.count - a.count);
  return {
    topKeys: topKeys.slice(0, AUDIT_REPORT_TOP_LIST_LIMIT),
    caseConflicts: caseConflicts.slice(0, 30),
    deviceTypesInSample: expectedDeviceTypes,
  };
}

export function buildCustomEventInsights(
  customByName,
  { analyzePropertyMismatch = true, source, expectedPlatforms = [] } = {},
) {
  return Object.entries(customByName)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, data]) => {
      const sourceKey = source ?? data.source ?? "unknown";
      const propertiesByDevice = setMapToArrays(data.propertiesByDevice ?? {});
      const propertyDiffs = analyzePropertyMismatch
        ? comparePropertySetsByDevice(propertiesByDevice)
        : [];
      const allProperties = analyzePropertyMismatch
        ? [...new Set(Object.values(propertiesByDevice).flat())].sort()
        : [];

      const propertyDiffKpis = propertyDiffs.flatMap((d) => [
        ...d.onlyOnA.map((prop) => ({
          kpiId: sampleKpiId("custom", "prop", sourceKey, name, d.deviceA, prop),
          device: d.deviceA,
          prop,
        })),
        ...d.onlyOnB.map((prop) => ({
          kpiId: sampleKpiId("custom", "prop", sourceKey, name, d.deviceB, prop),
          device: d.deviceB,
          prop,
        })),
      ]);
      const byDeviceBreakdown = Object.entries(data.byDevice ?? {})
        .sort((a, b) => b[1] - a[1])
        .map(([deviceType, count]) => ({
          deviceType,
          count,
          pct: data.count ? Math.round((count / data.count) * 1000) / 10 : 0,
          sampleKpiId: sampleKpiId("custom", sourceKey, name, deviceType),
        }));

      const sampleKpiIds = byDeviceBreakdown
        .map((d) => d.sampleKpiId)
        .filter((id, index, arr) => id && arr.indexOf(id) === index);

      const baseRow = {
        name,
        count: data.count,
        source: sourceKey,
        byDevice: data.byDevice,
        byDeviceBreakdown,
        properties: allProperties,
        propertiesByDevice,
        propertyDiffs,
        propertyDiffKpis,
        sampleKpiId: sampleKpiIds[0] ?? null,
        sampleKpiIds,
        sampleValues: [...(data.sampleValues ?? new Set())],
        propertyValueStats: propertyValueStatsForBucket(data),
      };

      if (expectedPlatforms.length >= 2) {
        const platformMeta = enrichScreenRowPlatforms(baseRow, expectedPlatforms);
        const byPlatform = attachSampleKpisToPlatformRows(
          platformMeta.byPlatform,
          byDeviceBreakdown,
        );
        return { ...baseRow, ...platformMeta, byPlatform };
      }

      return baseRow;
    });
}

export function buildMessagingFailures(sendAborted, sendRejected) {
  const mapReasons = (bucket) =>
    Object.entries(bucket.byReason ?? {})
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => ({ reason, count }));

  return {
    sendAborted: {
      total: sendAborted.total ?? 0,
      byReason: mapReasons(sendAborted).map((row) => ({
        ...row,
        sampleKpiId: kpiId("messaging", "send_aborted", row.reason),
      })),
    },
    sendRejected: {
      total: sendRejected.total ?? 0,
      byReason: mapReasons(sendRejected).map((row) =>
        enrichSendRejectedReasonRow({
          ...row,
          sampleKpiId: kpiId("messaging", "send_rejected", row.reason),
        }),
      ),
    },
  };
}

export function buildSourceBreakdown(sources) {
  const toRows = (map, category) => {
    const total = Object.values(map ?? {}).reduce((a, b) => a + b, 0);
    return {
      total,
      breakdown: Object.entries(map ?? {})
        .sort((a, b) => b[1] - a[1])
        .map(([source, count]) => ({
          source,
          count,
          pct: total ? Math.round((count / total) * 1000) / 10 : 0,
          sampleKpiId: `sources.${category}.${source}`,
        })),
    };
  };
  return {
    customEvents: toRows(sources.customEvents, "custom"),
    attributes: toRows(sources.attributes, "attributes"),
    tags: toRows(sources.tags, "tags"),
  };
}
