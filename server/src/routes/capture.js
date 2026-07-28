import { Router } from "express";
import { runDataCollectionCapture } from "../controllers/captureController.js";
import { stopAuditDownload, unregisterAuditSession } from "../audit/sessionRegistry.js";
import { resolveCaptureOptions, REALTIME_THRESHOLDS } from "../capture/captureOptions.js";
import { AUDIT_WINDOW_HOURS } from "../audit/auditWindow.js";
import { TAGGING_PLAN_RTDS_TYPES } from "../audit/registry.js";
import { endSseError, pipeSseGenerator } from "../utils/sse.js";
import { validateTimezone } from "../utils/timezone.js";

const router = Router();

/** Everything the capture form needs to render its choices. */
router.get("/options", (_req, res) => {
  res.json({
    stopModes: [
      {
        id: "manual",
        label: "Manual stop",
        description: "The capture runs until you click Stop. Works for every project.",
      },
      {
        id: "realtime",
        label: "Real-time auto-stop",
        description:
          "Stops on its own once no new tracking keys appear. Only for projects that send data in real time — never for daily API batches.",
      },
    ],
    startPositions: [
      {
        id: "earliest",
        label: "Earliest available",
        description: "Replays the RTDS backlog first, so coverage builds up much faster.",
      },
      {
        id: "latest",
        label: "New events only",
        description: "Starts at the live edge of the stream and ignores the backlog.",
      },
    ],
    realtimeThresholds: REALTIME_THRESHOLDS,
    windowHours: AUDIT_WINDOW_HOURS,
    trackedEventTypes: TAGGING_PLAN_RTDS_TYPES,
  });
});

router.post("/stop", (req, res) => {
  const profile = req.query.profile ?? req.body?.profile;
  if (!profile) {
    res.status(400).json({ ok: false, error: "profile is required" });
    return;
  }
  res.json({ ok: true, stopped: stopAuditDownload(profile) });
});

router.get("/stream", async (req, res) => {
  try {
    validateTimezone(req.query.timezone);
    resolveCaptureOptions(req.query);
  } catch (error) {
    endSseError(res, error.message);
    return;
  }

  const downloadAbort = new AbortController();
  const analyzeAbort = new AbortController();

  req.on("close", () => {
    downloadAbort.abort();
    analyzeAbort.abort();
    if (req.query.profile) {
      unregisterAuditSession(String(req.query.profile));
    }
  });

  await pipeSseGenerator(
    req,
    res,
    runDataCollectionCapture(req.query, {
      downloadSignal: downloadAbort.signal,
      analyzeSignal: analyzeAbort.signal,
      downloadAbort,
    }),
  );
});

export default router;
