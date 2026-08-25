const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const STORAGE_KEY = "rtds-dca-local-api-key";

let bootstrapPromise = null;

export function getApiBase() {
  return API_BASE;
}

export function clearLocalApiKeyCache() {
  bootstrapPromise = null;
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

async function fetchBootstrapKey() {
  const response = await fetch(`${API_BASE}/api/bootstrap`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Failed to connect to local API (HTTP ${response.status})`);
  }
  if (!payload.localApiKey) {
    throw new Error("Local API key missing from bootstrap response");
  }
  return payload.localApiKey;
}

export async function getLocalApiKey({ forceRefresh = false } = {}) {
  if (forceRefresh) {
    clearLocalApiKeyCache();
  }
  if (typeof sessionStorage !== "undefined") {
    const cached = sessionStorage.getItem(STORAGE_KEY);
    if (cached) return cached;
  }
  if (!bootstrapPromise) {
    bootstrapPromise = fetchBootstrapKey().then((key) => {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(STORAGE_KEY, key);
      }
      return key;
    });
  }
  return bootstrapPromise;
}

export async function apiFetch(path, init = {}) {
  const attempt = async (forceRefresh) => {
    const key = await getLocalApiKey({ forceRefresh });
    const headers = new Headers(init.headers ?? {});
    headers.set("X-RTDS-DCA-Local-Key", key);
    return fetch(`${API_BASE}${path}`, { ...init, headers });
  };

  let response = await attempt(false);
  if (response.status === 401) {
    clearLocalApiKeyCache();
    response = await attempt(true);
  }
  return response;
}

/** Append local_key to a path+query string (works with empty API_BASE + Vite proxy). */
export async function withLocalApiQuery(pathWithQuery) {
  const key = await getLocalApiKey();
  const path = String(pathWithQuery ?? "").startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  const qIndex = path.indexOf("?");
  const pathname = qIndex >= 0 ? path.slice(0, qIndex) : path;
  const params = new URLSearchParams(qIndex >= 0 ? path.slice(qIndex + 1) : "");
  params.set("local_key", key);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
