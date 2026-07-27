import path from "node:path";

/** Active audit downloads keyed by normalized profile name. */
const sessions = new Map();

export function normalizeProfileKey(profileName) {
  return String(profileName).toLowerCase().replace(/\s+/g, "");
}

/**
 * @returns {{ ok: true } | { ok: false, error: "already_running" }}
 */
export function registerAuditSession(profileName, controller, rawFilePath = null) {
  const key = normalizeProfileKey(profileName);
  if (sessions.has(key)) {
    return { ok: false, error: "already_running" };
  }
  sessions.set(key, {
    key,
    profileName: String(profileName),
    controller,
    rawFilePath: rawFilePath ?? null,
  });
  return { ok: true };
}

export function unregisterAuditSession(profileName) {
  sessions.delete(normalizeProfileKey(profileName));
}

function isSessionStale(session) {
  const signal = session.controller?.signal;
  return Boolean(signal?.aborted);
}

/** Drop sessions whose download was aborted (e.g. user left the audit page). */
export function purgeStaleAuditSessions() {
  for (const [key, session] of sessions.entries()) {
    if (isSessionStale(session)) {
      sessions.delete(key);
    }
  }
}

export function getActiveAuditRawPaths() {
  purgeStaleAuditSessions();
  const paths = [];
  for (const session of sessions.values()) {
    if (session.rawFilePath && !isSessionStale(session)) {
      paths.push(session.rawFilePath);
    }
  }
  return paths;
}

export function isAuditFileLocked(filePath) {
  purgeStaleAuditSessions();
  const resolved = path.resolve(filePath);
  for (const session of sessions.values()) {
    if (!session.rawFilePath || isSessionStale(session)) continue;
    if (path.resolve(session.rawFilePath) === resolved) return true;
  }
  return false;
}

export function stopAuditDownload(profileName) {
  const session = sessions.get(normalizeProfileKey(profileName));
  if (!session) return false;
  session.controller.abort();
  return true;
}
