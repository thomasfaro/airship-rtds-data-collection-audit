import { apiFetch, getApiBase, withLocalApiQuery } from "./apiClient.js";
import { expectOk } from "./parseJsonResponse.js";
import { buildCaptureStreamParams } from "../lib/captureParams.js";

export async function fetchCaptureOptions() {
  const response = await apiFetch("/api/capture/options");
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Failed to load capture options (HTTP ${response.status})`);
  }
  return payload;
}

export async function buildCaptureStreamUrl(settings) {
  const params = buildCaptureStreamParams(settings);
  return `${getApiBase()}${await withLocalApiQuery(`/api/capture/stream?${params}`)}`;
}

/**
 * Open the capture SSE stream. Returns a function that closes it (the server
 * aborts the RTDS download when the client disconnects).
 */
export function runDataCollectionCapture({ onStatus, onProgress, onComplete, onError, ...settings }) {
  let source = null;
  let closed = false;

  buildCaptureStreamUrl(settings)
    .then((url) => {
      if (closed) return;
      source = new EventSource(url);
      source.onmessage = (message) => {
        try {
          const payload = JSON.parse(message.data);
          if (payload.kind === "status") {
            onStatus?.(payload);
            return;
          }
          if (payload.kind === "progress") {
            onProgress?.(payload);
            return;
          }
          if (payload.kind === "complete") {
            source?.close();
            onComplete?.(payload.report);
            return;
          }
          if (payload.kind === "error") {
            source?.close();
            const error = new Error(payload.message || payload.detail || "Capture error");
            error.detail = payload.detail;
            error.causeHint = payload.causeHint;
            onError?.(error);
          }
        } catch (error) {
          source?.close();
          onError?.(error);
        }
      };
      source.onerror = () => {
        source?.close();
        onError?.(new Error("Capture connection interrupted"));
      };
    })
    .catch((error) => onError?.(error));

  return () => {
    closed = true;
    source?.close();
  };
}

export async function stopCapture(profile) {
  const query = new URLSearchParams({ profile: String(profile ?? "") });
  return expectOk(
    await apiFetch(`/api/capture/stop?${query}`, { method: "POST" }),
    "stop the capture",
  );
}
