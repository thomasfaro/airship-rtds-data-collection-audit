import { apiFetch } from "./apiClient.js";
import { expectOk } from "./parseJsonResponse.js";

export async function fetchHistory() {
  return expectOk(await apiFetch("/api/history"), "list saved audits");
}

export async function fetchHistoryReport({ name } = {}) {
  const query = new URLSearchParams({ name: String(name ?? "") });
  return expectOk(await apiFetch(`/api/history/report?${query}`), "open the saved audit");
}

export async function deleteHistoryItem({ name } = {}) {
  const query = new URLSearchParams({ name: String(name ?? "") });
  return expectOk(
    await apiFetch(`/api/history/item?${query}`, { method: "DELETE" }),
    "delete the saved audit",
  );
}
