/** Parse TAG_CHANGE payload shapes (aligned with audit expandTagEntries / extractTagChanges). */

function expandTagEntries(map) {
  if (!map || typeof map !== "object" || Array.isArray(map)) return [];
  const out = [];
  for (const [group, raw] of Object.entries(map)) {
    if (Array.isArray(raw)) {
      if (raw.length === 0) {
        out.push({ group, value: null, tag: group });
      } else {
        for (const item of raw) {
          const value = String(item);
          out.push({ group, value, tag: `${group}:${value}` });
        }
      }
    } else if (raw != null && typeof raw === "object") {
      continue;
    } else if (raw != null && raw !== "") {
      const value = String(raw);
      out.push({ group, value, tag: `${group}:${value}` });
    } else {
      out.push({ group, value: null, tag: group });
    }
  }
  return out;
}

function tagFromFlatEntry(entry) {
  const tag = String(entry);
  const colon = tag.indexOf(":");
  if (colon >= 0) {
    return { group: tag.slice(0, colon), value: tag.slice(colon + 1), tag };
  }
  return { group: tag, value: null, tag };
}

export function extractTagChangeOps(body) {
  const ops = [];
  const b = body ?? {};

  const pushEntries = (action, entries) => {
    for (const entry of entries) {
      ops.push({ action, ...entry });
    }
  };

  if (Array.isArray(b.added)) {
    for (const item of b.added) {
      pushEntries("set", [tagFromFlatEntry(item)]);
    }
  }
  if (Array.isArray(b.removed)) {
    for (const item of b.removed) {
      pushEntries("remove", [tagFromFlatEntry(item)]);
    }
  }

  pushEntries("set", expandTagEntries(b.add));
  pushEntries("remove", expandTagEntries(b.remove));

  return ops;
}

export function eventTagChangeOps(event) {
  if (String(event?.type ?? "").toUpperCase() !== "TAG_CHANGE") return [];
  return extractTagChangeOps(event?.body);
}

export function truncateTagText(text, max = 48) {
  if (!text) return text;
  const s = String(text);
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/** One-line label for stream tiles: `tag (set)` or `tag (remove)`. */
export function tagChangeStreamLabel(op) {
  const action = String(op.action || "set").toLowerCase();
  return `${truncateTagText(op.tag, 40)} (${action})`;
}
