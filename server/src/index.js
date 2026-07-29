import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { ensureDataDirs, repoRoot } from "./appPaths.js";
import { migrateProfilesEncryption } from "./config.js";
import { requireLocalClient } from "./middleware/requireLocalClient.js";
import apiRoutes from "./routes/api.js";
import { getLocalApiKey, isLoopbackRequest } from "./security/localApiAuth.js";
import { refreshRemote } from "./updates/updateService.js";
import { runningVersion, versionLabel } from "./version.js";

dotenv.config();

ensureDataDirs();
getLocalApiKey();

// Pin the version now, while the folder still holds the code we just loaded. An
// update pulled later moves the folder on, and the difference is what tells the UI a
// restart is due.
runningVersion();

try {
  const { migrated } = migrateProfilesEncryption();
  if (migrated) {
    console.log("[config] Encrypted RTDS profile tokens at rest.");
  }
} catch (error) {
  console.warn(`[config] Skipped token encryption migration: ${error.message}`);
}

const port = Number(process.env.PORT || 3011);
const host = process.env.HOST || "127.0.0.1";
const corsOrigin =
  process.env.CORS_ORIGIN || ["http://localhost:5183", "http://127.0.0.1:5183"];

const app = express();

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

app.get("/api/bootstrap", (req, res) => {
  if (!isLoopbackRequest(req)) {
    res.status(403).json({ ok: false, error: "Bootstrap is only available on localhost." });
    return;
  }
  res.json({ ok: true, localApiKey: getLocalApiKey(), localOnly: true, dataStoredLocally: true });
});

app.use("/api", requireLocalClient);
app.use("/api", apiRoutes);

/**
 * Serve the production build when it exists, so `npm run build && npm start`
 * gives the whole app on one port. In dev the UI is served by Vite instead.
 */
const uiDir = process.env.RTDS_DCA_UI_DIR
  ? path.resolve(process.env.RTDS_DCA_UI_DIR)
  : path.join(repoRoot, "frontend", "dist");
const uiBuilt = fs.existsSync(path.join(uiDir, "index.html"));

if (uiBuilt) {
  app.use(express.static(uiDir));
  // The UI routes on the hash, so every non-API path resolves to index.html.
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(uiDir, "index.html"));
  });
}

app.use((error, _req, res, _next) => {
  console.error("[server] unhandled error:", error);
  if (!res.headersSent) {
    res.status(500).json({ ok: false, error: error.message || "Internal server error" });
  }
});

const server = app.listen(port, host, () => {
  console.log("=".repeat(56));
  console.log(`  Airship RTDS Data Collection Audit ${versionLabel()}`);
  if (uiBuilt) {
    console.log(`  App + API: http://${host}:${port}`);
  } else {
    console.log(`  API only:  http://${host}:${port}`);
    console.log("  No UI build found — run `npm run build`, or `npm run dev` for Vite.");
  }
  console.log("  Profiles: GET  /api/profiles");
  console.log("  Capture:  GET  /api/capture/stream?profile=...");
  console.log("  Stop:     POST /api/capture/stop");
  console.log("  History:  GET  /api/history");
  console.log("=".repeat(56));

  // Warm the update check in the background, so the first thing the UI asks already
  // has an answer. Failures are the normal case offline and stay silent.
  setTimeout(() => {
    refreshRemote().catch(() => {});
  }, 5_000).unref();
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `[server] Port ${port} is already in use on ${host}. Stop the other process or run: lsof -ti :${port} | xargs kill`,
    );
    process.exit(1);
  }
  throw error;
});
