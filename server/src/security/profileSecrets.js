import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveProfilesConfigPath } from "../appPaths.js";
import { writeFileOwnerOnly } from "./secureFs.js";

/**
 * Local at-rest encryption for RTDS bearer tokens.
 *
 * Tokens are encrypted with AES-256-GCM using a locally-stored random key
 * (config/.profiles-key, chmod 600, gitignored) so that rtds-profiles.json
 * never holds secrets in cleartext. The key lives on the same disk as the
 * data, so this protects against casual reading / sharing / backups of the
 * JSON alone, not against a full-disk compromise.
 */

const ENC_PREFIX = "enc:v1:";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

let cachedKey = null;

function profilesKeyPath() {
  return path.join(path.dirname(resolveProfilesConfigPath()), ".profiles-key");
}

function keyFromEnv() {
  const raw = String(process.env.RTDS_PROFILES_KEY ?? "").trim();
  if (!raw) return null;
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== KEY_BYTES) {
    throw new Error("RTDS_PROFILES_KEY must decode to 32 bytes (base64)");
  }
  return buf;
}

/** Read the local encryption key, generating one on first use. */
export function getOrCreateProfilesKey() {
  if (cachedKey) return cachedKey;

  const envKey = keyFromEnv();
  if (envKey) {
    cachedKey = envKey;
    return cachedKey;
  }

  const filePath = profilesKeyPath();
  if (fs.existsSync(filePath)) {
    const buf = Buffer.from(fs.readFileSync(filePath, "utf8").trim(), "base64");
    if (buf.length !== KEY_BYTES) {
      throw new Error(`Invalid RTDS profiles key file: ${filePath}`);
    }
    cachedKey = buf;
    return cachedKey;
  }

  cachedKey = crypto.randomBytes(KEY_BYTES);
  writeFileOwnerOnly(filePath, `${cachedKey.toString("base64")}\n`);
  return cachedKey;
}

/** Reset the in-memory key cache (test hook). */
export function resetProfilesKeyCache() {
  cachedKey = null;
}

export function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(ENC_PREFIX);
}

/** Encrypt a token; idempotent (already-encrypted values pass through). */
export function encryptToken(plain) {
  const text = String(plain ?? "");
  if (!text || isEncrypted(text)) return text;

  const key = getOrCreateProfilesKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/** Decrypt a token; legacy cleartext values pass through unchanged. */
export function decryptToken(value) {
  const text = String(value ?? "");
  if (!text || !isEncrypted(text)) return text;

  const key = getOrCreateProfilesKey();
  const packed = Buffer.from(text.slice(ENC_PREFIX.length), "base64");
  const iv = packed.subarray(0, IV_BYTES);
  const tag = packed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = packed.subarray(IV_BYTES + TAG_BYTES);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Like decryptToken but returns null when the ciphertext cannot be decrypted. */
export function tryDecryptToken(value) {
  try {
    return decryptToken(value);
  } catch {
    return null;
  }
}
