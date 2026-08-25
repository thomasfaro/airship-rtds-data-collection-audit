import { Router } from "express";
import { applyUpdate, getUpdateStatus, scheduleRestart } from "../updates/updateService.js";

const router = Router();

/** What the UI polls to decide whether to show a banner. `?force=1` skips the cache. */
router.get("/", async (req, res) => {
  try {
    res.json(await getUpdateStatus({ force: req.query.force === "1" }));
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Could not check for updates." });
  }
});

/** Fast-forward onto the latest commit. The caller restarts afterwards. */
router.post("/apply", async (_req, res) => {
  try {
    const result = await applyUpdate();
    // 409: nothing broke, the folder is simply in a state we refuse to touch.
    res.status(result.ok ? 200 : 409).json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Could not apply the update." });
  }
});

/**
 * Hand over to a fresh server. Answers before dying, so the UI knows to start waiting
 * for the replacement instead of treating the dropped connection as a failure.
 */
router.post("/restart", (_req, res) => {
  const result = scheduleRestart();
  if (!result.ok) {
    res.status(500).json({ ok: false, error: result.error });
    return;
  }
  res.status(202).json({ ok: true, restarting: true });
});

export default router;
