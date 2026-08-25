/** Parse ATTRIBUTE_OPERATION payload shapes (aligned with audit extractAttributeOpsDetailed). */

export function extractAttributeOpsDetailed(body) {
  const ops = [];
  const b = body ?? {};

  if (b.attribute) {
    ops.push({
      key: String(b.attribute),
      action: b.action || b.operation || "set",
      value: b.value,
      type: b.type,
    });
  }

  if (Array.isArray(b.attributes)) {
    for (const item of b.attributes) {
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

  if (b.set && typeof b.set === "object" && !Array.isArray(b.set)) {
    for (const [key, value] of Object.entries(b.set)) {
      ops.push({ key, action: "set", value, type: typeof value });
    }
  }

  if (Array.isArray(b.set)) {
    for (const item of b.set) {
      if (item?.key) {
        ops.push({ key: String(item.key), action: "set", value: item.value, type: item.type });
      }
    }
  }

  if (Array.isArray(b.remove)) {
    for (const item of b.remove) {
      if (item?.key) {
        ops.push({ key: String(item.key), action: "remove", value: undefined, type: item.type });
      }
    }
  }

  return ops;
}

export function eventAttributeOperations(event) {
  if (String(event?.type ?? "").toUpperCase() !== "ATTRIBUTE_OPERATION") return [];
  return extractAttributeOpsDetailed(event?.body);
}

export function formatAttributeValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function truncateAttributeText(text, max = 56) {
  if (!text) return text;
  const s = String(text);
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/** One-line label for stream tiles: `key=value` or `key (remove)`. */
export function attributeOpStreamLabel(op) {
  const action = String(op.action || "set").toLowerCase();
  const valueText = formatAttributeValue(op.value);
  if (action === "remove" || valueText == null) {
    return `${op.key} (${action})`;
  }
  return `${op.key}=${truncateAttributeText(valueText, 40)}`;
}
