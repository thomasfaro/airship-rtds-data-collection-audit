/**
 * `spaceSeparable` fields hold UUIDs, so a space in a pasted value can only be a separator.
 * The others are free text — a named user really can be called "VIP Customer".
 */
export const AUDIENCE_FILTER_FIELDS = [
  { key: "named_user", label: "Named user", placeholder: "thomasf" },
  { key: "channel", label: "Channel", placeholder: "channel UUID", spaceSeparable: true },
  { key: "push_id", label: "Push ID", placeholder: "push UUID", spaceSeparable: true },
  { key: "campaign_category", label: "Campaign category", placeholder: "spring_sale" },
  { key: "attribute_key", label: "Attribute key", placeholder: "firstName" },
];

const DRAFT_SEPARATORS = /[,;\n\r\t]+/;
const DRAFT_SEPARATORS_WITH_SPACE = /[\s,;]+/;

export function splitAudienceValues(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Split one field entry into the values the user meant. Pasting a list is the normal way to
 * enter several IDs, and the separator comes from wherever it was copied — so a single entry
 * has to be able to yield several values, or the whole list lands in one unmatchable filter.
 */
export function parseAudienceInput(input, { spaceSeparable = false } = {}) {
  return String(input ?? "")
    .split(spaceSeparable ? DRAFT_SEPARATORS_WITH_SPACE : DRAFT_SEPARATORS)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinAudienceValues(values) {
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))].join(",");
}

export function addAudienceValues(currentCsv, nextValues) {
  const values = Array.isArray(nextValues) ? nextValues : [nextValues];
  if (!values.length) return String(currentCsv ?? "");
  return joinAudienceValues([...splitAudienceValues(currentCsv), ...values]);
}

export function removeAudienceValue(currentCsv, valueToRemove) {
  return joinAudienceValues(splitAudienceValues(currentCsv).filter((value) => value !== valueToRemove));
}

export function hasAudienceFilters(filters) {
  return AUDIENCE_FILTER_FIELDS.some(({ key }) => splitAudienceValues(filters[key]).length > 0);
}

export function hasAttributeKeys(filters) {
  return splitAudienceValues(filters.attribute_key).length > 0;
}
