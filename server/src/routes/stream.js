import { Router } from "express";
import { releaseLiveStreamHandler } from "../controllers/liveCacheController.js";
import { getLiveStreamCaptureHandler } from "../controllers/liveCaptureController.js";
import { streamRtdsEvents } from "../controllers/rtdsController.js";
import { runLiveSse } from "../live/runLiveSse.js";
import { validateTimezone } from "../utils/timezone.js";
import { endSseError, initSseResponse } from "../utils/sse.js";

const router = Router();

router.delete("/cache", releaseLiveStreamHandler);
router.get("/capture", getLiveStreamCaptureHandler);

router.get("/", async (req, res) => {
  try {
    validateTimezone(req.query.timezone);
  } catch (error) {
    endSseError(res, error.message);
    return;
  }

  const profileName = req.query.profile;
  if (!profileName) {
    endSseError(res, "No project selected (profile query param)");
    return;
  }

  initSseResponse(res);
  await runLiveSse(req, res, profileName, (ctx) => streamRtdsEvents(req.query, ctx));
});

export default router;
