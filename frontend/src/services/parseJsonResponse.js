export async function parseJsonResponse(response, action) {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(
      `Empty response from server while trying to ${action} (HTTP ${response.status}).`,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid server response while trying to ${action} (HTTP ${response.status}).`);
  }
}

/** Parse an API response and throw a readable error unless it reports `ok: true`. */
export async function expectOk(response, action) {
  const payload = await parseJsonResponse(response, action);
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Failed to ${action} (HTTP ${response.status})`);
  }
  return payload;
}
