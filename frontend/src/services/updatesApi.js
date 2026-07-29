import { apiFetch, getApiBase } from "./apiClient.js";

/** Version of the server answering right now. Unauthenticated, like /api/health itself. */
export async function fetchAppVersion() {
  const response = await fetch(`${getApiBase()}/api/health`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Could not read the app version.");
  }
  return payload.version ?? null;
}

export async function fetchUpdateStatus({ force = false } = {}) {
  const response = await apiFetch(`/api/updates${force ? "?force=1" : ""}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Could not check for updates.");
  }
  return payload;
}

export async function applyUpdate() {
  const response = await apiFetch("/api/updates/apply", { method: "POST" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Could not apply the update.");
  }
  return payload;
}

/**
 * Ask the server to hand over to a fresh copy of itself.
 *
 * It answers first and exits a moment later, so a dropped connection here means the
 * restart is already under way — not a failure. The caller waits for the new server
 * either way, which is the only outcome that actually tells us anything.
 */
export async function requestRestart() {
  try {
    await apiFetch("/api/updates/restart", { method: "POST" });
  } catch {
    // The server going away mid-request is the expected shape of success.
  }
}
