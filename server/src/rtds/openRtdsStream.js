import { CONNECT_URLS } from "../config.js";
import {
  filterEntitledTypes,
  isUnentitledTypesError,
  parseUnentitledTypes,
} from "../audit/rtdsEntitlements.js";

const MAX_ENTITLEMENT_RETRIES = 12;

function rtdsHeaders(profile) {
  return {
    Accept: "application/vnd.urbanairship+x-ndjson; version=3;",
    // NDJSON is highly compressible; undici decompresses transparently so the
    // downstream reader still receives plain NDJSON. Reduces bytes on the wire.
    "Accept-Encoding": "gzip, deflate, br",
    "Content-Type": "application/json",
    Authorization: profile.token,
    "X-UA-Appkey": profile.app_key,
  };
}

function getFilterTypes(body) {
  if (!body?.filters?.length) return null;
  const types = body.filters.flatMap((filter) => filter.types ?? []);
  return types.length ? [...new Set(types)] : null;
}

function setFilterTypes(body, types) {
  if (!body.filters?.length) {
    body.filters = [{ types }];
    return;
  }
  for (const filter of body.filters) {
    if (!Array.isArray(filter.types)) continue;
    const attributeOnly =
      filter.types.length === 1 && filter.types[0] === "ATTRIBUTE_OPERATION";
    if (attributeOnly) continue;
    filter.types = types;
  }
}

/**
 * Open an RTDS NDJSON stream, retrying without event types the token is not entitled to.
 * When body.filters[0].types is omitted, entitlement negotiation is skipped on 403.
 */
export async function openRtdsNdjsonStream(profile, body, { signal } = {}) {
  const url = CONNECT_URLS[profile.region];
  if (!url) {
    throw new Error(`Unsupported region: ${profile.region}`);
  }

  const requestBody = JSON.parse(JSON.stringify(body));
  let types = getFilterTypes(requestBody);
  const excludedEntitlements = [];

  for (let attempt = 0; attempt <= MAX_ENTITLEMENT_RETRIES; attempt += 1) {
    if (types) {
      setFilterTypes(requestBody, types);
    }

    const response = await fetch(url, {
      method: "POST",
      headers: rtdsHeaders(profile),
      body: JSON.stringify(requestBody),
      signal,
    });

    if (response.ok) {
      return {
        response,
        request: requestBody,
        types: types ?? getFilterTypes(requestBody),
        excludedEntitlements: [...new Set(excludedEntitlements)].sort(),
      };
    }

    const detail = await response.text();

    if (types && isUnentitledTypesError(response.status, detail)) {
      const denied = parseUnentitledTypes(detail);
      if (!denied.length) {
        throw new Error(`RTDS HTTP 403: ${detail.slice(0, 500)}`);
      }
      excludedEntitlements.push(...denied);
      types = filterEntitledTypes(types, denied);
      if (types.length === 0) {
        const excluded = [...new Set(excludedEntitlements)].sort();
        const error = new Error(
          `RTDS token has no entitled event types. Excluded: ${excluded.join(", ")}`,
        );
        // Permanent condition: retrying will never succeed with these types.
        error.code = "RTDS_NO_ENTITLED_TYPES";
        error.excludedEntitlements = excluded;
        throw error;
      }
      continue;
    }

    throw new Error(`RTDS HTTP ${response.status}: ${detail.slice(0, 500)}`);
  }

  throw new Error("RTDS entitlement negotiation exceeded retry limit");
}
