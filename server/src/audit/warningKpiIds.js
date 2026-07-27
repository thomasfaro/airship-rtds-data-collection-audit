/** Resolve KPI ids that should carry example events for a warning (server-side). */

import { kpiId } from "./eventSamples.js";
import { customEventSampleKpiIdsForRow } from "./customEventKpiIds.js";

function findCustomEventRow(report, name, sourceHint) {
  const keys = ["sdk", "api", "unknown"];
  for (const key of keys) {
    const row = report.customEvents?.[key]?.top?.find((r) => r.name === name);
    if (!row) continue;
    if (!sourceHint || row.source === sourceHint || key.toUpperCase() === String(sourceHint).toUpperCase()) {
      return row;
    }
  }
  return report.customEvents?.top?.find((r) => r.name === name) ?? null;
}

function findAttributeRow(report, normalized) {
  return report.attributes?.topKeys?.find((r) => (r.normalized ?? r.key) === normalized) ?? null;
}

export function resolveWarningKpiIds(warning, report) {
  if (warning?.kpiIds?.length) return [...new Set(warning.kpiIds)];
  const ids = [];
  const add = (id) => {
    if (id) ids.push(id);
  };
  const cat = warning?.category;
  if (!cat) return ids;

  if (cat === "custom_event_platform_mismatch" || cat === "custom_property_mismatch") {
    const row = findCustomEventRow(report, warning.name, warning.source);
    if (!row) return ids;
    for (const id of customEventSampleKpiIdsForRow(row)) add(id);
    if (cat === "custom_event_platform_mismatch") {
      (row.byDeviceBreakdown ?? []).filter((d) => d.count > 0).forEach((d) => add(d.sampleKpiId));
    } else {
      (row.propertyDiffKpis ?? [])
        .filter((k) => !warning.deviceA || k.device === warning.deviceA || k.device === warning.deviceB)
        .forEach((k) => add(k.kpiId));
      (row.byDeviceBreakdown ?? []).forEach((d) => add(d.sampleKpiId));
    }
    return [...new Set(ids)];
  }

  if (cat.startsWith("attribute_")) {
    const norm = warning.normalized ?? warning.key;
    const row = findAttributeRow(report, norm);
    if (cat === "attribute_case_mismatch") add(`attr.case.${norm}`);
    if (cat === "attribute_device_gap") {
      (row?.byDeviceBreakdown ?? []).filter((d) => d.count > 0).forEach((d) => add(d.sampleKpiId));
    }
    if (cat === "attribute_value_mismatch") {
      (row?.valueFormatDiff?.devices ?? []).forEach((d) => add(`attr.value.${norm}.${d.deviceType}`));
    }
    return [...new Set(ids)];
  }

  if (cat === "screen_platform_mismatch") {
    const row = report.screenViewed?.top?.find((r) => r.name === warning.screen);
    (row?.sampleKpiIds ?? (row?.sampleKpiId ? [row.sampleKpiId] : [])).forEach((id) => add(id));
    (row?.byDeviceBreakdown ?? []).filter((d) => d.count > 0).forEach((d) => add(d.sampleKpiId));
    return [...new Set(ids)];
  }

  if (cat === "open_triggering_push_platform_gap") {
    add(report.openEvents?.sampleKpiIds?.triggeringPush);
    add(report.openEvents?.sampleKpiIds?.lastDelivered);
    return [...new Set(ids)];
  }

  if (cat === "email_property_mismatch") {
    const row = (report.emailFeedback?.funnel ?? report.emailFeedback?.rows ?? []).find(
      (r) => r.name === warning.name,
    );
    add(row?.sampleKpiId);
    (warning.onlyOnA ?? []).forEach((prop) =>
      add(`email_custom.prop.${warning.name}.${warning.deviceA}.${prop}`),
    );
    (warning.onlyOnB ?? []).forEach((prop) =>
      add(`email_custom.prop.${warning.name}.${warning.deviceB}.${prop}`),
    );
    return [...new Set(ids)];
  }

  if (cat === "sdk_version_split") {
    const row = report.sdkVersions?.find((r) => r.deviceType === warning.deviceType);
    const byCount = [...(row?.versions ?? [])].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
    byCount.slice(0, 2).forEach((v) => add(v.sampleKpiId));
    return [...new Set(ids)];
  }

  if (cat === "sdk_major_cross_platform") {
    for (const row of report.sdkVersions ?? []) {
      const byCount = [...(row.versions ?? [])].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
      add(byCount[0]?.sampleKpiId);
    }
    return [...new Set(ids)];
  }

  if (cat === "sdk_stale" || cat === "sdk_release_unknown") {
    const row = report.sdkVersions?.find((r) => r.deviceType === warning.deviceType);
    const byCount = [...(row?.versions ?? [])].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
    add(byCount[0]?.sampleKpiId);
    return [...new Set(ids)];
  }

  return ids;
}

export function collectMessagingFailureSampleKpiIds(report) {
  const ids = [];
  for (const row of report.messagingFailures?.sendRejected?.byReason ?? []) {
    if ((row.count ?? 0) > 0) {
      ids.push(row.sampleKpiId ?? kpiId("messaging", "send_rejected", row.reason));
    }
  }
  for (const row of report.messagingFailures?.sendAborted?.byReason ?? []) {
    if ((row.count ?? 0) > 0) {
      ids.push(row.sampleKpiId ?? kpiId("messaging", "send_aborted", row.reason));
    }
  }
  return ids;
}

export function collectEmailFeedbackSampleKpiIds(report) {
  const ids = [];
  for (const row of report.emailFeedback?.funnel ?? report.emailFeedback?.rows ?? []) {
    if ((row.count ?? 0) > 0 && row.sampleKpiId) ids.push(row.sampleKpiId);
  }
  return ids;
}

export function collectAllWarningKpiIds(report) {
  const ids = new Set();
  for (const warning of report.auditWarnings ?? report.executiveSummary?.warnings ?? []) {
    if (typeof warning === "string") continue;
    for (const id of resolveWarningKpiIds(warning, report)) ids.add(id);
  }
  return [...ids];
}

/** KPI ids that should receive example events during the NDJSON backfill pass. */
export function collectBackfillSampleKpiIds(report) {
  const ids = new Set();
  for (const id of collectAllWarningKpiIds(report)) ids.add(id);
  for (const id of collectMessagingFailureSampleKpiIds(report)) ids.add(id);
  for (const id of collectEmailFeedbackSampleKpiIds(report)) ids.add(id);
  return [...ids];
}
