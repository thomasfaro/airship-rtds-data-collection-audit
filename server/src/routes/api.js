import { Router } from "express";
import { runningVersion } from "../version.js";
import captureRoutes from "./capture.js";
import historyRoutes from "./history.js";
import profileRoutes from "./profiles.js";
import streamRoutes from "./stream.js";
import updateRoutes from "./updates.js";
import valueRoutes from "./values.js";

const router = Router();

/**
 * Unauthenticated on purpose: the launchers, the offline page and the recovery button
 * all use it to answer "is the server up". The version rides along so anyone can tell
 * which build answered, including from a terminal.
 */
router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "rtds-data-collection-audit",
    version: runningVersion(),
  });
});

router.use("/profiles", profileRoutes);
router.use("/capture", captureRoutes);
router.use("/stream", streamRoutes);
router.use("/values", valueRoutes);
router.use("/history", historyRoutes);
router.use("/updates", updateRoutes);

export default router;
