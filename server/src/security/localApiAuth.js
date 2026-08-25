import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataRoot } from "../appPaths.js";
import { chmodOwnerOnly, writeFileOwnerOnly } from "./secureFs.js";

const HEADER_NAME = "x-rtds-dca-local-key";
const QUERY_NAME = "local_key";

let cachedKey = null;

function localApiKeyPath() {
  return path.join(dataRoot(), "config", ".local-api-key");
}

export function getLocalApiKey() {
  if (cachedKey) return cachedKey;
  const filePath = localApiKeyPath();
  if (fs.existsSync(filePath)) {
    cachedKey = fs.readFileSync(filePath, "utf8").trim();
    return cachedKey;
  }
  cachedKey = crypto.randomBytes(32).toString("hex");
  writeFileOwnerOnly(filePath, `${cachedKey}\n`);
  return cachedKey;
}

export function readLocalApiKeyFromRequest(req) {
  const header = req.headers[HEADER_NAME] ?? req.headers[HEADER_NAME.toUpperCase()];
  if (header) return String(header).trim();
  if (req.query?.[QUERY_NAME]) return String(req.query[QUERY_NAME]).trim();
  return "";
}

export function isLoopbackAddress(ip) {
  if (!ip) return false;
  const normalized = String(ip).replace(/^::ffff:/, "");
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "localhost";
}

export function isLoopbackRequest(req) {
  const ip = req.socket?.remoteAddress ?? req.ip;
  return isLoopbackAddress(ip);
}

export function isLocalApiKeyValid(req) {
  const provided = readLocalApiKeyFromRequest(req);
  if (!provided) return false;
  return provided === getLocalApiKey();
}
