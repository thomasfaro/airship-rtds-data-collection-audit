/** Stable id for an executive-summary warning (false-positive toggles). */
export function getAuditWarningId(warning) {
  if (typeof warning === "string") {
    return `other|${warning}`;
  }
  if (!warning || typeof warning !== "object") {
    return "other|unknown";
  }

  const category = warning.category ?? "other";
  const parts = [category];

  switch (category) {
    case "custom_event_platform_mismatch":
    case "custom_property_mismatch":
      parts.push(warning.name, warning.source, warning.deviceA, warning.deviceB);
      break;
    case "email_property_mismatch":
      parts.push(
        warning.name,
        warning.deviceA,
        warning.deviceB,
        (warning.onlyOnA ?? []).join(","),
        (warning.onlyOnB ?? []).join(","),
      );
      break;
    case "attribute_case_mismatch":
    case "attribute_device_gap":
    case "attribute_value_mismatch":
      parts.push(warning.normalized ?? warning.key);
      break;
    case "screen_platform_mismatch":
      parts.push(warning.screen);
      break;
    case "sdk_major_cross_platform":
      parts.push(warning.iosVersion, warning.androidVersion);
      break;
    case "sdk_version_split":
    case "sdk_stale":
    case "sdk_release_unknown":
      parts.push(warning.deviceType);
      break;
    case "open_triggering_push_platform_gap":
      parts.push(String(warning.gapPct ?? ""));
      break;
    default:
      break;
  }

  parts.push(warning.message ?? "");
  return parts
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .join("|");
}
