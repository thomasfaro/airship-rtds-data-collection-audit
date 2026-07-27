/** RTDS bearer token helpers (token payload embeds the app key). */

export function normalizeBearerToken(token) {
  const trimmed = String(token ?? "").trim();
  if (!trimmed) {
    throw new Error("RTDS bearer token is required");
  }
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    return trimmed;
  }
  return `Bearer ${trimmed}`;
}

/**
 * Decode Airship RTDS bearer token (base64) and return the app key segment.
 * Format after decode: `{prefix}:{app_key}:{secret}` (see Airship RTDS token docs).
 */
export function appKeyFromBearerToken(bearerToken) {
  const normalized = normalizeBearerToken(bearerToken);
  const encodedToken = normalized.split(/\s+/, 2)[1];
  const padded = encodedToken + "=".repeat((4 - (encodedToken.length % 4)) % 4);
  let decoded;
  try {
    decoded = Buffer.from(padded, "base64").toString("utf8");
  } catch {
    throw new Error("RTDS bearer token must be base64 encoded");
  }
  const parts = decoded.split(":", 3);
  if (parts.length < 3 || !parts[1]) {
    throw new Error("RTDS bearer token does not include an app key");
  }
  return parts[1];
}

export function resolveAppKeyFromToken(token, fallbackAppKey = "") {
  const normalized = normalizeBearerToken(token);
  try {
    return appKeyFromBearerToken(normalized);
  } catch (error) {
    const manual = String(fallbackAppKey ?? "").trim();
    if (manual) return manual;
    throw error;
  }
}
