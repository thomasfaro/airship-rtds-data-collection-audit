/** RTDS JSON predicates for audit Connect filters (device.device_type). */

export function normalizeExcludedDeviceTypes(raw) {
  return [...new Set(
    (raw ?? [])
      .map((dt) => String(dt ?? "").trim().toUpperCase())
      .filter(Boolean),
  )].sort();
}

/**
 * Build a predicate that excludes events whose device.device_type matches any listed value.
 * @see agent-tools/skills/rtds/rtds-connection — predicates with `not` / `and`
 */
export function buildExcludedDeviceTypesPredicate(excludedDeviceTypes) {
  const excluded = normalizeExcludedDeviceTypes(excludedDeviceTypes);
  if (!excluded.length) return null;

  const equalsNot = (deviceType) => ({
    not: {
      scope: ["device"],
      key: "device_type",
      value: { equals: deviceType },
    },
  });

  if (excluded.length === 1) return equalsNot(excluded[0]);
  return { and: excluded.map(equalsNot) };
}

/** Read excluded types from an audit Connect filter for report metadata. */
export function excludedDeviceTypesFromFilter(filter) {
  const predicates = filter?.predicates;
  if (!Array.isArray(predicates) || !predicates.length) return [];

  const found = new Set();

  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.not?.scope?.join(".") === "device" && node.not?.key === "device_type") {
      const value = node.not?.value?.equals;
      if (value) found.add(String(value).toUpperCase());
      return;
    }
    if (Array.isArray(node.and)) {
      for (const child of node.and) walk(child);
    }
  }

  for (const root of predicates) walk(root);
  return [...found].sort();
}
