import { Router } from "express";
import captureRoutes from "./capture.js";
import historyRoutes from "./history.js";
import profileRoutes from "./profiles.js";
import valueRoutes from "./values.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "rtds-data-collection-audit" });
});

router.use("/profiles", profileRoutes);
router.use("/capture", captureRoutes);
router.use("/values", valueRoutes);
router.use("/history", historyRoutes);

export default router;
