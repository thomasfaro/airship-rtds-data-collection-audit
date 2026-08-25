import fs from "node:fs";
import { AUDIT_STREAM_MODES, buildProcessedRange } from "./auditWindow.js";
import { AUDIT_LATENCY_MS } from "./fetchEvents.js";
import {
  OPEN_PUSH_FIELD_HELP,
  buildOpenEventsReport,
  buildOpenAppVersionReport,
  addToSetMap,
  buildAttributeInsights,
  buildCustomEventInsights,
  buildMessagingFailures,
  buildScreenViewedInsights,
  attributeExpectedDeviceTypes,
  auditDeviceType,
  AUDIT_API_NAMED_USER_DEVICE_TYPE,
  resolveCustomEventSource,
  expectedIosAndroidPlatforms,
  buildAppVersionReport,
  buildSdkVersionReport,
  buildSourceBreakdown,
  extractAttributeOpsDetailed,
  extractCustomPropertyKeys,
  extractScreenName,
  inferCustomEventSource,
  inferEventSource,
  normalizeAttrKey,
  valueFingerprint,
} from "./analyzeInsights.js";
import {
  buildSdkCrossPlatformMajorSummary,
  collectAuditWarnings,
} from "./auditWarnings.js";
import { buildAudienceTagsReport, extractTagChanges, MAX_TAG_KEYS_IN_REPORT } from "./audienceTags.js";
import { buildExecutiveSummaryKpis, buildExecutiveSummarySendRejectedKpi } from "./executiveSummaryKpis.js";
import {
  adjustDeviceTypeRowsForExecutiveSummary,
  filterContactChangeTypesForExecutiveSummary,
} from "./executiveSummaryFilters.js";
import {
  enrichAppVersionsReport,
  enrichSdkVersionsReport,
  preloadReleaseMaps,
} from "./sdkReleaseDates.js";
import {
  createAirshipTagsAccumulator,
  isAirshipAutoTag,
  processAirshipAutoTag,
  tagGroupKey,
} from "./airshipAutoTags.js";
import {
  createAirshipAttributesAccumulator,
  isAirshipAutoAttributeKey,
  processAirshipAttributeOp,
} from "./airshipAutoAttributes.js";
import {
  buildContactChangeReport,
  createContactChangeAccumulator,
  processContactChangeEvent,
} from "./contactChange.js";
import {
  buildComplianceReport,
  createComplianceAccumulator,
  processComplianceEvent,
} from "./compliance.js";
import {
  buildEmailFeedbackReport,
  createEmailFeedbackAccumulator,
  isEmailFeedbackCustomEvent,
  normalizeEmailCustomName,
  processEmailFeedbackCustomEvent,
} from "./emailCustomEvents.js";
import { persistAttributeValuesSidecar, trackAttributeValue } from "./attributeValues.js";
import { trackAttributeJsonProperties } from "./attributeJsonSchema.js";
import { isMessagingInteractionCustomEvent } from "./customEventFilters.js";
import { persistEventSamplesSidecar } from "./eventSamplesSidecar.js";
import { eventPassesAnalysisScope } from "./analysisScope.js";
import { excludedDeviceTypesFromFilter } from "./auditDeviceTypePredicates.js";
import {
  mergeCustomEventPropertyValueCounts,
  persistCustomPropertyValuesSidecar,
  trackCustomPropertyValue,
} from "./customEventPropertyValues.js";
import { createEventSampleCollector, kpiId as sampleKpiId } from "./eventSamples.js";
import {
  buildSubscriptionListsReport,
  createSubscriptionListsAccumulator,
  processSubscriptionListEvent,
} from "./subscriptionLists.js";
import { trackAppVersionCoverage } from "./appVersionCoverage.js";
import { annotateReportObsolescence } from "./obsolescence.js";
import { iterateNdjsonLines } from "./ndjsonLineIterator.js";
import { backfillWarningEventSamplesWithProgress } from "./warningSampleMatch.js";
import { buildLineErrorPreview, formatLineErrorSampleHint } from "./lineErrorPreview.js";
import { AUDIT_EXCLUDED_GROUPS, registryMeta } from "./registry.js";
import { CappedUniqueCounter } from "./uniqueCounter.js";
import { AUDIT_REPORT_TOP_LIST_LIMIT } from "./reportTopLimits.js";

const MAX_CUSTOM_EVENT_NAMES = 5_000;
const MAX_SCREEN_NAMES = 5_000;
const MAX_LINE_ERROR_SAMPLES = 8;
const MAX_TAG_KEYS = MAX_TAG_KEYS_IN_REPORT;
const MAX_ATTRIBUTE_KEYS = 20_000;
const ANALYZE_PROGRESS_INTERVAL = 10_000;
const ANALYZE_PROGRESS_MS = 2_000;
const CUSTOM_EVENT_SOURCES = ["SDK", "API", "UNKNOWN"];

function createCustomBySource() {
  return { SDK: {}, API: {}, UNKNOWN: {} };
}

function normalizeCustomSourceKey(source) {
  return source === "SDK" || source === "API" ? source : "UNKNOWN";
}

function countCustomEventNames(customBySource) {
  return CUSTOM_EVENT_SOURCES.reduce((n, key) => n + Object.keys(customBySource[key]).length, 0);
}

function getCustomEventBucket(acc, source, name) {
  const sourceKey = normalizeCustomSourceKey(source);
  const map = acc.customBySource[sourceKey];
  if (!map[name]) {
    if (countCustomEventNames(acc.customBySource) >= MAX_CUSTOM_EVENT_NAMES) {
      acc.customNamesCapped = true;
      return null;
    }
    map[name] = {
      count: 0,
      source: sourceKey,
      byDevice: {},
      propertiesByDevice: {},
      propertyValueCounts: {},
      sampleValues: new Set(),
    };
  }
  return map[name];
}

function mergeCustomEventRow(target, source) {
  target.count += source.count ?? 0;
  for (const [dt, count] of Object.entries(source.byDevice ?? {})) {
    inc(target.byDevice, dt, count);
  }
  for (const [dt, props] of Object.entries(source.propertiesByDevice ?? {})) {
    if (!target.propertiesByDevice[dt]) target.propertiesByDevice[dt] = new Set();
    for (const prop of props instanceof Set ? props : props ?? []) {
      target.propertiesByDevice[dt].add(prop);
    }
  }
  for (const value of source.sampleValues ?? []) {
    if (target.sampleValues.size < 5) target.sampleValues.add(value);
  }
  mergeCustomEventPropertyValueCounts(target, source);
}

/** Move API named-user CUSTOM rows mistakenly stored under UNKNOWN source (legacy analyses). */
function mergeApiNamedUserCustomEventsFromUnknown(customBySource) {
  const unknown = customBySource.UNKNOWN;
  if (!unknown) return;
  for (const [name, data] of Object.entries({ ...unknown })) {
    const apiNamed = data.byDevice?.[AUDIT_API_NAMED_USER_DEVICE_TYPE] ?? 0;
    if (apiNamed <= 0) continue;
    delete unknown[name];
    if (!customBySource.API[name]) {
      customBySource.API[name] = {
        count: 0,
        source: "API",
        byDevice: {},
        propertiesByDevice: {},
        propertyValueCounts: {},
        sampleValues: new Set(),
      };
    }
    const bucket = customBySource.API[name];
    mergeCustomEventRow(bucket, data);
    bucket.source = "API";
  }
}

function buildCustomEventsReport(customBySource, { namesCapped = false, expectedPlatforms = [] } = {}) {
  mergeApiNamedUserCustomEventsFromUnknown(customBySource);
  const buildFor = (sourceKey, analyzePropertyMismatch) =>
    buildCustomEventInsights(customBySource[sourceKey], {
      analyzePropertyMismatch,
      source: sourceKey,
      expectedPlatforms: sourceKey === "SDK" ? expectedPlatforms : [],
    });

  const sdkRows = buildFor("SDK", true);
  const apiRows = buildFor("API", false);
  const unknownRows = buildFor("UNKNOWN", false);
  const sum = (rows) => rows.reduce((s, row) => s + row.count, 0);

  const section = (rows) => ({
    total: sum(rows),
    uniqueNames: rows.length,
    top: rows.slice(0, AUDIT_REPORT_TOP_LIST_LIMIT),
  });

  const report = {
    total: sum(sdkRows) + sum(apiRows) + sum(unknownRows),
    uniqueNames: sdkRows.length + apiRows.length + unknownRows.length,
    namesCapped,
    platformLabelsInSample: expectedPlatforms,
    sdk: section(sdkRows),
    api: section(apiRows),
  };
  if (unknownRows.length > 0) {
    report.unknown = section(unknownRows);
  }
  return report;
}

function inc(map, key, amount = 1, { maxKeys = null, onCapped = null } = {}) {
  if (!key) return false;
  if (!(key in map)) {
    if (maxKeys != null && Object.keys(map).length >= maxKeys) {
      onCapped?.();
      return false;
    }
    map[key] = 0;
  }
  map[key] = (map[key] ?? 0) + amount;
  return true;
}

function topEntries(map, limit = 15) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function eventTypesForDevice(eventsByDeviceType, deviceType, deviceTotal) {
  const typeMap = eventsByDeviceType[deviceType] ?? {};
  return topEntries(typeMap, 100).map(({ key: type, count }) => ({
    type,
    count,
    pct: deviceTotal > 0 ? Math.round((count / deviceTotal) * 1000) / 10 : 0,
  }));
}

/** All RTDS types seen in the sample (summed across device types). */
function aggregateEventTypesInSample(eventsByDeviceType) {
  const totals = {};
  for (const typeMap of Object.values(eventsByDeviceType ?? {})) {
    for (const [type, count] of Object.entries(typeMap)) {
      totals[type] = (totals[type] ?? 0) + count;
    }
  }
  return topEntries(totals, 100).map(({ key: type, count }) => ({ type, count }));
}

const BY_DEVICE_TYPE_REPORT_LIMIT = 50;

function buildByDeviceTypeReport(acc) {
  const deviceKeys = Object.keys(acc.byDeviceType ?? {});
  const rows = topEntries(acc.byDeviceType, BY_DEVICE_TYPE_REPORT_LIMIT).map((row) => ({
    ...row,
    sampleKpiId: sampleKpiId("by_device", row.key),
    eventTypes: eventTypesForDevice(acc.eventsByDeviceType, row.key, row.count),
  }));
  return {
    rows,
    typesInSample: aggregateEventTypesInSample(acc.eventsByDeviceType),
    deviceTypesTotal: deviceKeys.length,
    deviceTypesCapped: deviceKeys.length > BY_DEVICE_TYPE_REPORT_LIMIT,
  };
}

function eventNamedUser(event) {
  return event.user?.named_user_id || event.device?.named_user_id || "";
}

function eventChannel(event) {
  return event.device?.channel || event.device?.ios_channel || event.device?.android_channel || "";
}

function createAccumulator({ analysisScope = null } = {}) {
  return {
    analysisScope,
    total: 0,
    parseErrors: 0,
    processErrors: 0,
    lineErrorSamples: [],
    byDeviceType: {},
    eventsByDeviceType: {},
    sdkTypeCounts: {},
    apiTypeCounts: {},
    customBySource: createCustomBySource(),
    customNamesCapped: false,
    attributeKeys: {},
    tagsAdded: {},
    tagsRemoved: {},
    tagsCapped: false,
    channels: new CappedUniqueCounter(),
    namedUsers: new CappedUniqueCounter(),
    minOccurred: null,
    maxOccurred: null,
    minProcessed: null,
    maxProcessed: null,
    open: { total: 0, triggeringPush: 0, lastDelivered: 0, byDevice: {}, appByDevice: {} },
    screenByName: {},
    screenNamesCapped: false,
    sdkByDevice: {},
    appByDevice: {},
    tagCoverage: {},
    subscriptionLists: createSubscriptionListsAccumulator(),
    samples: createEventSampleCollector(),
    sources: { customEvents: {}, attributes: {}, tags: {} },
    sendAborted: { total: 0, byReason: {} },
    sendRejected: { total: 0, byReason: {} },
    emailFeedback: createEmailFeedbackAccumulator(),
    contactChange: createContactChangeAccumulator(),
    compliance: createComplianceAccumulator(),
    airshipTags: createAirshipTagsAccumulator(),
    airshipAttributes: createAirshipAttributesAccumulator(),
  };
}

function trackSource(acc, category, type, body, event) {
  const source = inferEventSource(type, body, event);
  inc(acc.sources[category], source);
}

function trackVersionByDevice(acc, dt, rawVersion, bucket, kpiCategory, attributeName, event) {
  if (!rawVersion || dt === "EMAIL") return;
  if (!bucket[dt]) bucket[dt] = { versions: {} };
  const ver = String(rawVersion);
  inc(bucket[dt].versions, ver);
  acc.samples.add(
    sampleKpiId(kpiCategory, dt, ver),
    `${attributeName} ${ver} on ${dt}`,
    event,
    {
      description: `Device attributes.${attributeName}=${ver}`,
      deviceType: dt,
      illustrative: true,
    },
  );
}

function trackAppSdkPair(acc, dt, event) {
  const appVer = event.device?.attributes?.app_version;
  const sdkVer = event.device?.attributes?.ua_sdk_version;
  if (!appVer || !sdkVer || dt === "EMAIL") return;
  if (!acc.appByDevice[dt]) acc.appByDevice[dt] = { versions: {}, sdkByAppVersion: {} };
  const bucket = acc.appByDevice[dt];
  if (!bucket.sdkByAppVersion) bucket.sdkByAppVersion = {};
  const appKey = String(appVer);
  if (!bucket.sdkByAppVersion[appKey]) bucket.sdkByAppVersion[appKey] = {};
  inc(bucket.sdkByAppVersion[appKey], String(sdkVer));
}

/** Track app + SDK version on OPEN events only (for tagging-plan OPEN breakdown). */
function trackOpenAppVersion(openAcc, dt, event) {
  const appVer = event.device?.attributes?.app_version;
  if (!appVer || dt === "EMAIL") return;
  if (!openAcc.appByDevice[dt]) openAcc.appByDevice[dt] = { versions: {}, sdkByAppVersion: {} };
  const bucket = openAcc.appByDevice[dt];
  inc(bucket.versions, String(appVer));
  const sdkVer = event.device?.attributes?.ua_sdk_version;
  if (!sdkVer) return;
  if (!bucket.sdkByAppVersion) bucket.sdkByAppVersion = {};
  const appKey = String(appVer);
  if (!bucket.sdkByAppVersion[appKey]) bucket.sdkByAppVersion[appKey] = {};
  inc(bucket.sdkByAppVersion[appKey], String(sdkVer));
}

function trackAttributeOp(acc, op, dt, source, event) {
  if (isAirshipAutoAttributeKey(op.key)) {
    processAirshipAttributeOp(acc.airshipAttributes, op, dt, source, event, acc.samples);
    return;
  }

  const normalized = normalizeAttrKey(op.key);
  if (!normalized) return;

  let row = acc.attributeKeys[normalized];
  if (!row) {
    if (Object.keys(acc.attributeKeys).length >= MAX_ATTRIBUTE_KEYS) {
      acc.attributeKeysCapped = true;
      return;
    }
    row = {
      count: 0,
      actions: {},
      keyVariants: {},
      byDevice: {},
      sources: { API: 0, SDK: 0, UNKNOWN: 0 },
    };
    acc.attributeKeys[normalized] = row;
  }

  const variantCountBefore = Object.keys(row.keyVariants).length;
  row.count += 1;
  inc(row.actions, op.action);
  inc(row.keyVariants, op.key);
  inc(row.sources, source);
  trackAppVersionCoverage(row, dt, event.device?.attributes?.app_version, event.processed ?? null);

  if (!row.byDevice[dt]) {
    row.byDevice[dt] = {
      count: 0,
      keyVariants: new Set(),
      valueFingerprints: new Set(),
      sampleValues: new Set(),
    };
  }
  const dev = row.byDevice[dt];
  dev.count += 1;
  dev.keyVariants.add(op.key);
  const fp = valueFingerprint(op.value, op.type);
  if (op.value !== undefined && op.value !== null && dev.sampleValues.size < 4) {
    dev.sampleValues.add(String(op.value).slice(0, 80));
    dev.valueFingerprints.add(fp);
  }

  const { samples } = acc;
  samples.add(
    sampleKpiId("attr", "key", normalized, dt),
    `Attribute key: ${op.key} on ${dt}`,
    event,
    {
      description: `ATTRIBUTE_OPERATION on key "${op.key}" (normalized: ${normalized})`,
      deviceType: dt,
      illustrative: true,
    },
  );
  if (op.key !== normalized || variantCountBefore > 0) {
    samples.add(
      sampleKpiId("attr", "case", normalized),
      `Attribute key case variant: ${op.key}`,
      event,
      {
        note: `key="${op.key}", normalized="${normalized}", device=${dt}`,
        deviceType: dt,
        illustrative: true,
      },
    );
  }
  if (op.value !== undefined && op.value !== null && op.action !== "remove") {
    trackAttributeValue(row, op.value, dt);
    trackAttributeJsonProperties(row, op.value, op.type, dt);
  }

  if (op.value !== undefined && op.value !== null) {
    samples.add(
      sampleKpiId("attr", "value", normalized, dt),
      `Attribute value on ${dt}: ${op.key}`,
      event,
      {
        note: `fingerprint=${fp}, value=${String(op.value).slice(0, 120)}`,
        deviceType: dt,
        countTowardDeviceQuota: false,
      },
    );
  }
}

function processAuditEvent(acc, event, timezone) {
  const type = String(event.type ?? "UNKNOWN").toUpperCase();
  const meta = registryMeta(type);
  const dt = auditDeviceType(event, type);

  if (!eventPassesAnalysisScope(event, dt, acc.analysisScope)) {
    return;
  }

  acc.total += 1;

  const channel = eventChannel(event);
  const namedUser = eventNamedUser(event);
  const body = event.body ?? {};
  const { samples } = acc;
  const appVer = event.device?.attributes?.app_version;
  const processedIso = event.processed ?? null;

  inc(acc.byDeviceType, dt);
  if (!acc.eventsByDeviceType[dt]) acc.eventsByDeviceType[dt] = {};
  inc(acc.eventsByDeviceType[dt], type);

  if (channel) acc.channels.add(channel);
  if (namedUser) acc.namedUsers.add(namedUser);

  trackVersionByDevice(
    acc,
    dt,
    event.device?.attributes?.ua_sdk_version,
    acc.sdkByDevice,
    "sdk",
    "ua_sdk_version",
    event,
  );
  trackVersionByDevice(
    acc,
    dt,
    event.device?.attributes?.app_version,
    acc.appByDevice,
    "app",
    "app_version",
    event,
  );
  trackAppSdkPair(acc, dt, event);

  if (type === "OPEN") {
    acc.open.total += 1;
    if (!acc.open.byDevice[dt]) {
      acc.open.byDevice[dt] = { total: 0, triggeringPush: 0, lastDelivered: 0 };
    }
    const openDevice = acc.open.byDevice[dt];
    openDevice.total += 1;
    const hasTrigger = body.triggering_push != null;
    const hasLast = body.last_delivered != null;
    if (hasTrigger) {
      acc.open.triggeringPush += 1;
      openDevice.triggeringPush += 1;
      samples.add(
        sampleKpiId("open", "triggering_push"),
        "OPEN with triggering_push",
        event,
        { description: OPEN_PUSH_FIELD_HELP.triggering_push, deviceType: dt, illustrative: true },
      );
    }
    if (hasLast) {
      acc.open.lastDelivered += 1;
      openDevice.lastDelivered += 1;
      samples.add(
        sampleKpiId("open", "last_delivered"),
        "OPEN with last_delivered",
        event,
        { description: OPEN_PUSH_FIELD_HELP.last_delivered, deviceType: dt, illustrative: true },
      );
    }
    trackOpenAppVersion(acc.open, dt, event);
  }

  if (type === "SCREEN_VIEWED") {
    const screenName = extractScreenName(body);
    if (!acc.screenByName[screenName]) {
      if (Object.keys(acc.screenByName).length >= MAX_SCREEN_NAMES) {
        acc.screenNamesCapped = true;
      } else {
        acc.screenByName[screenName] = { count: 0, byDevice: {} };
      }
    }
    const screenBucket = acc.screenByName[screenName];
    if (screenBucket) {
      screenBucket.count += 1;
      inc(screenBucket.byDevice, dt);
      trackAppVersionCoverage(screenBucket, dt, appVer, processedIso);
      samples.add(
        sampleKpiId("screen", screenName, dt),
        `SCREEN_VIEWED: ${screenName} on ${dt}`,
        event,
        { note: `device_type=${dt}`, deviceType: dt, illustrative: true },
      );
    }
  }

  if (type === "CUSTOM") {
    const name = body.name || "(unnamed)";

    if (isEmailFeedbackCustomEvent(event)) {
      const emailName = normalizeEmailCustomName(name);
      processEmailFeedbackCustomEvent(acc.emailFeedback, event, dt);
      samples.add(
        sampleKpiId("email_custom", emailName, dt),
        `Email feedback: ${emailName} on ${dt}`,
        event,
        { description: `CUSTOM on EMAIL channel — ${emailName}`, deviceType: dt, illustrative: true },
      );
      for (const prop of extractCustomPropertyKeys(body)) {
        samples.add(
          sampleKpiId("email_custom", "prop", emailName, dt, prop),
          `Email ${emailName}: property "${prop}" on ${dt}`,
          event,
          { deviceType: dt, countTowardDeviceQuota: false },
        );
      }
    } else if (isMessagingInteractionCustomEvent(name)) {
      // In-app message button taps — not product custom events.
    } else {
      const customSource = resolveCustomEventSource(body, event, dt);
      const bucket = getCustomEventBucket(acc, customSource, name);
      if (bucket) {
        inc(acc.sources.customEvents, normalizeCustomSourceKey(customSource));
        bucket.count += 1;
        inc(bucket.byDevice, dt);
        trackAppVersionCoverage(bucket, dt, appVer, processedIso);
        const sourceKey = normalizeCustomSourceKey(customSource);
        samples.add(
          sampleKpiId("custom", sourceKey, name, dt),
          `CUSTOM (${sourceKey}): ${name} on ${dt}`,
          event,
          {
            note: `device_type=${dt}, body.source=${body.source ?? "—"}`,
            deviceType: dt,
            illustrative: true,
          },
        );

        const customProps = body?.properties;
        for (const prop of extractCustomPropertyKeys(body)) {
          if (sourceKey === "SDK") {
            addToSetMap(bucket.propertiesByDevice, dt, prop);
            samples.add(
              sampleKpiId("custom", "prop", sourceKey, name, dt, prop),
              `CUSTOM ${name} (SDK): property "${prop}" on ${dt}`,
              event,
              {
                note: `property only present on ${dt} in this sample`,
                deviceType: dt,
                illustrative: true,
              },
            );
          }
          if (customProps && typeof customProps === "object" && !Array.isArray(customProps)) {
            trackCustomPropertyValue(bucket, prop, customProps[prop], dt);
          }
        }

        if (body.value !== undefined && body.value !== null) {
          trackCustomPropertyValue(bucket, "value", body.value, dt);
          if (bucket.sampleValues.size < 5) {
            bucket.sampleValues.add(String(body.value));
          }
        }
      }
    }
  }

  if (type === "ATTRIBUTE_OPERATION") {
    const source = inferEventSource(type, body, event);
    trackSource(acc, "attributes", type, body, event);
    samples.add(
      sampleKpiId("sources", "attributes", source),
      `Attributes from ${source}`,
      event,
      { note: "ATTRIBUTE_OPERATION", deviceType: dt, countTowardDeviceQuota: false },
    );
    for (const op of extractAttributeOpsDetailed(body)) {
      trackAttributeOp(acc, op, dt, source, event);
    }
  }

  if (type === "TAG_CHANGE") {
    const tagSource = inferEventSource(type, body, event);
    trackSource(acc, "tags", type, body, event);
    samples.add(
      sampleKpiId("sources", "tags", tagSource),
      `Tag changes from ${tagSource}`,
      event,
      { note: "TAG_CHANGE", deviceType: dt, countTowardDeviceQuota: false },
    );
    const { added, removed } = extractTagChanges(body);
    for (const tag of added) {
      if (isAirshipAutoTag(tag)) {
        processAirshipAutoTag(acc.airshipTags, tag, "added");
        samples.add(
          sampleKpiId("airship_tags", "added", tagGroupKey(tag)),
          `Airship auto tag added: ${tag}`,
          event,
          { note: "ua_* tag — auto-managed by Airship", deviceType: dt, countTowardDeviceQuota: false },
        );
      } else {
        if (
          inc(acc.tagsAdded, tag, 1, {
            maxKeys: MAX_TAG_KEYS,
            onCapped: () => {
              acc.tagsCapped = true;
            },
          })
        ) {
          samples.add(sampleKpiId("tags", "added", tag, dt), `Tag added: ${tag} on ${dt}`, event, {
            deviceType: dt,
            countTowardDeviceQuota: false,
          });
        }
        if (!acc.tagCoverage[tag]) acc.tagCoverage[tag] = {};
        trackAppVersionCoverage(acc.tagCoverage[tag], dt, appVer, processedIso);
      }
    }
    for (const tag of removed) {
      if (isAirshipAutoTag(tag)) {
        processAirshipAutoTag(acc.airshipTags, tag, "removed");
        samples.add(
          sampleKpiId("airship_tags", "removed", tagGroupKey(tag)),
          `Airship auto tag removed: ${tag}`,
          event,
          { note: "ua_* tag — auto-managed by Airship", deviceType: dt, countTowardDeviceQuota: false },
        );
      } else {
        if (
          inc(acc.tagsRemoved, tag, 1, {
            maxKeys: MAX_TAG_KEYS,
            onCapped: () => {
              acc.tagsCapped = true;
            },
          })
        ) {
          samples.add(sampleKpiId("tags", "removed", tag, dt), `Tag removed: ${tag} on ${dt}`, event, {
            deviceType: dt,
            countTowardDeviceQuota: false,
          });
        }
        if (!acc.tagCoverage[tag]) acc.tagCoverage[tag] = {};
        trackAppVersionCoverage(acc.tagCoverage[tag], dt, appVer, processedIso);
      }
    }
  }

  if (type === "SUBSCRIPTION_LIST") {
    processSubscriptionListEvent(acc.subscriptionLists, event, dt, body, samples);
  }

  if (type === "CONTACT_CHANGE") {
    processContactChangeEvent(acc, event, dt, body, samples);
  }

  if (type === "COMPLIANCE") {
    processComplianceEvent(acc, event, dt, body, samples);
  }

  if (type === "SEND_ABORTED") {
    acc.sendAborted.total += 1;
    const reason = String(body.reason || body.status || body.error_code || body.error || "unknown");
    inc(acc.sendAborted.byReason, reason);
    samples.add(
      sampleKpiId("messaging", "send_aborted", reason),
      `SEND_ABORTED: ${reason}`,
      event,
      { deviceType: dt, illustrative: true },
    );
  }

  if (type === "SEND_REJECTED") {
    acc.sendRejected.total += 1;
    const reason = String(body.reason || body.status || body.error_code || body.error || "unknown");
    inc(acc.sendRejected.byReason, reason);
    samples.add(
      sampleKpiId("messaging", "send_rejected", reason),
      `SEND_REJECTED: ${reason}`,
      event,
      { deviceType: dt, illustrative: true },
    );
  }

  if (event.occurred) {
    const t = new Date(event.occurred).getTime();
    if (!Number.isNaN(t)) {
      if (acc.minOccurred === null || t < acc.minOccurred) acc.minOccurred = t;
      if (acc.maxOccurred === null || t > acc.maxOccurred) acc.maxOccurred = t;
    }
  }

  if (event.processed) {
    const t = new Date(event.processed).getTime();
    if (!Number.isNaN(t)) {
      if (acc.minProcessed === null || t < acc.minProcessed) acc.minProcessed = t;
      if (acc.maxProcessed === null || t > acc.maxProcessed) acc.maxProcessed = t;
    }
  }

  samples.add(
    sampleKpiId("by_device", dt),
    `Events on device_type ${dt}`,
    event,
    {
      description: `Sample ${type} event for platform ${dt}`,
      deviceType: dt,
      countTowardDeviceQuota: false,
    },
  );
}

function resolveProcessedRange(auditContext, acc) {
  const fromDownload =
    auditContext?.downloadOldestProcessed && auditContext?.downloadNewestProcessed
      ? buildProcessedRange(auditContext.downloadOldestProcessed, auditContext.downloadNewestProcessed)
      : null;
  if (fromDownload) return { ...fromDownload, source: "download" };

  if (acc.minProcessed !== null && acc.maxProcessed !== null) {
    const fromFile = buildProcessedRange(
      new Date(acc.minProcessed).toISOString(),
      new Date(acc.maxProcessed).toISOString(),
    );
    if (fromFile) return { ...fromFile, source: "analyzed" };
  }
  return null;
}

function buildQueryContext(auditContext, acc) {
  const request = auditContext?.request ?? null;
  const filter = request?.filters?.[0] ?? {};
  const deviceTypesExcludedFromRequest = excludedDeviceTypesFromFilter(filter);
  const latencyMs =
    filter.latency != null ? filter.latency : auditContext?.windowMs != null ? auditContext.windowMs : null;
  const processedRange = resolveProcessedRange(auditContext, acc);
  return {
    streamMode: auditContext?.streamMode ?? null,
    streamModeLabel: AUDIT_STREAM_MODES[auditContext?.streamMode]?.label ?? auditContext?.streamMode ?? null,
    windowMs: auditContext?.windowMs ?? null,
    windowLabel: auditContext?.windowLabel ?? null,
    rtdsStart: request?.start ?? null,
    latencyMs,
    typesRequested: auditContext?.typesRequested ?? filter.types ?? null,
    typesRequestedCount: auditContext?.typesRequested?.length ?? filter.types?.length ?? null,
    deviceTypesRequested: filter.device_types ?? null,
    deviceTypesExcluded:
      deviceTypesExcludedFromRequest.length > 0
        ? deviceTypesExcludedFromRequest
        : auditContext?.excludedDeviceTypes?.length
          ? auditContext.excludedDeviceTypes
          : null,
    namedUserFilter: filter.users?.[0]?.named_user_id ?? null,
    channelFilter: filter.devices?.[0]?.channel ?? null,
    pushIdFilter: filter.notifications?.push_id ?? null,
    excludedEntitlements: auditContext?.excludedEntitlements ?? [],
    stoppedManually: auditContext?.stoppedManually ?? false,
    stoppedAtRequestTime: auditContext?.stoppedAtRequestTime ?? false,
    downloadElapsedLabel: auditContext?.downloadElapsedLabel ?? null,
    occurredRange:
      acc.minOccurred !== null && acc.maxOccurred !== null
        ? { from: new Date(acc.minOccurred).toISOString(), to: new Date(acc.maxOccurred).toISOString() }
        : null,
    processedRange,
    request,
  };
}

function finalizeReport(acc, options = {}) {
  const {
    profileName,
    timezone,
    windowMs,
    windowLabel,
    storageMeta,
    auditContext,
  } = options;

  const total = acc.total;
  const effectiveWindowLabel = auditContext?.windowLabel ?? windowLabel ?? "24 hours";
  const effectiveWindowMs = auditContext?.windowMs ?? windowMs ?? AUDIT_LATENCY_MS;

  const customEventPlatforms = expectedIosAndroidPlatforms(acc.byDeviceType);
  const customEventsReport = buildCustomEventsReport(acc.customBySource, {
    namesCapped: acc.customNamesCapped,
    expectedPlatforms: customEventPlatforms,
  });
  const emailFeedback = buildEmailFeedbackReport(acc.emailFeedback);
  const contactChange = buildContactChangeReport(acc.contactChange);
  const compliance = buildComplianceReport(acc.compliance);
  const screenViewed = buildScreenViewedInsights(acc.screenByName, {
    namesCapped: acc.screenNamesCapped,
  });
  const attributeDeviceTypesInSample = attributeExpectedDeviceTypes(acc.byDeviceType);
  const attributeInsights = buildAttributeInsights(acc.attributeKeys, {
    expectedDeviceTypes: attributeDeviceTypesInSample,
  });
  const messagingFailures = buildMessagingFailures(acc.sendAborted, acc.sendRejected);
  const sourceBreakdown = buildSourceBreakdown(acc.sources);
  const attachVersionSamples = (rows, kpiCategory) =>
    rows.map((row) => ({
      ...row,
      versions: row.versions.map((v) => ({
        ...v,
        sampleKpiId: sampleKpiId(kpiCategory, row.deviceType, v.version),
      })),
    }));
  const sdkVersions = attachVersionSamples(
    buildSdkVersionReport(acc.sdkByDevice, acc.byDeviceType),
    "sdk",
  );
  const appVersions = buildAppVersionReport(acc.appByDevice, acc.byDeviceType).map((row) => ({
    ...row,
    versions: row.versions.map((v) => ({
      ...v,
      sampleKpiId: sampleKpiId("app", row.deviceType, v.version),
    })),
  }));

  const openInsights = {
    ...buildOpenEventsReport(acc.open),
    byAppVersion: buildOpenAppVersionReport(acc.open),
    sampleKpiIds: {
      lastDelivered: sampleKpiId("open", "last_delivered"),
      triggeringPush: sampleKpiId("open", "triggering_push"),
    },
  };

  const channelsInfo = acc.channels.toJSON();
  const namedUsersInfo = acc.namedUsers.toJSON();

  const queryContext = buildQueryContext(auditContext, acc);
  const audienceTags = buildAudienceTagsReport(acc.tagsAdded, acc.tagsRemoved);
  const subscriptionLists = buildSubscriptionListsReport(acc.subscriptionLists, {
    expectedPlatforms: customEventPlatforms,
  });
  const platformBreakdown = buildByDeviceTypeReport(acc);

  const report = {
    meta: {
      profile: profileName,
      timezone,
      windowMs: effectiveWindowMs,
      windowLabel: effectiveWindowLabel,
      generatedAt: new Date().toISOString(),
      totalEvents: total,
      parseErrors: acc.parseErrors,
      processErrors: acc.processErrors,
      skippedLines: acc.parseErrors + acc.processErrors,
      lineErrorSamples: acc.lineErrorSamples,
      excludedGroups: [...AUDIT_EXCLUDED_GROUPS],
      processingMode: "stream-file",
      eventSampleStats: acc.samples.stats(),
      tagsCapped: acc.tagsCapped ?? false,
      attributeKeysCapped: acc.attributeKeysCapped ?? false,
      ...(auditContext?.analysisScope
        ? {
            analysisScope: auditContext.analysisScope,
            ...(auditContext.scopeId
              ? {
                  analysisKind: "scoped",
                  scopeId: auditContext.scopeId,
                }
              : { analysisKind: "baseline" }),
          }
        : { analysisKind: "baseline" }),
      occurredRange:
        acc.minOccurred !== null && acc.maxOccurred !== null
          ? { from: new Date(acc.minOccurred).toISOString(), to: new Date(acc.maxOccurred).toISOString() }
          : null,
      processedRange:
        acc.minProcessed !== null && acc.maxProcessed !== null
          ? { from: new Date(acc.minProcessed).toISOString(), to: new Date(acc.maxProcessed).toISOString() }
          : null,
      storage: storageMeta,
      queryContext,
    },
    byDeviceType: platformBreakdown.rows,
    platformBreakdown: {
      typesInSample: platformBreakdown.typesInSample,
      deviceTypesTotal: platformBreakdown.deviceTypesTotal,
      deviceTypesCapped: platformBreakdown.deviceTypesCapped,
    },
    openEvents: openInsights,
    screenViewed,
    emailFeedback,
    contactChange,
    compliance,
    sdkVersions,
    appVersions,
    dataSources: sourceBreakdown,
    customEvents: customEventsReport,
    attributes: {
      description:
        "Attribute keys from ATTRIBUTE_OPERATION events (excluding Airship auto ua_* keys).",
      totalOperations: Object.values(acc.attributeKeys).reduce((sum, row) => sum + row.count, 0),
      uniqueKeys: Object.keys(acc.attributeKeys).length,
      ...attributeInsights,
    },
    tags: audienceTags,
    subscriptionLists,
    messagingFailures,
    audience: {
      uniqueChannels: channelsInfo.count,
      uniqueChannelsIsLowerBound: channelsInfo.isLowerBound,
      uniqueNamedUsers: namedUsersInfo.count,
      uniqueNamedUsersIsLowerBound: namedUsersInfo.isLowerBound,
    },
    eventSamples: acc.samples.toArray(),
    _finalizeContext: {
      profileName,
      timezone,
      queryContext,
      total,
      byDeviceType: acc.byDeviceType,
      customEvents: customEventsReport,
      attributeKeys: acc.attributeKeys,
      customBySource: acc.customBySource,
      tagsReport: audienceTags,
      channels: channelsInfo.count,
      channelsIsLowerBound: channelsInfo.isLowerBound,
      namedUsers: namedUsersInfo.count,
      namedUsersIsLowerBound: namedUsersInfo.isLowerBound,
      customNamesCapped: acc.customNamesCapped,
      parseErrors: acc.parseErrors,
      processErrors: acc.processErrors,
      lineErrorSamples: acc.lineErrorSamples,
      open: openInsights,
      screenViewed,
      emailFeedback,
      contactChange,
      compliance,
      sendAborted: messagingFailures.sendAborted.total,
      sendRejected: messagingFailures.sendRejected.total,
    },
  };

  annotateReportObsolescence(report, acc);

  return report;
}

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Enrichment with granular progress events (yields patch objects for SSE).
 */
export async function* enrichAuditReportWithProgress(
  report,
  { releaseMaps: releaseMapsInput, filePath, totalLines = null, scopeId = null, skipBackfill = false } = {},
) {
  const ctx = report._finalizeContext;
  delete report._finalizeContext;
  const timezone = report.meta?.timezone ?? ctx?.timezone;
  const eventTotal =
    totalLines ?? report.meta?.storage?.rawFileLines ?? report.meta?.totalEvents ?? null;

  yield { phase: "enrich", step: "releases" };
  await yieldToEventLoop();
  const releaseMaps = releaseMapsInput ?? (await preloadReleaseMaps());

  yield { phase: "enrich", step: "sdk_versions" };
  await yieldToEventLoop();
  const [{ sdkVersions, sdkWarnings }, appVersions] = await Promise.all([
    enrichSdkVersionsReport(report.sdkVersions, { timezone, releaseMaps }),
    enrichAppVersionsReport(report.appVersions, { timezone, releaseMaps }),
  ]);

  report.sdkVersions = sdkVersions;
  report.sdkCrossPlatform = buildSdkCrossPlatformMajorSummary(report.sdkVersions);
  report.appVersions = appVersions;

  yield { phase: "enrich", step: "warnings" };
  await yieldToEventLoop();
  report.auditWarnings = collectAuditWarnings(report, sdkWarnings);

  if (filePath) {
    if (!scopeId && !skipBackfill) {
      yield { phase: "enrich", step: "backfill", linesProcessed: 0, totalLines: eventTotal };
      await yieldToEventLoop();
      const backfillStarted = Date.now();
      const backfillGen = backfillWarningEventSamplesWithProgress(filePath, report, {
        existingSamples: report.eventSamples,
        totalLines: eventTotal,
      });
      while (true) {
        const step = await backfillGen.next();
        if (step.done) {
          report.eventSamples = step.value;
          break;
        }
        yield {
          phase: "enrich",
          step: "backfill",
          linesProcessed: step.value.linesProcessed,
          totalLines: step.value.totalLines ?? eventTotal,
        };
        await yieldToEventLoop();
      }
      report.meta.backfillMs = Date.now() - backfillStarted;
    }

    yield { phase: "enrich", step: "sidecars" };
    await yieldToEventLoop();
    const attributeKeys = ctx?.attributeKeys;
    if (attributeKeys) {
      const sidecarName = persistAttributeValuesSidecar(filePath, attributeKeys, scopeId);
      if (sidecarName) {
        report.meta.storage = {
          ...(report.meta.storage ?? {}),
          attributeValuesFile: sidecarName,
        };
      }
    }

    const customBySource = ctx?.customBySource;
    if (customBySource) {
      const customSidecarName = persistCustomPropertyValuesSidecar(filePath, customBySource, scopeId);
      if (customSidecarName) {
        report.meta.storage = {
          ...(report.meta.storage ?? {}),
          customPropertyValuesFile: customSidecarName,
        };
      }
    }

    const eventSamplesSidecarName = persistEventSamplesSidecar(filePath, report.eventSamples, scopeId);
    if (eventSamplesSidecarName) {
      report.meta.storage = {
        ...(report.meta.storage ?? {}),
        eventSamplesFile: eventSamplesSidecarName,
        eventSamplesBucketCount: report.eventSamples?.length ?? 0,
      };
    }
  }

  yield { phase: "enrich", step: "summary" };
  await yieldToEventLoop();
  report.executiveSummary = buildExecutiveSummary(report);
  return report;
}

export async function enrichAuditReport(report, options = {}) {
  const gen = enrichAuditReportWithProgress(report, options);
  let result = report;
  while (true) {
    const step = await gen.next();
    if (step.done) {
      result = step.value;
      break;
    }
  }
  return result;
}

/**
 * Create an audit accumulator for live (analysis-only) streaming aggregation.
 */
export function createAuditAccumulator({ analysisScope = null } = {}) {
  return createAccumulator({ analysisScope });
}

/**
 * Ingest a single NDJSON line into an accumulator (parse + process + error capture).
 * Shared by the file-based analyzer and the analysis-only live path.
 */
/**
 * Parse + accumulate one NDJSON line. Returns the event's `offset` (or null) so
 * the streaming layer can track the resume offset from this single parse instead
 * of re-parsing the line via extractEventOffset (avoids a double JSON.parse on
 * the analysis-only hot path).
 */
export function ingestAuditLine(acc, trimmed, timezone = "Europe/Paris") {
  let event;
  try {
    event = JSON.parse(trimmed);
  } catch (jsonErr) {
    acc.parseErrors += 1;
    if (acc.lineErrorSamples.length < MAX_LINE_ERROR_SAMPLES) {
      const message = jsonErr?.message ?? String(jsonErr);
      const { preview, position, lineLength, range } = buildLineErrorPreview(trimmed, message);
      acc.lineErrorSamples.push({
        kind: "json",
        message,
        linePreview: preview,
        position,
        lineLength,
        previewRange: range,
      });
    }
    return null;
  }
  try {
    processAuditEvent(acc, event, timezone);
  } catch (procErr) {
    acc.processErrors += 1;
    if (acc.lineErrorSamples.length < MAX_LINE_ERROR_SAMPLES) {
      acc.lineErrorSamples.push({
        kind: "process",
        eventType: event?.type ?? null,
        message: procErr?.message ?? String(procErr),
      });
    }
  }
  return event?.offset ?? null;
}

/**
 * Finalize + enrich a report from an already-populated accumulator (analysis-only mode).
 * Yields progress patches; return value is the finalized report.
 * `filePath` is a synthetic stem used only to name the value sidecars (no raw NDJSON exists).
 */
export async function* finalizeAuditAccumulatorWithProgress(
  acc,
  {
    profileName,
    timezone = "Europe/Paris",
    windowMs,
    windowLabel,
    storageMeta,
    auditContext,
    filePath = null,
    skipBackfill = true,
  } = {},
) {
  yield { phase: "finalize" };
  await yieldToEventLoop();

  const report = finalizeReport(acc, {
    profileName,
    timezone,
    windowMs,
    windowLabel,
    storageMeta,
    auditContext,
  });

  const scannedTotal = storageMeta?.rawFileLines ?? acc.total;
  const enrichGen = enrichAuditReportWithProgress(report, {
    filePath,
    totalLines: scannedTotal,
    scopeId: auditContext?.scopeId ?? null,
    skipBackfill,
  });
  while (true) {
    const step = await enrichGen.next();
    if (step.done) {
      return step.value;
    }
    yield step.value;
    await yieldToEventLoop();
  }
}

/**
 * Single-pass streaming analysis from NDJSON file on disk.
 * Yields progress; return value is the finalized report.
 */
export async function* analyzeAuditEventsFromFile(
  filePath,
  {
    profileName,
    timezone = "Europe/Paris",
    windowMs,
    windowLabel,
    storageMeta,
    signal,
    auditContext,
  } = {},
) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(
      "Downloaded capture file is missing on disk. Stop the audit and try again, or check Stored files.",
    );
  }

  const acc = createAccumulator({
    analysisScope: auditContext?.analysisScope ?? null,
  });
  let lastProgress = 0;
  let lastProgressMs = Date.now();
  const analyzeStarted = Date.now();
  const totalLines = storageMeta?.rawFileLines ?? null;

  yield { phase: "analyze", linesProcessed: 0, totalLines };

  for await (const trimmed of iterateNdjsonLines(filePath, { signal })) {
    ingestAuditLine(acc, trimmed, timezone);

    const now = Date.now();
    if (
      acc.total - lastProgress >= ANALYZE_PROGRESS_INTERVAL ||
      now - lastProgressMs >= ANALYZE_PROGRESS_MS
    ) {
      lastProgress = acc.total;
      lastProgressMs = now;
      yield { phase: "analyze", linesProcessed: acc.total, totalLines: totalLines ?? acc.total };
      await yieldToEventLoop();
    }
  }

  const scannedTotal = totalLines ?? acc.total;
  yield {
    phase: "analyze",
    linesProcessed: acc.total,
    totalLines: scannedTotal,
    done: true,
    analyzeMs: Date.now() - analyzeStarted,
  };

  yield { phase: "finalize" };
  await yieldToEventLoop();

  const report = finalizeReport(acc, {
    profileName,
    timezone,
    windowMs,
    windowLabel,
    storageMeta,
    auditContext,
  });
  report.meta.analyzeMs = Date.now() - analyzeStarted;

  const enrichGen = enrichAuditReportWithProgress(report, {
    filePath,
    totalLines: scannedTotal,
    scopeId: auditContext?.scopeId ?? null,
  });
  while (true) {
    const step = await enrichGen.next();
    if (step.done) {
      return step.value;
    }
    yield step.value;
    await yieldToEventLoop();
  }
}

function formatSummaryInstant(iso, timezone) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone || "UTC",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatTypesPreview(types) {
  if (!types?.length) return null;
  if (types.length <= 6) return types.join(", ");
  return `${types.slice(0, 6).join(", ")} (+${types.length - 6} more)`;
}

function formatDeviceTypesFilter(qc) {
  if (qc.deviceTypesRequested?.length) {
    return qc.deviceTypesRequested.join(", ");
  }
  if (qc.deviceTypesExcluded?.length) {
    return `All except ${qc.deviceTypesExcluded.join(", ")} (RTDS JSON predicate)`;
  }
  return "All platforms (no device_types filter)";
}

function formatDeviceTypesInSample(byDeviceTypeRows, total) {
  const map = Object.fromEntries(
    adjustDeviceTypeRowsForExecutiveSummary(byDeviceTypeRows).map((row) => [row.deviceType, row.count]),
  );
  const rows = topEntries(map, 6);
  const adjustedTotal = Object.values(map).reduce((sum, n) => sum + n, 0) || total;
  if (!rows.length) return "Not observed in sample";
  return rows
    .map((row) => {
      const pct = adjustedTotal ? Math.round((row.count / adjustedTotal) * 100) : 0;
      return `${row.key} (${row.count.toLocaleString()}, ${pct}%)`;
    })
    .join("; ");
}

function buildRequestDetailsList({ profileName, queryContext: qc }) {
  const details = [{ label: "Project", value: profileName }];

  if (qc.streamModeLabel) {
    details.push({ label: "Stream mode", value: qc.streamModeLabel });
  }
  if (qc.rtdsStart) {
    details.push({ label: "RTDS start", value: qc.rtdsStart });
  }

  const typeCount = qc.typesRequestedCount ?? qc.typesRequested?.length ?? null;
  if (typeCount != null && qc.typesRequested?.length) {
    const preview = formatTypesPreview(qc.typesRequested);
    details.push({
      label: "Event types included",
      value: preview ?? `${typeCount} type(s)`,
    });
  } else if (typeCount != null) {
    details.push({ label: "Event types included", value: `${typeCount} type(s)` });
  }

  details.push({ label: "Device types (RTDS filter)", value: formatDeviceTypesFilter(qc) });

  if (qc.namedUserFilter) {
    details.push({ label: "Named user filter", value: qc.namedUserFilter });
  }
  if (qc.channelFilter) {
    details.push({ label: "Channel filter", value: qc.channelFilter });
  }
  if (qc.pushIdFilter) {
    details.push({ label: "Push ID filter", value: qc.pushIdFilter });
  }

  if (qc.stoppedManually) {
    details.push({
      label: "Download stop",
      value: qc.downloadElapsedLabel
        ? `Manual stop after ${qc.downloadElapsedLabel}`
        : "Manual stop",
    });
  } else if (qc.stoppedAtRequestTime) {
    details.push({
      label: "Download stop",
      value: "Automatic (processed time reached request launch)",
    });
  }

  return details;
}

function buildRequestOverviewParagraph({ profileName, queryContext: qc }) {
  const connectParts = [`This audit connected to project "${profileName}"`];
  if (qc.streamModeLabel) connectParts.push(`using ${qc.streamModeLabel}`);
  if (qc.rtdsStart) connectParts.push(`(RTDS start=${qc.rtdsStart})`);

  const typeCount = qc.typesRequestedCount ?? qc.typesRequested?.length;
  if (qc.typesRequested?.length) {
    const preview = formatTypesPreview(qc.typesRequested);
    connectParts.push(
      `with ${typeCount} RTDS event type(s) on the connect request: ${preview}`,
    );
  } else if (typeCount != null) {
    connectParts.push(`with ${typeCount} RTDS event type(s) on the connect request`);
  }

  let paragraph = `${connectParts.join(" ")}.`;
  paragraph += ` Device types on the request: ${formatDeviceTypesFilter(qc).toLowerCase()}.`;

  if (qc.namedUserFilter || qc.channelFilter || qc.pushIdFilter) {
    const audience = [];
    if (qc.namedUserFilter) audience.push(`named user ${qc.namedUserFilter}`);
    if (qc.channelFilter) audience.push(`channel ${qc.channelFilter}`);
    if (qc.pushIdFilter) audience.push(`push_id ${qc.pushIdFilter}`);
    paragraph += ` Audience filter: ${audience.join(", ")}.`;
  }

  if (qc.stoppedManually) {
    const elapsed = qc.downloadElapsedLabel ? ` after ${qc.downloadElapsedLabel}` : "";
    paragraph += ` The RTDS download was stopped manually${elapsed}; the NDJSON file was then analyzed.`;
  }

  return paragraph;
}

function buildSampleOverviewParagraph({ queryContext: qc, total, timezone, byDeviceTypeRows }) {
  const adjustedPlatforms = adjustDeviceTypeRowsForExecutiveSummary(byDeviceTypeRows);
  const deviceCount = adjustedPlatforms.length || Object.keys(qc.byDeviceType ?? {}).length;
  const lines = [
    `The analyzed file contains ${total.toLocaleString()} event(s) across ${deviceCount || "several"} device type(s) in the sample (timezone for dates below: ${timezone}).`,
    `Device types observed: ${formatDeviceTypesInSample(byDeviceTypeRows, total)}.`,
  ];

  if (qc.occurredRange) {
    const from = formatSummaryInstant(qc.occurredRange.from, timezone);
    const to = formatSummaryInstant(qc.occurredRange.to, timezone);
    const spanH = Math.round(
      (new Date(qc.occurredRange.to).getTime() - new Date(qc.occurredRange.from).getTime()) / 3_600_000,
    );
    lines.push(`Occurred timestamps span ${from} → ${to} (~${spanH} h).`);

  }

  if (qc.processedRange) {
    const procFrom = formatSummaryInstant(qc.processedRange.from, timezone);
    const procTo = formatSummaryInstant(qc.processedRange.to, timezone);
    const spanLabel = qc.processedRange.spanLabel ?? "—";
    if (qc.stoppedManually) {
      lines.push(
        `Processed timestamps in the download: ${procFrom} → ${procTo} (${spanLabel} between earliest and latest).`,
      );
    } else {
      lines.push(`Processed timestamps: ${procFrom} → ${procTo} (${spanLabel}).`);
    }
  }

  if (qc.streamMode === "latest_manual") {
    lines.push(
      "With LATEST + manual stop, counts reflect events received while connected until you clicked Stop.",
    );
  }
  if (qc.streamMode === "earliest_manual") {
    lines.push(
      "With EARLIEST + manual stop, sample depth depends on how long the stream ran before Stop (historical backlog first).",
    );
  }

  return lines;
}

function buildExecutiveSummaryFindings(ctx) {
  const findings = [];

  const skipped = (ctx.parseErrors ?? 0) + (ctx.processErrors ?? 0);
  if (skipped > 0) {
    const parts = [];
    if (ctx.parseErrors) parts.push(`${ctx.parseErrors.toLocaleString()} invalid JSON line(s)`);
    if (ctx.processErrors) parts.push(`${ctx.processErrors.toLocaleString()} event(s) failed during analysis`);
    const sampleHint = formatLineErrorSampleHint(ctx.lineErrorSamples);
    findings.push(`${skipped.toLocaleString()} NDJSON line(s) skipped (${parts.join("; ")}).${sampleHint}`);
  }
  const channelLabel = ctx.channelsIsLowerBound ? `at least ${ctx.channels.toLocaleString()}` : ctx.channels.toLocaleString();
  const userLabel = ctx.namedUsersIsLowerBound ? `at least ${ctx.namedUsers.toLocaleString()}` : ctx.namedUsers.toLocaleString();
  findings.push(`${channelLabel} unique channel(s) and ${userLabel} named user(s) contributed data.`);
  const adjustedPlatforms = adjustDeviceTypeRowsForExecutiveSummary(ctx.byDeviceTypeRows);
  const platformTotal = adjustedPlatforms.reduce((sum, row) => sum + row.count, 0);
  const topPlatform = adjustedPlatforms.sort((a, b) => b.count - a.count)[0];
  if (topPlatform && platformTotal > 0) {
    findings.push(
      `Strongest platform: ${topPlatform.deviceType} (${topPlatform.count.toLocaleString()} events, ${Math.round((topPlatform.count / platformTotal) * 100)}%).`,
    );
  }
  if (ctx.open?.total) {
    findings.push(
      `App opens: ${ctx.open.total.toLocaleString()} — ${ctx.open.withLastDelivered.toLocaleString()} with last_delivered (${ctx.open.pctLastDelivered}%), ${ctx.open.withTriggeringPush.toLocaleString()} with triggering_push (${ctx.open.pctTriggeringPush}%).`,
    );
  }
  if (ctx.screenViewed?.total) {
    const topScreen = ctx.screenViewed.top?.[0];
    findings.push(
      `Screen views: ${ctx.screenViewed.total.toLocaleString()} across ${ctx.screenViewed.uniqueScreens} screen name(s)${topScreen ? `, top "${topScreen.name}" (${topScreen.count.toLocaleString()})` : ""}.`,
    );
  }
  if (ctx.emailFeedback?.total) {
    findings.push(ctx.emailFeedback.summaryLines.join(" "));
  }
  if (ctx.contactChange?.total) {
    const visibleChangeTypes = filterContactChangeTypesForExecutiveSummary(
      ctx.contactChange.byChangeType,
    );
    const visibleContactTotal = visibleChangeTypes.reduce((sum, row) => sum + (row.count ?? 0), 0);
    if (visibleContactTotal > 0) {
      const topType = visibleChangeTypes[0];
      const topDevice = ctx.contactChange.byDeviceType?.[0];
      findings.push(
        `Contact changes: ${visibleContactTotal.toLocaleString()} event(s)${topType ? `, top change_type ${topType.changeType} (${topType.count.toLocaleString()})` : ""}${topDevice ? `, top device_type ${topDevice.deviceType} (${topDevice.count.toLocaleString()})` : ""}.`,
      );
    }
  }
  if (ctx.compliance?.total) {
    const topType = ctx.compliance.byEventType?.[0];
    const topDevice = ctx.compliance.byDeviceType?.[0];
    findings.push(
      `Compliance events: ${ctx.compliance.total.toLocaleString()} event(s)${topType ? `, top event_type ${topType.eventType} (${topType.count.toLocaleString()})` : ""}${topDevice ? `, top device_type ${topDevice.deviceType} (${topDevice.count.toLocaleString()})` : ""}.`,
    );
  }
  if (ctx.customEvents?.total) {
    const cap = ctx.customNamesCapped ? " (list capped)" : "";
    const parts = [];
    if (ctx.customEvents.sdk?.total) {
      const topSdk = ctx.customEvents.sdk.top?.[0];
      parts.push(
        `SDK ${ctx.customEvents.sdk.total.toLocaleString()} hit(s)${topSdk ? `, top "${topSdk.name}"` : ""}`,
      );
    }
    if (ctx.customEvents.api?.total) {
      const topApi = ctx.customEvents.api.top?.[0];
      parts.push(
        `API ${ctx.customEvents.api.total.toLocaleString()} hit(s)${topApi ? `, top "${topApi.name}"` : ""}`,
      );
    }
    findings.push(`Custom events (excl. email feedback)${cap}: ${parts.join("; ")}.`);
  }
  const attrKeys = ctx.attributeUniqueKeys ?? Object.keys(ctx.attributeKeys ?? {}).length;
  if (attrKeys) {
    findings.push(
      `Attributes (excl. ua_*): ${attrKeys} distinct key(s) in ATTRIBUTE_OPERATION events.`,
    );
  }
  const tagReport = ctx.tagsReport;
  if (tagReport?.totalChanges) {
    findings.push(
      `Tags (excl. ua_*): ${tagReport.totalAdded.toLocaleString()} added, ${tagReport.totalRemoved.toLocaleString()} removed across ${tagReport.uniqueGroups} group(s)${tagReport.recurringGroupCount ? ` (${tagReport.recurringGroupCount} with multiple tag values)` : ""}.`,
    );
  }
  if (ctx.sendAborted || ctx.sendRejected) {
    findings.push(
      `Messaging failures: ${ctx.sendAborted.toLocaleString()} SEND_ABORTED, ${ctx.sendRejected.toLocaleString()} SEND_REJECTED.`,
    );
  }
  return findings;
}

function reportToSummaryCtx(report) {
  const meta = report.meta ?? {};
  const qc = meta.queryContext ?? {};
  const byDeviceType = Object.fromEntries(
    (report.byDeviceType ?? []).map((row) => [row.deviceType ?? row.key, row.count ?? 0]),
  );

  return {
    profileName: meta.profile,
    timezone: meta.timezone,
    queryContext: { ...qc, byDeviceType },
    total: meta.totalEvents ?? 0,
    byDeviceType,
    byDeviceTypeRows: report.byDeviceType ?? [],
    parseErrors: meta.parseErrors ?? 0,
    processErrors: meta.processErrors ?? 0,
    lineErrorSamples: meta.lineErrorSamples ?? [],
    channels: report.audience?.uniqueChannels ?? 0,
    channelsIsLowerBound: report.audience?.uniqueChannelsIsLowerBound ?? false,
    namedUsers: report.audience?.uniqueNamedUsers ?? 0,
    namedUsersIsLowerBound: report.audience?.uniqueNamedUsersIsLowerBound ?? false,
    open: report.openEvents,
    screenViewed: report.screenViewed,
    emailFeedback: report.emailFeedback,
    contactChange: report.contactChange,
    compliance: report.compliance,
    customEvents: report.customEvents,
    customNamesCapped: report.customEvents?.namesCapped ?? false,
    attributeKeys: {},
    attributeUniqueKeys: report.attributes?.uniqueKeys ?? 0,
    tagsReport: report.tags,
    sendAborted: report.messagingFailures?.sendAborted?.total ?? 0,
    sendRejected: buildExecutiveSummarySendRejectedKpi(report).total,
    auditWarnings: report.auditWarnings ?? [],
  };
}

function buildExecutiveSummary(report) {
  const ctx = reportToSummaryCtx(report);
  const qc = ctx.queryContext;
  const auditWarnings = ctx.auditWarnings ?? [];

  const request = {
    paragraph: buildRequestOverviewParagraph({ profileName: ctx.profileName, queryContext: qc }),
    details: buildRequestDetailsList({ profileName: ctx.profileName, queryContext: qc }),
  };
  const sampleLines = buildSampleOverviewParagraph({
    queryContext: qc,
    total: ctx.total,
    timezone: ctx.timezone,
    byDeviceTypeRows: ctx.byDeviceTypeRows,
  });
  const sample = {
    lines: sampleLines,
    paragraph: sampleLines.join(" "),
  };
  const findings = buildExecutiveSummaryFindings(ctx);
  const kpis = buildExecutiveSummaryKpis(report);
  const text = [request.paragraph, sample.paragraph, ...findings].filter(Boolean).join("\n\n");

  return { request, sample, warnings: auditWarnings, findings, kpis, text };
}
