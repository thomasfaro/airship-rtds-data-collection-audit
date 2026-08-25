import { useEffect, useState } from "react";
import { APP_LAUNCH_URL, pingServer, waitForServer } from "../lib/serverControl.js";

/**
 * Sits inside an error message and answers the question it raises: is the tool
 * itself still running? When it is, this renders nothing — a token or RTDS error has
 * nothing to do with the server, and offering to restart it would only mislead.
 *
 * When it is not, the offer is a plain link to the rtds-audit:// handler, because
 * only a real click may launch an external application. The page then polls the port
 * and reloads itself, since everything it was showing died with the server.
 */
export default function ServerRecovery() {
  const [down, setDown] = useState(false);
  const [phase, setPhase] = useState("idle");

  useEffect(() => {
    let cancelled = false;
    pingServer().then((reachable) => {
      if (!cancelled) setDown(!reachable);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!down) return null;

  return (
    <div className="mt-3 border-t border-amber-200 pt-3">
      <p>
        The tool is no longer running on this machine, which is why the capture stopped. Nothing
        else was lost: your projects and saved audits are on disk.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <a
          className="btn-primary"
          href={APP_LAUNCH_URL}
          onClick={() => {
            setPhase("starting");
            waitForServer().then((up) => {
              if (up) window.location.reload();
              else setPhase("failed");
            });
          }}
        >
          {phase === "starting" ? "Starting…" : "Start the tool again"}
        </a>
        {phase === "starting" && (
          <p className="text-xs" role="status" aria-live="polite">
            Waiting for it to answer, then this page reloads on its own. A first start also
            installs and builds, which takes a minute.
          </p>
        )}
      </div>
      {phase === "failed" && (
        <p className="mt-2 text-xs">
          It still is not answering. Start it by hand: double-click{" "}
          <code>Start RTDS Data Collection Audit.command</code> in the app folder, or the{" "}
          <code>.bat</code> of the same name on Windows.
        </p>
      )}
    </div>
  );
}
