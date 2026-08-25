import { apiFetch, getApiBase, withLocalApiQuery } from "./apiClient.js";
import { parseJsonResponse } from "./parseJsonResponse.js";

export async function fetchLiveStreamCapture({ streamId, afterLines = 0 } = {}) {
  const params = new URLSearchParams();
  params.set("stream_id", streamId);
  if (afterLines > 0) params.set("after_lines", String(afterLines));
  const response = await apiFetch(`/api/stream/capture?${params.toString()}`);
  const payload = await parseJsonResponse(response, "load live capture");
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Failed to load live capture (HTTP ${response.status})`);
  }
  return payload;
}

export async function buildStreamUrl(params) {
  const query = params instanceof URLSearchParams ? params : new URLSearchParams(params);
  return `${getApiBase()}${await withLocalApiQuery(`/api/stream?${query.toString()}`)}`;
}

export async function releaseLiveStream({ profile, streamId } = {}) {
  const params = new URLSearchParams();
  if (profile) params.set("profile", profile);
  if (streamId) params.set("stream_id", streamId);
  if (!params.toString()) return;

  try {
    const response = await apiFetch(`/api/stream/cache?${params.toString()}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = await parseJsonResponse(response, "release live stream");
      throw new Error(payload.error || `HTTP ${response.status}`);
    }
  } catch (error) {
    console.warn("[live] failed to release server stream cache:", error.message);
  }
}

