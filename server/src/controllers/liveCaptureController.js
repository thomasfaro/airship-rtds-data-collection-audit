import { getLiveStream } from "../live/streamRegistry.js";
import { readLiveCaptureEvents } from "../live/readLiveCapture.js";

export async function getLiveStreamCaptureHandler(req, res) {
  const streamId = String(req.query.stream_id ?? "").trim();
  if (!streamId) {
    res.status(400).json({ ok: false, error: "stream_id is required" });
    return;
  }

  const entry = getLiveStream(streamId);
  if (!entry?.filePath) {
    res.status(404).json({ ok: false, error: "Live stream not found or capture file unavailable" });
    return;
  }

  const afterLines = Number.parseInt(String(req.query.after_lines ?? "0"), 10);
  const safeAfter = Number.isFinite(afterLines) && afterLines >= 0 ? afterLines : 0;

  try {
    const capture = await readLiveCaptureEvents(entry.filePath, { afterLines: safeAfter });
    res.json({
      ok: true,
      streamId,
      profile: entry.profileName,
      ...capture,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Failed to read live capture" });
  }
}
