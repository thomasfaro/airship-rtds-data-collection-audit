import fs from "node:fs";
import path from "node:path";
import { dataRoot, repoRoot, resolveProfilesConfigPath as resolveProfilesPath } from "./appPaths.js";
import { appKeyFromBearerToken, resolveAppKeyFromToken } from "./rtdsToken.js";
import { chmodOwnerOnly, writeFileOwnerOnly } from "./security/secureFs.js";
import { encryptToken, isEncrypted, tryDecryptToken } from "./security/profileSecrets.js";

export const workspaceRoot = dataRoot();
export { repoRoot };

export const CONNECT_URLS = {
  eu: "https://connect.asnapieu.com/api/events",
  us: "https://connect.urbanairship.com/api/events",
};

/** RTDS types that carry campaign categories — used when that audience filter is set. */
export const CAMPAIGN_CATEGORY_EVENT_TYPES = ["PUSH_BODY", "SEND", "OPEN"];

function normalizeName(value) {
  return String(value).toLowerCase().replace(/\s+/g, "");
}

function normalizeToken(token) {
  let value = String(token ?? "").trim();
  if (!value) return "";
  if (!value.toLowerCase().startsWith("bearer ")) {
    value = `Bearer ${value}`;
  }
  return value;
}

function normalizeRegion(region) {
  const value = String(region ?? "us").toLowerCase();
  return value === "eu" ? "eu" : "us";
}

export function resolveProfilesConfigPath() {
  return resolveProfilesPath();
}

export function loadProfilesFile() {
  const configPath = resolveProfilesConfigPath();
  if (!fs.existsSync(configPath)) {
    return { profiles: {}, _configPath: configPath, _hadPlaintext: false };
  }
  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw);
  const stored = parsed.profiles ?? {};

  // Decrypt tokens in memory; legacy cleartext tokens pass through unchanged.
  let hadPlaintext = false;
  let decryptFailures = 0;
  const profiles = {};
  for (const [name, entry] of Object.entries(stored)) {
    const rawToken = entry?.token ?? "";
    if (rawToken && !isEncrypted(rawToken)) hadPlaintext = true;
    if (!rawToken) {
      profiles[name] = { ...entry, token: "" };
      continue;
    }
    if (!isEncrypted(rawToken)) {
      profiles[name] = { ...entry, token: rawToken };
      continue;
    }
    const decrypted = tryDecryptToken(rawToken);
    if (decrypted == null) {
      decryptFailures += 1;
      profiles[name] = {
        ...entry,
        token: "",
        decrypt_failed: true,
        _encryptedToken: rawToken,
      };
      continue;
    }
    profiles[name] = { ...entry, token: decrypted };
  }

  return { profiles, _configPath: configPath, _hadPlaintext: hadPlaintext, _decryptFailures: decryptFailures };
}

export function saveProfilesFile(profiles) {
  const configPath = resolveProfilesConfigPath();
  // Encrypt tokens at rest so the JSON never holds secrets in cleartext.
  const persisted = {};
  for (const [name, entry] of Object.entries(profiles)) {
    const { decrypt_failed: decryptFailed, _encryptedToken, ...rest } = entry ?? {};
    const nextToken = String(entry?.token ?? "").trim();
    const tokenToSave =
      decryptFailed && !nextToken && _encryptedToken ? _encryptedToken : encryptToken(entry?.token ?? "");
    persisted[name] = { ...rest, token: tokenToSave };
  }
  const payload = { profiles: persisted };
  writeFileOwnerOnly(configPath, `${JSON.stringify(payload, null, 2)}\n`);
  return configPath;
}

/**
 * One-shot migration: if any token is stored in cleartext, re-save the file so
 * every token becomes encrypted. Best-effort and safe to call on every startup.
 */
export function migrateProfilesEncryption() {
  const { profiles, _configPath, _hadPlaintext } = loadProfilesFile();
  if (!_hadPlaintext) return { migrated: false };
  saveProfilesFile(profiles);
  return { migrated: true, configPath: _configPath };
}

export function profilesConfigPathLabel() {
  return "config/rtds-profiles.json (in your project folder)";
}

function findProfileEntry(profiles, profileName) {
  const wanted = normalizeName(profileName);
  for (const [name, entry] of Object.entries(profiles)) {
    if (normalizeName(name) === wanted) {
      return [name, entry];
    }
  }
  return [null, null];
}

function maskValue(value, visible = 4) {
  const text = String(value ?? "");
  if (!text) return "";
  if (text.length <= visible * 2) return "••••";
  return `${text.slice(0, visible)}…${text.slice(-visible)}`;
}

function appKeyForEntry(entry) {
  const token = String(entry?.token ?? "").trim();
  if (!token) return "";
  try {
    return appKeyFromBearerToken(normalizeToken(token));
  } catch {
    return String(entry?.app_key ?? "").trim();
  }
}

export function configuredProfileNames() {
  const { profiles } = loadProfilesFile();
  return Object.entries(profiles)
    .filter(([, entry]) => String(entry?.token ?? "").trim())
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b));
}

export function listProfilesSummary() {
  const { profiles, _configPath, _decryptFailures } = loadProfilesFile();
  const items = Object.entries(profiles)
    .map(([name, entry]) => {
      const appKey = appKeyForEntry(entry);
      return {
        name,
        region: normalizeRegion(entry?.region),
        app_key_masked: maskValue(appKey),
        has_token: Boolean(String(entry?.token ?? "").trim()),
        decrypt_failed: Boolean(entry?.decrypt_failed),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  if (fs.existsSync(_configPath)) {
    chmodOwnerOnly(_configPath);
  }

  return {
    profiles: items,
    configPathLabel: profilesConfigPathLabel(),
    loaded: fs.existsSync(_configPath),
    localOnly: true,
    decryptFailures: _decryptFailures ?? 0,
  };
}

export function getProfileDetails(profileName) {
  const { profiles } = loadProfilesFile();
  const [name, entry] = findProfileEntry(profiles, profileName);
  if (!name || !entry) {
    throw new Error(`Unknown RTDS profile: ${profileName}`);
  }
  const token = entry.token ?? "";
  return {
    name,
    app_key_masked: maskValue(appKeyForEntry(entry)),
    has_token: Boolean(String(token).trim()),
    region: normalizeRegion(entry.region),
  };
}

export function loadProfile(profileName) {
  const { profiles } = loadProfilesFile();
  const [name, entry] = findProfileEntry(profiles, profileName);
  if (!name || !entry) {
    throw new Error(`Unknown RTDS profile: ${profileName}`);
  }
  const token = normalizeToken(entry.token);
  if (!token) {
    throw new Error(`Profile ${name} is missing: token`);
  }
  const app_key = resolveAppKeyFromToken(token, entry.app_key);
  return {
    name,
    app_key,
    token,
    region: normalizeRegion(entry.region),
  };
}

export function upsertProfile(profileName, { token, region }) {
  const name = String(profileName ?? "").trim();
  if (!name) {
    throw new Error("Profile name is required");
  }

  const { profiles } = loadProfilesFile();
  const [, existing] = findProfileEntry(profiles, name);
  const nextToken = String(token ?? "").trim() ? normalizeToken(token) : normalizeToken(existing?.token);
  if (!nextToken) {
    throw new Error("RTDS bearer token is required");
  }

  const app_key = resolveAppKeyFromToken(nextToken, existing?.app_key);

  profiles[name] = {
    app_key,
    token: nextToken,
    region: normalizeRegion(region),
  };
  saveProfilesFile(profiles);
  return loadProfile(name);
}

export function deleteProfile(profileName) {
  const { profiles } = loadProfilesFile();
  const [name] = findProfileEntry(profiles, profileName);
  if (!name) {
    throw new Error(`Unknown RTDS profile: ${profileName}`);
  }
  delete profiles[name];
  saveProfilesFile(profiles);
  return { deleted: name };
}
