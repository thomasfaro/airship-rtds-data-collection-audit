import { useCallback, useEffect, useState } from "react";
import { useCaptureSession } from "../contexts/CaptureSessionContext.jsx";
import { waitForRestart } from "../lib/serverControl.js";
import { updateNotice } from "../lib/updateNotice.js";
import { applyUpdate, fetchUpdateStatus, requestRestart } from "../services/updatesApi.js";

/** Nobody needs to be told about versions more often than this. */
const POLL_MS = 30 * 60 * 1_000;

/**
 * The only place the tool ever mentions its own version unprompted.
 *
 * It appears in two situations and stays out of the way otherwise: an update is
 * already on disk and only a restart is missing, or a newer one exists and can be
 * fetched in one click. Everything else — no git, no network, up to date — renders
 * nothing at all, because a permanent banner over an audit is just noise.
 *
 * Both actions end the same way: the server hands over to a fresh copy of itself and
 * this page reloads onto it. A capture cannot survive that, so a run in progress gets
 * a confirmation first.
 */
export default function UpdateBanner() {
  const { active } = useCaptureSession();
  const [status, setStatus] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchUpdateStatus()
        .then((next) => {
          if (!cancelled) setStatus(next);
        })
        // Not knowing is the normal state offline, and not worth a word on screen.
        .catch(() => {});
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const notice = updateNotice(status);

  const handOver = useCallback(async () => {
    setPhase("restarting");
    await requestRestart();
    const back = await waitForRestart();
    if (back) {
      window.location.reload();
    } else {
      setPhase("failed");
    }
  }, []);

  const run = useCallback(
    async (action) => {
      if (
        active &&
        !window.confirm("A capture is running. Restarting ends it and loses its progress. Continue?")
      ) {
        return;
      }
      setError(null);
      try {
        if (action === "apply") {
          setPhase("updating");
          await applyUpdate();
        }
        await handOver();
      } catch (cause) {
        setError(cause.message);
        setPhase("idle");
      }
    },
    [active, handOver],
  );

  if (!notice || dismissed) {
    return null;
  }

  const busy = phase === "updating" || phase === "restarting";

  return (
    <div className="alert-info mb-6" role="status" aria-live="polite">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="min-w-[16rem] flex-1">
          <p className="font-semibold">{notice.title}</p>
          <p className="mt-1">{notice.detail}</p>
          {error && <p className="mt-2 font-semibold text-airship-danger">{error}</p>}
          {phase === "failed" && (
            <p className="mt-2">
              The server did not come back on its own. Double-click{" "}
              <code>Start RTDS Data Collection Audit.command</code> in the app folder, or the{" "}
              <code>.bat</code> of the same name on Windows.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {notice.action && (
            <button type="button" className="btn-primary" disabled={busy} onClick={() => run(notice.action)}>
              {phase === "updating" ? "Updating…" : phase === "restarting" ? "Restarting…" : notice.actionLabel}
            </button>
          )}
          {!busy && (
            <button type="button" className="btn-ghost" onClick={() => setDismissed(true)}>
              Later
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
