import { cleanupLiveStream, cleanupLiveStreamsForProfile } from "../live/streamRegistry.js";

export function releaseLiveStreamHandler(req, res) {
  const streamId = String(req.query.stream_id ?? "").trim();
  const profile = String(req.query.profile ?? "").trim();

  if (streamId) {
    const result = cleanupLiveStream(streamId);
    res.json({
      ok: true,
      streamId,
      fileDeleted: result.deleted,
    });
    return;
  }

  if (profile) {
    const activeCleaned = cleanupLiveStreamsForProfile(profile);
    res.json({ ok: true, activeCleaned });
    return;
  }

  res.status(400).json({ ok: false, error: "stream_id or profile is required" });
}
