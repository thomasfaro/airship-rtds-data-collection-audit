export const AUDIENCE_FILTER_FIELDS = [
  { key: "named_user", label: "Named user", placeholder: "thomasf" },
  { key: "channel", label: "Channel", placeholder: "channel UUID" },
  { key: "push_id", label: "Push ID", placeholder: "push UUID" },
  { key: "campaign_category", label: "Campaign category", placeholder: "spring_sale" },
  { key: "attribute_key", label: "Attribute key", placeholder: "firstName" },
];

export function splitAudienceValues(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinAudienceValues(values) {
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))].join(",");
}

export function addAudienceValue(currentCsv, nextValue) {
  const value = String(nextValue ?? "").trim();
  if (!value) return String(currentCsv ?? "");
  const values = splitAudienceValues(currentCsv);
  if (values.includes(value)) return joinAudienceValues(values);
  return joinAudienceValues([...values, value]);
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
