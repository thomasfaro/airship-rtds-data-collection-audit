import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useCaptureSession } from "../contexts/CaptureSessionContext.jsx";
import { useLiveStreamOptional } from "../contexts/LiveStreamContext.jsx";
import { fetchAppVersion } from "../services/updatesApi.js";
import InstallAppButton from "./InstallAppButton.jsx";

const LINKS = [
  { to: "/", label: "Data collection audit", end: true },
  { to: "/live", label: "Live stream", end: false },
  { to: "/history", label: "History", end: true },
  { to: "/settings", label: "Projects", end: true },
];

function navClass({ isActive }) {
  return [
    "rounded-pill px-3 py-1.5 text-sm font-medium transition",
    isActive
      ? "bg-airship-blue-light text-airship-blue-dark"
      : "text-airship-muted hover:bg-airship-surface-muted hover:text-airship-navy",
  ].join(" ");
}

export default function AppNav() {
  const { active } = useCaptureSession();
  const live = useLiveStreamOptional();
  const liveActive = Boolean(live?.isLive);
  const [version, setVersion] = useState(null);

  /*
   * Comes from the server rather than the build, so it answers the question people
   * actually ask: which version is running right now. A rebuilt interface talking to
   * an older server would otherwise report the wrong one.
   */
  useEffect(() => {
    let cancelled = false;
    fetchAppVersion()
      .then((next) => {
        if (!cancelled) setVersion(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * The wordmark doubles as the reload button, because an installed app window has no
   * address bar and therefore no reload of its own. With the server down the reload
   * lands on the fallback page, which offers to start it back up.
   *
   * A capture cannot survive a reload — the stream it is feeding ends with the page —
   * so a run in progress gets a confirmation. Losing three hours of capture to a
   * stray click on the logo would be an expensive lesson.
   */
  function reload() {
    if (active || liveActive) {
      const parts = [];
      if (active) parts.push("a capture");
      if (liveActive) parts.push("a live stream");
      if (
        !window.confirm(
          `Reloading ends ${parts.join(" and ")} and loses progress. Reload?`,
        )
      ) {
        return;
      }
    }
    window.location.reload();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-airship-border bg-airship-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 md:px-6">
        <button
          type="button"
          onClick={reload}
          title="Reload the app"
          aria-label="Reload the app"
          className="-mx-1 flex items-baseline gap-2 rounded-airship px-1 text-left transition hover:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-airship-blue"
        >
          <span className="logo-wordmark">Airship</span>
        </button>
        <nav className="flex items-center gap-1">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className={navClass}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {version?.version && (
            <span
              className="text-xs font-medium text-airship-muted-light"
              title={
                version.commit
                  ? `Commit ${version.commit}${version.commitDate ? ` — ${version.commitDate.slice(0, 10)}` : ""}`
                  : undefined
              }
            >
              v{version.version}
            </span>
          )}
          {active ? (
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-teal-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-airship-seafoam" />
              Capture running
            </span>
          ) : null}
          {liveActive ? (
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-teal-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-airship-seafoam" />
              Live · {(live.displayEventCount ?? 0).toLocaleString("en-US")} events
            </span>
          ) : null}
          <InstallAppButton />
        </div>
      </div>
    </header>
  );
}
