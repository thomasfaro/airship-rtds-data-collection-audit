import crypto from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";

// Deterministic key via env so tests need no filesystem/key file.
process.env.RTDS_PROFILES_KEY = crypto.randomBytes(32).toString("base64");

const { encryptToken, decryptToken, isEncrypted, tryDecryptToken } = await import("./profileSecrets.js");

test("round-trips a token through encrypt/decrypt", () => {
  const token = "Bearer abc123.def456.ghi789";
  const encrypted = encryptToken(token);
  assert.ok(isEncrypted(encrypted), "output should carry the enc:v1: marker");
  assert.notEqual(encrypted, token);
  assert.equal(decryptToken(encrypted), token);
});

test("produces distinct ciphertext for the same input (random IV)", () => {
  const token = "Bearer same-token";
  assert.notEqual(encryptToken(token), encryptToken(token));
});

test("passes legacy cleartext tokens through unchanged", () => {
  const legacy = "Bearer legacy-plaintext-token";
  assert.equal(isEncrypted(legacy), false);
  assert.equal(decryptToken(legacy), legacy);
});

test("encryptToken is idempotent on already-encrypted values", () => {
  const encrypted = encryptToken("Bearer token");
  assert.equal(encryptToken(encrypted), encrypted);
});

test("handles empty values", () => {
  assert.equal(encryptToken(""), "");
  assert.equal(decryptToken(""), "");
});

test("rejects tampered ciphertext (GCM auth tag)", () => {
  const encrypted = encryptToken("Bearer tamper-me");
  const raw = Buffer.from(encrypted.slice("enc:v1:".length), "base64");
  raw[raw.length - 1] ^= 0x01; // flip a bit in the ciphertext
  const tampered = `enc:v1:${raw.toString("base64")}`;
  assert.throws(() => decryptToken(tampered));
});

test("tryDecryptToken returns null for tampered ciphertext", () => {
  const encrypted = encryptToken("Bearer tamper-me");
  const raw = Buffer.from(encrypted.slice("enc:v1:".length), "base64");
  raw[raw.length - 1] ^= 0x01;
  const tampered = `enc:v1:${raw.toString("base64")}`;
  assert.equal(tryDecryptToken(tampered), null);
});
