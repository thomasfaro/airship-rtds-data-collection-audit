import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The security properties of this tool, stated as assertions rather than prose.
 *
 * It is a local app holding a client's personal data, so three things carry the
 * whole thing: the API answers no one but this machine's UI, an update may not
 * write over the profiles or the saved captures, and only two hostnames are ever
 * contacted. Each is enforced in one place; this file is where a reviewer can see
 * that it still is, and where a regression shows up as a failing test instead of
 * as a quiet hole.
 */

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rtds-dca-invariants-"));
fs.mkdirSync(path.join(dataDir, "config"), { recursive: true });
process.env.RTDS_DCA_DATA_DIR = dataDir;
process.env.RTDS_DCA_STORAGE_DIR = path.join(dataDir, "analyses");
process.env.RTDS_PROFILES_PATH = path.join(dataDir, "config", "rtds-profiles.json");

const express = (await import("express")).default;
const { default: apiRoutes } = await import("../routes/api.js");
const { requireLocalClient } = await import("../middleware/requireLocalClient.js");
const { getLocalApiKey, isLoopbackAddress } = await import("./localApiAuth.js");
const { isProtectedPath, isSafeArchivePath, isWritablePath } = await import(
  "../updates/applyArchive.js"
);
const { ALLOWED_HOSTS, ARCHIVE_URL, MANIFEST_URL, isAllowedUrl } = await import(
  "../updates/releaseInfo.js"
);

/**
 * The only routes allowed to answer without the local key, and why:
 * `/api/health` is what the launchers, the offline page and the recovery button
 * poll to find out whether the server is up — a key would make "is it running?"
 * unanswerable from a terminal. (`/api/bootstrap` is the other one, and it is
 * mounted in index.js ahead of the guard; it hands out the key to loopback
 * callers, and is covered by its own assertions below.)
 */
const UNAUTHENTICATED_ROUTES = new Set(["GET /api/health"]);

/** Every route the real router exposes, as "METHOD /api/path". */
function enumerateRoutes(router, prefix = "/api") {
  const routes = [];
  for (const layer of router.stack ?? []) {
    if (layer.route) {
      const routePath = `${prefix}${layer.route.path === "/" ? "" : layer.route.path}`;
      for (const [method, enabled] of Object.entries(layer.route.methods)) {
        if (enabled) routes.push(`${method.toUpperCase()} ${routePath || "/"}`);
      }
      continue;
    }
    if (layer.name === "router" && layer.handle?.stack) {
      routes.push(...enumerateRoutes(layer.handle, `${prefix}${mountPath(layer)}`));
    }
  }
  return routes;
}

/** The path a sub-router is mounted on, recovered from the layer's own matcher. */
function mountPath(layer) {
  const source = layer.regexp?.source ?? "";
  const match = source.match(/^\^\\\/([A-Za-z0-9_-]+)/);
  return match ? `/${match[1]}` : "";
}

/** The app as index.js assembles it: the guard, then the routes. */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", requireLocalClient);
  app.use("/api", apiRoutes);
  return app;
}

async function callWithoutKey(route) {
  const [method, routePath] = route.split(" ");
  const app = buildApp();
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const { port } = server.address();
    // Route parameters are irrelevant to the guard: it runs before any handler.
    const url = `http://127.0.0.1:${port}${routePath.replace(/:[A-Za-z]+/g, "x")}`;
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      ...(method === "GET" || method === "DELETE" ? {} : { body: "{}" }),
    });
    return response.status;
  } finally {
    server.close();
  }
}

/**
 * The API surface, written out. It is here so that adding a route is a visible
 * change to this list — which is also what keeps the test above from passing
 * vacuously on a mis-enumerated router.
 */
const API_ROUTES = [
  "GET /api/health",
  "GET /api/profiles",
  "GET /api/profiles/:name",
  "POST /api/profiles",
  "PUT /api/profiles/:name",
  "DELETE /api/profiles/:name",
  "GET /api/capture/options",
  "POST /api/capture/stop",
  "GET /api/capture/stream",
  "DELETE /api/stream/cache",
  "GET /api/stream/capture",
  "GET /api/stream",
  "GET /api/values/attributes",
  "GET /api/values/attribute-json-properties",
  "GET /api/values/custom-properties",
  "GET /api/values/event-samples",
  "GET /api/history",
  "GET /api/history/report",
  "GET /api/history/raw",
  "DELETE /api/history/item",
  "GET /api/updates",
  "POST /api/updates/apply",
  "POST /api/updates/restart",
];

test("the router exposes exactly the routes this file knows about", () => {
  assert.deepEqual(enumerateRoutes(apiRoutes).sort(), [...API_ROUTES].sort());
});

test("every /api route refuses a caller without the local key", async () => {
  const guarded = API_ROUTES.filter((route) => !UNAUTHENTICATED_ROUTES.has(route));
  for (const route of guarded) {
    assert.equal(await callWithoutKey(route), 401, `${route} answered without a key`);
  }
});

test("the guard is mounted before the routes, and only bootstrap precedes it", () => {
  const entry = fs.readFileSync(new URL("../index.js", import.meta.url), "utf8");
  const guardAt = entry.indexOf('app.use("/api", requireLocalClient)');
  const routesAt = entry.indexOf('app.use("/api", apiRoutes)');
  assert.ok(guardAt > 0 && routesAt > guardAt, "the routes must be mounted after the guard");

  // Anything answering under /api ahead of the guard has to guard itself. Only the
  // bootstrap does, by checking isLoopbackRequest before handing out the key.
  const earlyMounts = [...entry.slice(0, guardAt).matchAll(/app\.(?:use|get|post|put|delete)\(\s*"(\/api[^"]*)"/g)]
    .map((match) => match[1]);
  assert.deepEqual(earlyMounts, ["/api/bootstrap"]);
  const bootstrap = entry.slice(entry.indexOf('"/api/bootstrap"'), guardAt);
  assert.match(bootstrap, /if \(!isLoopbackRequest\(req\)\)/);
  assert.match(bootstrap, /res\.status\(403\)/);
});

test("the guard exempts exactly the documented paths", async () => {
  const middleware = fs.readFileSync(
    new URL("../middleware/requireLocalClient.js", import.meta.url),
    "utf8",
  );
  assert.match(middleware, /PUBLIC_BOOTSTRAP_PATHS = new Set\(\["\/health"\]\)/);

  for (const exempt of UNAUTHENTICATED_ROUTES) {
    assert.equal(await callWithoutKey(exempt), 200, `${exempt} should answer unauthenticated`);
  }
});

test("a valid key gets through the guard", async () => {
  const app = buildApp();
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/capture/options`, {
      headers: { "x-rtds-dca-local-key": getLocalApiKey() },
    });
    assert.equal(response.status, 200);
  } finally {
    server.close();
  }
});

test("an invalid key is refused, and an empty one is not treated as absent-but-fine", async () => {
  const app = buildApp();
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const { port } = server.address();
    for (const key of ["", " ", "not-the-key", `${getLocalApiKey()}x`]) {
      const response = await fetch(`http://127.0.0.1:${port}/api/profiles`, {
        headers: { "x-rtds-dca-local-key": key },
      });
      assert.equal(response.status, 401, `key ${JSON.stringify(key)} was accepted`);
    }
  } finally {
    server.close();
  }
});

test("only loopback addresses count as local", () => {
  for (const ip of ["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"]) {
    assert.equal(isLoopbackAddress(ip), true, ip);
  }
  for (const ip of ["", null, "10.0.0.1", "192.168.1.20", "127.0.0.1.attacker.tld", "0.0.0.0"]) {
    assert.equal(isLoopbackAddress(ip), false, String(ip));
  }
});

test("an update may not write over the client's data or the install's config", () => {
  for (const protectedPath of [
    "config",
    "config/rtds-profiles.json",
    "config/.local-api-key",
    ".stored-files",
    ".stored-files/audit-Demo-abc.audit-report.json",
    "server/.env",
    "frontend/.env.local",
  ]) {
    assert.equal(isProtectedPath(protectedPath), true, protectedPath);
    assert.equal(isWritablePath(protectedPath), false, protectedPath);
  }

  for (const codePath of ["server/src/index.js", "package.json", "frontend/src/main.jsx"]) {
    assert.equal(isWritablePath(codePath), true, codePath);
  }
});

test("an archive member that tries to escape the app folder is refused", () => {
  for (const escape of [
    "",
    "..",
    "../outside.js",
    "server/../../outside.js",
    "/etc/passwd",
    "C:\\Windows\\System32\\drivers\\etc\\hosts",
    "\\\\server\\share\\file",
    "server/src/\0evil.js",
    "server//src/index.js",
  ]) {
    assert.equal(isSafeArchivePath(escape), false, JSON.stringify(escape));
    assert.equal(isWritablePath(escape), false, JSON.stringify(escape));
  }
});

test("the updater talks to two pinned hosts over https, matched exactly", () => {
  assert.deepEqual([...ALLOWED_HOSTS], ["raw.githubusercontent.com", "codeload.github.com"]);
  assert.equal(isAllowedUrl(MANIFEST_URL), true);
  assert.equal(isAllowedUrl(ARCHIVE_URL), true);

  for (const url of [
    "http://raw.githubusercontent.com/urbanairship/rtds_data_collection/main/package.json",
    "https://evil-codeload.github.com.attacker.tld/x",
    "https://codeload.github.com.attacker.tld/x",
    "https://attacker.tld/codeload.github.com",
    "https://api.github.com/repos/urbanairship/rtds_data_collection",
    "file:///etc/passwd",
    "not a url",
  ]) {
    assert.equal(isAllowedUrl(url), false, url);
  }
});
