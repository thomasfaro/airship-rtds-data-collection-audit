import { apiFetch } from "./apiClient.js";
import { expectOk } from "./parseJsonResponse.js";

function valuesQuery(params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    query.set(key, String(value));
  }
  return query.toString();
}

/** Value histogram for one attribute key, paginated. */
export async function fetchAttributeValuesPage({ name, key, offset = 0, limit = 50 } = {}) {
  const response = await apiFetch(`/api/values/attributes?${valuesQuery({ name, key, offset, limit })}`);
  return expectOk(response, "load attribute values");
}

/** Value histogram for one JSON property nested inside an attribute. */
export async function fetchAttributeJsonPropertyValuesPage({
  name,
  key,
  property,
  offset = 0,
  limit = 50,
} = {}) {
  const response = await apiFetch(
    `/api/values/attribute-json-properties?${valuesQuery({ name, key, property, offset, limit })}`,
  );
  return expectOk(response, "load attribute JSON property values");
}

/** Value histogram for one custom event property. */
export async function fetchCustomPropertyValuesPage({
  name,
  source,
  event,
  property,
  offset = 0,
  limit = 50,
} = {}) {
  const response = await apiFetch(
    `/api/values/custom-properties?${valuesQuery({ name, source, event, property, offset, limit })}`,
  );
  return expectOk(response, "load custom property values");
}

export async function fetchEventSamples({ name } = {}) {
  const response = await apiFetch(`/api/values/event-samples?${valuesQuery({ name })}`);
  return expectOk(response, "load event samples");
}
