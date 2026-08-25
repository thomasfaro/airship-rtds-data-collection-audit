/** Display labels and filter catalog for audit `device.device_type` values. */

import { DEVICE_TYPES } from "../deviceTypes.js";

export const AUDIT_API_NAMED_USER_DEVICE_TYPE = "API_NAMED_USER_EVENTS";

/** RTDS Connect channels (uppercase payload values) + audit API bucket. */
export const AUDIT_DEVICE_TYPE_CATALOG = [
  ...DEVICE_TYPES.map((item) => item.value.toUpperCase()),
  AUDIT_API_NAMED_USER_DEVICE_TYPE,
];

/** Omitted from audit include/exclude filters (still counted in reports). */
export const AUDIT_DEVICE_TYPES_HIDDEN_FROM_FILTERS = new Set(["UNKNOWN"]);

const AUDIT_DEVICE_TYPE_LABELS = {
  [AUDIT_API_NAMED_USER_DEVICE_TYPE]: "API named user events",
};

const CUSTOM_EVENT_SOURCE_LABELS = {
  API: "Audience API",
  SDK: "SDK",
  UNKNOWN: "Unknown source",
};

function normalizeDeviceTypeRows(rows) {
  return (rows ?? [])
    .map((row) => {
      if (typeof row === "string") return { deviceType: row.toUpperCase(), count: null };
      return {
        deviceType: String(row.deviceType ?? row.key ?? "").toUpperCase(),
        count: row.count ?? null,
      };
    })
    .filter((row) => row.deviceType);
}

function isVisibleInAuditDeviceFilters(deviceType) {
  return !AUDIT_DEVICE_TYPES_HIDDEN_FROM_FILTERS.has(String(deviceType ?? "").toUpperCase());
}

/** Full catalog merged with counts from a report or stored-file preset scan. */
export function mergeAuditDeviceTypeOptions(observedRows) {
  const countByType = new Map();
  for (const row of normalizeDeviceTypeRows(observedRows)) {
    countByType.set(row.deviceType, row.count);
  }

  const catalog = AUDIT_DEVICE_TYPE_CATALOG.filter(isVisibleInAuditDeviceFilters);
  const extras = [...countByType.keys()]
    .filter((deviceType) => !catalog.includes(deviceType) && isVisibleInAuditDeviceFilters(deviceType))
    .sort((a, b) => a.localeCompare(b));

  return [...catalog, ...extras].map((deviceType) => ({
    deviceType,
    count: countByType.get(deviceType) ?? null,
  }));
}

export function formatAuditDeviceTypeLabel(deviceType) {
  const key = String(deviceType ?? "").toUpperCase();
  if (AUDIT_DEVICE_TYPE_LABELS[key]) return AUDIT_DEVICE_TYPE_LABELS[key];
  const fromRtds = DEVICE_TYPES.find((item) => item.value === key.toLowerCase());
  if (fromRtds) return fromRtds.label;
  return key || "—";
}

export function formatCustomEventSourceLabel(source) {
  const key = String(source ?? "").toUpperCase();
  return CUSTOM_EVENT_SOURCE_LABELS[key] ?? source ?? "—";
}
