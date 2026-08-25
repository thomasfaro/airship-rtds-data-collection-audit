import { apiFetch } from "./apiClient.js";
import { expectOk, parseJsonResponse } from "./parseJsonResponse.js";

export async function fetchProfiles() {
  const response = await apiFetch("/api/profiles");
  const payload = await parseJsonResponse(response, "load RTDS projects");
  if (!response.ok) {
    throw new Error(payload.error || `Failed to load RTDS projects (HTTP ${response.status})`);
  }
  return payload;
}

export async function createProfile({ name, token, region }) {
  const response = await apiFetch("/api/profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, token, region }),
  });
  return expectOk(response, "save the project");
}

export async function updateProfile({ name, token, region }) {
  const response = await apiFetch(`/api/profiles/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, region }),
  });
  return expectOk(response, "update the project");
}

export async function deleteProfile({ name }) {
  const response = await apiFetch(`/api/profiles/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  return expectOk(response, "delete the project");
}
