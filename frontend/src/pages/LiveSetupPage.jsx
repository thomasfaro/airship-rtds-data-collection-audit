import { Link } from "react-router-dom";
import StreamFilter from "../components/StreamFilter.jsx";
import { useCaptureSession } from "../contexts/CaptureSessionContext.jsx";
import { useLiveStream } from "../contexts/LiveStreamContext.jsx";
import { APP_ROUTES } from "../lib/appNav.js";

export default function LiveSetupPage() {
  const {
    profiles,
    profileItems,
    decryptFailures,
    filters,
    setFilters,
    streamEventTypeOptions,
    isLive,
    startAndMonitor,
  } = useLiveStream();
  const capture = useCaptureSession();

  const hasUsableProfiles = profiles.length > 0;
  const captureOnSameProject =
    capture.active && capture.settings?.profile && capture.settings.profile === filters.profile;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-airship-navy">Live stream</h1>
        <p className="mt-1 text-sm text-airship-muted">
          Watch RTDS events as they arrive. Optional filters go to Airship; the monitor can narrow
          the list further without restarting.
        </p>
      </header>

      {isLive ? (
        <p className="alert-info">
          A stream is already running.{" "}
          <Link className="font-semibold text-airship-blue hover:underline" to={APP_ROUTES.liveMonitor}>
            Go to monitor →
          </Link>
        </p>
      ) : null}

      {captureOnSameProject ? (
        <p className="alert-warning">
          A data collection audit is already capturing this project. You can still start a live
          stream, but both will consume the same RTDS token.
        </p>
      ) : null}

      {!hasUsableProfiles && profileItems.length === 0 ? (
        <p className="alert-warning">
          No projects configured. Add credentials on the Projects screen.
        </p>
      ) : null}

      {!hasUsableProfiles && profileItems.length > 0 ? (
        <p className="alert-warning">
          {decryptFailures > 0
            ? `${decryptFailures} saved project${decryptFailures > 1 ? "s" : ""} need a token re-entered in Projects before Live can connect.`
            : "No project with a valid RTDS token. Add or update credentials in Projects."}{" "}
          <Link className="font-semibold text-airship-blue hover:underline" to={APP_ROUTES.settings}>
            Open Projects →
          </Link>
        </p>
      ) : null}

      <StreamFilter
        filters={filters}
        profiles={profiles}
        profileItems={profileItems}
        eventTypeOptions={streamEventTypeOptions}
        onChange={setFilters}
        onStart={startAndMonitor}
        onStop={() => {}}
        onClear={() => {}}
        isLive={isLive}
        disableStart={!hasUsableProfiles}
        liveOnly
        showStopClear={false}
      />
    </div>
  );
}
