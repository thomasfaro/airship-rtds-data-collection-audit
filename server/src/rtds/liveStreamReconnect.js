import { buildRtdsBody } from "./buildRtdsBody.js";

export function resolveLiveEventLimit(query) {
  const raw = query?.limit;
  if (raw == null || raw === "") return null;
  const limit = Number.parseInt(String(raw), 10);
  return Number.isFinite(limit) && limit > 0 ? limit : null;
}

/** Whether to persist the raw NDJSON to disk. Off by default (stream without storage). */
export function resolveLiveStoreRaw(query) {
  const raw = query?.store_raw ?? query?.storeRaw;
  if (raw == null) return false;
  const v = String(raw).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Reconnect while the client is connected and the event cap (if any) is not reached. */
export function shouldReconnectLiveStream(query, totalCount = 0) {
  const limit = resolveLiveEventLimit(query);
  if (limit == null) return true;
  return totalCount < limit;
}

export function buildBodyForConnect(query, resumeOffset) {
  const { body, droppedTypes, requestedTypes } = buildRtdsBody(query);
  const connectBody = JSON.parse(JSON.stringify(body));
  if (resumeOffset) {
    delete connectBody.start;
    connectBody.resume_offset = resumeOffset;
  }
  return { body: connectBody, droppedTypes, requestedTypes };
}
