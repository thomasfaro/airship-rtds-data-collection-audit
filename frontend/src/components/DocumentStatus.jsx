import { useEffect } from "react";
import { useCaptureSession } from "../contexts/CaptureSessionContext.jsx";
import { useLiveStreamOptional } from "../contexts/LiveStreamContext.jsx";
import { TAB_ICONS, sessionTabStatus } from "../lib/tabStatus.js";

function iconLink() {
  let link = document.querySelector("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    document.head.append(link);
  }
  return link;
}

/**
 * Mirrors the capture or live session into the browser tab (title + favicon)
 * so a run left in a background tab can be followed without switching to it.
 * Renders nothing.
 */
export default function DocumentStatus() {
  const { active, stopping, progress, status, report, error } = useCaptureSession();
  const live = useLiveStreamOptional();
  const { title, state } = sessionTabStatus({
    capture: { active, stopping, progress, status, report, error },
    live: live
      ? { isLive: live.isLive, eventCount: live.displayEventCount }
      : undefined,
  });

  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    iconLink().href = TAB_ICONS[state];
  }, [state]);

  return null;
}
