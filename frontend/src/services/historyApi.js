import { apiFetch } from "./apiClient.js";
import { expectOk } from "./parseJsonResponse.js";

export async function fetchHistory() {
  return expectOk(await apiFetch("/api/history"), "list saved audits");
}

export async function fetchHistoryReport({ name } = {}) {
  const query = new URLSearchParams({ name: String(name ?? "") });
  return expectOk(await apiFetch(`/api/history/report?${query}`), "open the saved audit");
}

export async function downloadHistoryRaw({ name } = {}) {
  const query = new URLSearchParams({ name: String(name ?? "") });
  const response = await apiFetch(`/api/history/raw?${query}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Failed to download the live capture (HTTP ${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = String(name ?? "capture.ndjson");
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function deleteHistoryItem({ name } = {}) {
  const query = new URLSearchParams({ name: String(name ?? "") });
  return expectOk(
    await apiFetch(`/api/history/item?${query}`, { method: "DELETE" }),
    "delete the saved audit",
  );
}
