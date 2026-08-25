import fs from "node:fs";
import { loadProfile } from "../config.js";
import { buildRtdsBody } from "../rtds/buildRtdsBody.js";
import { openRtdsNdjsonStream } from "../rtds/openRtdsStream.js";
import {
  buildBodyForConnect,
  reconnectBackoffMs,
  resolveLiveEventLimit,
  resolveLiveStoreRaw,
  shouldReconnectLiveStream,
  sleepMs,
} from "../rtds/liveStreamReconnect.js";

// Opt-in verbose logging. Off by default so PII (channel / named_user) and
// audience filters (the RTDS request body) never hit the logs in normal use.
const DEBUG_LOG = process.env.RTDS_DEBUG_LOG === "1";

function sseMessage(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function eventSummary(event) {
  // No PII: channel / named_user are intentionally omitted even in debug mode.
  return [`type=${event.type}`, `occurred=${event.occurred}`, `id=${event.id}`].join(" ");
}

function appendLiveRawLine(rawFilePath, line) {
  if (!rawFilePath || !line) return;
  try {
    fs.appendFileSync(rawFilePath, `${line}\n`, "utf8");
  } catch (error) {
    console.warn("[live-stream] failed to append raw line:", error.message);
  }
}

function validateRequestedTypes({ body, droppedTypes, requestedTypes }) {
  const filtersWithTypes = (body.filters ?? []).filter((filter) => Array.isArray(filter.types));
  if (
    requestedTypes.length &&
    filtersWithTypes.some((filter) => filter.types.length === 0)
  ) {
    const msg = `No valid RTDS event types in selection (removed: ${droppedTypes.join(", ")})`;
    return { ok: false, message: msg, droppedTypes };
  }
  return { ok: true, droppedTypes };
}

async function* readRtdsNdjsonStream({
  response,
  signal,
  rawFilePath,
  logPrefix,
  limit,
  totalCount,
  lastOffset,
}) {
  const reader = response.body?.getReader();
  if (!reader) {
    yield { kind: "fatal", message: "No response body from RTDS" };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let count = totalCount;
  let resumeOffset = lastOffset;

  try {
    while (true) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const event = JSON.parse(trimmed);
          if (event?.offset) resumeOffset = event.offset;
          appendLiveRawLine(rawFilePath, trimmed);
          if (DEBUG_LOG) console.log(`[${logPrefix}] event ${eventSummary(event)}`);
          yield { kind: "event", event, resumeOffset, count: count + 1 };
          count += 1;
          if (limit && count >= limit) {
            yield { kind: "done", message: `Loaded ${count} events`, count };
            return;
          }
        } catch {
          appendLiveRawLine(rawFilePath, trimmed);
          console.warn(`[${logPrefix}] skipped non-JSON line (${trimmed.length} chars)`);
          yield { kind: "raw", data: trimmed, resumeOffset, count };
        }
      }
    }
  } catch (error) {
    if (signal?.aborted) return;
    console.error(`[${logPrefix}] stream read error:`, error);
    yield { kind: "read_error", error, resumeOffset, count };
    return;
  }

  yield { kind: "upstream_closed", resumeOffset, count };
}

export async function* streamWithProfile(profile, query, logPrefix = "rtds-qa", options = {}) {
  const { signal, rawFilePath, streamId } = options;
  const limit = resolveLiveEventLimit(query);
  // Off by default: when storage is disabled we never write the raw NDJSON,
  // so appendLiveRawLine no-ops (null path) and events stream without storage.
  const effectiveRawFilePath = resolveLiveStoreRaw(query) ? rawFilePath : null;

  const initial = buildBodyForConnect(query, null);
  const typeCheck = validateRequestedTypes(initial);
  if (!typeCheck.ok) {
    console.error(`[${logPrefix}] ${typeCheck.message}`);
    yield sseMessage({ kind: "error", message: typeCheck.message, droppedTypes: typeCheck.droppedTypes });
    return;
  }

  if (initial.droppedTypes.length) {
    console.warn(`[${logPrefix}] dropped non-RTDS types from filter:`, initial.droppedTypes.join(", "));
  }

  let lastOffset = null;
  let totalCount = 0;
  let sentReadyStatus = false;
  let connectAttempt = 0;
  let sessionAttempt = 0;

  while (!signal?.aborted) {
    const { body, droppedTypes, requestedTypes } = buildBodyForConnect(query, lastOffset);
    const resuming = Boolean(lastOffset);

    // Body carries audience filters (named_user/channel): only log it in debug mode.
    if (DEBUG_LOG) {
      console.log(
        `[${logPrefix}] ${resuming ? "resuming" : "opening"} stream profile=${profile.name} region=${profile.region}`,
        body,
      );
    } else {
      console.log(
        `[${logPrefix}] ${resuming ? "resuming" : "opening"} stream profile=${profile.name} region=${profile.region}`,
      );
    }

    let response;
    let connectedRequest = body;
    let excludedEntitlements = [];

    try {
      const opened = await openRtdsNdjsonStream(profile, body, { signal });
      response = opened.response;
      connectedRequest = opened.request;
      excludedEntitlements = opened.excludedEntitlements ?? [];
      connectAttempt = 0;
    } catch (error) {
      if (signal?.aborted) return;
      // Permanent entitlement failure (e.g. the only selected type is not
      // entitled): retrying will never succeed, so surface a clear terminal error.
      if (error?.code === "RTDS_NO_ENTITLED_TYPES") {
        const excluded = error.excludedEntitlements ?? [];
        console.error(`[${logPrefix}] connect error (no entitled types):`, error.message);
        yield sseMessage({
          kind: "error",
          message: excluded.length
            ? `This project's RTDS token is not entitled to the selected event type(s): ${excluded.join(", ")}. Pick different event types or use a token with those entitlements.`
            : "This project's RTDS token has no entitled event types for the current filter.",
          detail: String(error?.message ?? error),
          excludedEntitlements: excluded,
        });
        return;
      }
      if (!shouldReconnectLiveStream(query, totalCount)) {
        console.error(`[${logPrefix}] connect error:`, error);
        yield sseMessage({
          kind: "error",
          message: "Failed to connect to RTDS",
          detail: String(error?.message ?? error),
        });
        return;
      }
      connectAttempt += 1;
      const backoff = reconnectBackoffMs(connectAttempt);
      console.warn(
        `[${logPrefix}] connect failed (attempt ${connectAttempt}), retry in ${backoff}ms:`,
        error.message,
      );
      yield sseMessage({
        kind: "status",
        phase: "reconnect",
        message: `RTDS connect failed — retrying in ${Math.ceil(backoff / 1000)}s…`,
        profile: profile.name,
        streamId,
        reconnectAttempt: connectAttempt,
        resumeOffset: lastOffset ?? undefined,
      });
      try {
        await sleepMs(backoff, signal);
      } catch {
        return;
      }
      continue;
    }

    if (excludedEntitlements.length) {
      yield sseMessage({
        kind: "status",
        message: `Adjusted RTDS filters (token not entitled to: ${excludedEntitlements.join(", ")}).`,
        profile: profile.name,
        streamId,
        excludedEntitlements,
        request: connectedRequest,
      });
    }

    sessionAttempt += 1;
    yield sseMessage({
      kind: "status",
      message: resuming ? "resumed" : sentReadyStatus ? "reconnected" : "connected",
      profile: profile.name,
      streamId,
      request: connectedRequest,
      resumed: resuming || undefined,
      reconnectAttempt: resuming || sessionAttempt > 1 ? sessionAttempt - 1 : undefined,
      resumeOffset: lastOffset ?? undefined,
      droppedTypes: !sentReadyStatus && droppedTypes.length ? droppedTypes : undefined,
      excludedEntitlements: excludedEntitlements.length ? excludedEntitlements : undefined,
    });
    sentReadyStatus = true;

    let sessionResumeOffset = lastOffset;
    for await (const step of readRtdsNdjsonStream({
      response,
      signal,
      rawFilePath: effectiveRawFilePath,
      logPrefix,
      limit,
      totalCount,
      lastOffset: sessionResumeOffset,
    })) {
      if (signal?.aborted) return;

      if (step.resumeOffset) {
        lastOffset = step.resumeOffset;
        sessionResumeOffset = step.resumeOffset;
      }
      if (step.count != null) totalCount = step.count;

      if (step.kind === "event") {
        yield sseMessage({ kind: "event", event: step.event });
        continue;
      }
      if (step.kind === "raw") {
        yield sseMessage({ kind: "raw", data: step.data });
        continue;
      }
      if (step.kind === "done") {
        yield sseMessage({ kind: "done", message: step.message, count: step.count });
        return;
      }
      if (step.kind === "fatal") {
        yield sseMessage({ kind: "error", message: step.message });
        return;
      }
      if (step.kind === "read_error") {
        if (!shouldReconnectLiveStream(query, totalCount)) {
          yield sseMessage({
            kind: "error",
            message: "Unexpected stream error",
            detail: String(step.error),
          });
          return;
        }
        break;
      }
      if (step.kind === "upstream_closed") {
        break;
      }
    }

    if (signal?.aborted) return;
    if (!shouldReconnectLiveStream(query, totalCount)) return;

    connectAttempt += 1;
    const backoff = reconnectBackoffMs(connectAttempt);
    console.log(
      `[${logPrefix}] upstream closed after ${totalCount} events; resume in ${backoff}ms offset=${lastOffset ?? "none"}`,
    );
    yield sseMessage({
      kind: "status",
      phase: "reconnect",
      message: lastOffset
        ? `RTDS stream paused — resuming from last offset in ${Math.ceil(backoff / 1000)}s…`
        : `RTDS stream paused — reconnecting in ${Math.ceil(backoff / 1000)}s…`,
      profile: profile.name,
      streamId,
      reconnectAttempt: connectAttempt,
      resumeOffset: lastOffset ?? undefined,
    });
    try {
      await sleepMs(backoff, signal);
    } catch {
      return;
    }
  }
}

export async function* streamRtdsEvents(query, options = {}) {
  const profileName = query.profile;
  if (!profileName) {
    yield sseMessage({
      kind: "error",
      message: "No project selected",
      detail: "Choose a project in Settings or add config/rtds-profiles.json",
    });
    return;
  }
  let profile;
  try {
    profile = loadProfile(profileName);
  } catch (error) {
    yield sseMessage({
      kind: "error",
      message: `Profile ${profileName} is not configured`,
      detail: error.message,
    });
    return;
  }
  yield* streamWithProfile(profile, query, "rtds-dca", options);
}
