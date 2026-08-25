/** Contact change types omitted from executive summary findings. */

import { normalizeSendRejectedReasonKey } from "./sendRejectedReasons.js";

export const EXEC_SUMMARY_HIDDEN_CONTACT_CHANGE_TYPES = new Set(["UNINSTALL"]);

export function isHiddenExecutiveSummaryContactChangeType(changeType) {
  return EXEC_SUMMARY_HIDDEN_CONTACT_CHANGE_TYPES.has(String(changeType ?? "").toUpperCase());
}

/** SEND_REJECTED status values omitted from executive summary KPIs / findings. */
export function isHiddenExecutiveSummarySendRejectedReason(reason) {
  const key = normalizeSendRejectedReasonKey(reason);
  return key.includes("uninstalled");
}

/** Only unregistered rejections raise a critical alert in the executive summary. */
export function isCriticalExecutiveSummarySendRejectedReason(reason) {
  const key = normalizeSendRejectedReasonKey(reason);
  return key.includes("unregistered");
}

export function filterSendRejectedReasonsForExecutiveSummary(byReasonRows) {
  return [...(byReasonRows ?? [])].filter(
    (row) => !isHiddenExecutiveSummarySendRejectedReason(row.reason),
  );
}

/** Device_type rows for executive summary KPIs / sample overview. */
export function adjustDeviceTypeRowsForExecutiveSummary(byDeviceTypeRows) {
  return (byDeviceTypeRows ?? [])
    .map((row) => ({
      deviceType: row.deviceType ?? row.key,
      count: row.count ?? 0,
    }))
    .filter((row) => row.count > 0);
}

export function filterContactChangeTypesForExecutiveSummary(byChangeType) {
  return [...(byChangeType ?? [])]
    .filter((row) => !isHiddenExecutiveSummaryContactChangeType(row.changeType))
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
}
