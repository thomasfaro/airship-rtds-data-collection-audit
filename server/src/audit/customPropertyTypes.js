/**
 * The JSON type each custom-event property value arrived with.
 *
 * Airship matches a property against the type it was sent as: `"true"` in quotes is
 * text, and an In-App Automation trigger or a segment on the boolean `true` never
 * matches it. The values sidecar keeps labels only, where `true` and `"true"` are the
 * same string, so the type has to be recorded while the event is read.
 */

const TEXT_BOOLEAN = /^(true|false)$/i;
const TEXT_NUMBER = /^-?\d+(\.\d+)?$/;
const MAX_TYPE_WARNINGS = 25;
const MAX_EVENTS_LISTED = 4;

export const PROPERTY_KIND_LABELS = {
  boolean: "boolean",
  number: "number",
  string: "text",
  "text-boolean": 'text "true"/"false"',
  "text-number": "number in quotes",
  object: "object",
  array: "array",
};

/** `string` is split three ways because a quoted literal is the mistake worth naming. */
export function propertyValueKind(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") {
    const text = value.trim();
    if (TEXT_BOOLEAN.test(text)) return "text-boolean";
    if (TEXT_NUMBER.test(text)) return "text-number";
    return "string";
  }
  return typeof value;
}

export function jsonTypeOfKind(kind) {
  return kind === "text-boolean" || kind === "text-number" ? "string" : kind;
}

export function trackCustomPropertyType(bucket, property, value, deviceType) {
  const kind = propertyValueKind(value);
  if (!property || !kind) return;
  if (!bucket.propertyTypes) bucket.propertyTypes = {};
  const byDevice = (bucket.propertyTypes[property] ??= {});
  const kinds = (byDevice[String(deviceType ?? "UNKNOWN").toUpperCase()] ??= {});
  kinds[kind] = (kinds[kind] ?? 0) + 1;
}

export function mergeCustomPropertyTypes(target, source) {
  for (const [property, byDevice] of Object.entries(source?.propertyTypes ?? {})) {
    if (!target.propertyTypes) target.propertyTypes = {};
    const targetByDevice = (target.propertyTypes[property] ??= {});
    for (const [deviceType, kinds] of Object.entries(byDevice)) {
      const targetKinds = (targetByDevice[deviceType] ??= {});
      for (const [kind, count] of Object.entries(kinds)) {
        targetKinds[kind] = (targetKinds[kind] ?? 0) + count;
      }
    }
  }
}

function sortedCounts(counts) {
  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  );
}

/** One report row per property: the kinds it arrived as, overall and per device type. */
export function summarizePropertyTypes(propertyTypes) {
  return Object.entries(propertyTypes ?? {})
    .map(([property, byDevice]) => {
      const kinds = {};
      for (const deviceKinds of Object.values(byDevice)) {
        for (const [kind, count] of Object.entries(deviceKinds)) {
          kinds[kind] = (kinds[kind] ?? 0) + count;
        }
      }
      const devices = Object.keys(byDevice).sort();
      return {
        property,
        kinds: sortedCounts(kinds),
        byDevice: Object.fromEntries(devices.map((dt) => [dt, sortedCounts(byDevice[dt])])),
      };
    })
    .sort((a, b) => a.property.localeCompare(b.property));
}

function devicesWithKind(row, kind) {
  return Object.entries(row.byDevice ?? {})
    .filter(([, kinds]) => (kinds[kind] ?? 0) > 0)
    .map(([deviceType]) => deviceType)
    .sort();
}

/** Structured breakdown the workbook renders; most frequent kind first. */
function typeBreakdown(row) {
  return Object.entries(row.kinds ?? {}).map(([kind, count]) => ({
    kind,
    label: PROPERTY_KIND_LABELS[kind] ?? kind,
    count,
    deviceTypes: devicesWithKind(row, kind),
  }));
}

function describeBreakdown(types) {
  return types
    .map((t) => `${t.label} ×${t.count.toLocaleString("en-US")} on ${t.deviceTypes.join(", ")}`)
    .join("; ");
}

function customEventRows(customEvents) {
  const sections = [
    ["sdk", "SDK"],
    ["api", "API"],
    ["unknown", "Unknown source"],
  ];
  return sections.flatMap(([key, label]) =>
    (customEvents?.[key]?.top ?? []).map((row) => ({ row, source: row.source ?? key.toUpperCase(), label })),
  );
}

function inEventWarnings(rows) {
  const warnings = [];
  for (const { row, source, label } of rows) {
    for (const prop of row.propertyTypes ?? []) {
      const types = typeBreakdown(prop);
      const total = types.reduce((sum, t) => sum + t.count, 0);
      const textBoolean = types.find((t) => t.kind === "text-boolean");
      const jsonTypes = new Set(types.map((t) => jsonTypeOfKind(t.kind)));
      const base = { severity: "warning", name: row.name, key: prop.property, source, types };

      if (textBoolean) {
        warnings.push({
          ...base,
          category: "custom_property_text_boolean",
          message: `Custom event "${row.name}" (${label}): property "${prop.property}" is sent as the text "true"/"false", not a boolean — ${textBoolean.count.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} value(s), on ${textBoolean.deviceTypes.join(", ")}. A trigger or audience condition on the boolean true will not match it.`,
        });
      } else if (jsonTypes.size > 1) {
        warnings.push({
          ...base,
          category: "custom_property_type_mix",
          message: `Custom event "${row.name}" (${label}): property "${prop.property}" arrives with more than one JSON type — ${describeBreakdown(types)}. A condition written for one type will not match the others.`,
        });
      }
    }
  }
  return warnings;
}

function listEvents(names) {
  const shown = names.slice(0, MAX_EVENTS_LISTED).map((n) => `"${n}"`).join(", ");
  const more = names.length - MAX_EVENTS_LISTED;
  return more > 0 ? `${shown} (+${more} more)` : shown;
}

/**
 * The same property name typed differently by two events: what happens when a new
 * event is built to replace an old one, and triggers are copied across unchanged.
 * Only flagged when two events share no JSON type at all; an event that is itself
 * mixed is already reported above.
 */
function crossEventWarnings(rows) {
  const byProperty = new Map();
  for (const { row, source } of rows) {
    for (const prop of row.propertyTypes ?? []) {
      const kinds = Object.keys(prop.kinds ?? {});
      if (!kinds.length) continue;
      const entries = byProperty.get(prop.property) ?? [];
      entries.push({
        event: source === "SDK" ? row.name : `${row.name} (${source})`,
        jsonTypes: new Set(kinds.map(jsonTypeOfKind)),
        label: kinds.map((k) => PROPERTY_KIND_LABELS[k] ?? k).join(" / "),
      });
      byProperty.set(prop.property, entries);
    }
  }

  const warnings = [];
  for (const [property, entries] of [...byProperty.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const disjoint = entries.some((a, i) =>
      entries.slice(i + 1).some((b) => ![...a.jsonTypes].some((t) => b.jsonTypes.has(t))),
    );
    if (!disjoint) continue;

    const eventsByLabel = new Map();
    for (const entry of entries) {
      eventsByLabel.set(entry.label, [...(eventsByLabel.get(entry.label) ?? []), entry.event]);
    }
    const byEvent = [...eventsByLabel.entries()].map(([type, events]) => ({ type, events: events.sort() }));
    warnings.push({
      severity: "warning",
      category: "custom_property_type_conflict",
      name: property,
      key: property,
      byEvent,
      message: `Property "${property}" does not have the same JSON type in every custom event — ${byEvent.map((g) => `${g.type} in ${listEvents(g.events)}`).join("; ")}. A trigger or segment copied from one event to another will not match.`,
    });
  }
  return warnings;
}

export function buildCustomPropertyTypeWarnings(customEvents) {
  const rows = customEventRows(customEvents);
  return [
    ...inEventWarnings(rows).slice(0, MAX_TYPE_WARNINGS),
    ...crossEventWarnings(rows).slice(0, MAX_TYPE_WARNINGS),
  ];
}
