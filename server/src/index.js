import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { ensureDataDirs } from "./appPaths.js";
import { migrateProfilesEncryption } from "./config.js";
import { requireLocalClient } from "./middleware/requireLocalClient.js";
import apiRoutes from "./routes/api.js";
import { getLocalApiKey, isLoopbackRequest } from "./security/localApiAuth.js";

dotenv.config();

ensureDataDirs();
getLocalApiKey();

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

app.use((error, _req, res, _next) => {
  console.error("[server] unhandled error:", error);
  if (!res.headersSent) {
    res.status(500).json({ ok: false, error: error.message || "Internal server error" });
  }
});

const server = app.listen(port, host, () => {
  console.log("=".repeat(56));
  console.log("  Airship RTDS Data Collection Audit — API");
  console.log(`  http://${host}:${port}`);
  console.log("  Profiles: GET  /api/profiles");
  console.log("  Capture:  GET  /api/capture/stream?profile=...");
  console.log("  Stop:     POST /api/capture/stop");
  console.log("  History:  GET  /api/history");
  console.log("=".repeat(56));
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
