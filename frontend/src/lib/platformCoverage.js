import { formatAuditDeviceTypeLabel } from "./audit/auditDeviceTypes.js";

/** @param {{ presentOn?: string[], missingOn?: string[] }} warning */
export function getPlatformCoverageKey(warning) {
  const present = [...(warning?.presentOn ?? [])].sort().join(",");
  const missing = [...(warning?.missingOn ?? [])].sort().join(",");
  return `present:${present}|missing:${missing}`;
}

/** @param {{ presentOn?: string[], missingOn?: string[] }} warning */
export function formatPlatformCoverageLabel(warning) {
  const present = warning?.presentOn ?? [];
  const missing = warning?.missingOn ?? [];
  if (!present.length && !missing.length) {
    return "Unknown platform gap";
  }
  const presentLabel = present.map(formatAuditDeviceTypeLabel).join(", ");
  const missingLabel = missing.map(formatAuditDeviceTypeLabel).join(", ");
  if (present.length && missing.length) {
    return `Present on ${presentLabel} only — not on ${missingLabel}`;
  }
  if (present.length) {
    return `Present on ${presentLabel} only`;
  }
  return `Not on ${missingLabel}`;
}
