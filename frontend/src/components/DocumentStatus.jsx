import { useEffect } from "react";
import { useCaptureSession } from "../contexts/CaptureSessionContext.jsx";
import { TAB_ICONS, captureTabStatus } from "../lib/tabStatus.js";

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
 * Mirrors the capture session into the browser tab (title + favicon) so a capture
 * left running in a background tab can be followed without switching to it.
 * Renders nothing.
 */
export default function DocumentStatus() {
  const { active, stopping, progress, status, report, error } = useCaptureSession();
  const { title, state } = captureTabStatus({ active, stopping, progress, status, report, error });

  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    iconLink().href = TAB_ICONS[state];
  }, [state]);

  return null;
}
