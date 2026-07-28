import { useEffect, useState } from "react";
import CaptureForm from "../components/capture/CaptureForm.jsx";
import CaptureProgressPanel from "../components/capture/CaptureProgressPanel.jsx";
import CoverageSummary from "../components/summary/CoverageSummary.jsx";
import { useCaptureSession } from "../contexts/CaptureSessionContext.jsx";
import { readLastProfile, useProfiles } from "../contexts/ProfilesContext.jsx";
import { fetchCaptureOptions } from "../services/captureApi.js";

const DEFAULT_SETTINGS = {
  profile: "",
  timezone: "Europe/Paris",
  stopMode: "realtime",
  realtimePreset: "thorough",
  startPosition: "earliest",
  windowHours: null,
};

export default function CapturePage() {
  const { names, loading: profilesLoading } = useProfiles();
  const { active, stopping, settings: runningSettings, status, progress, error, errorHint, report, start, stop, reset } =
    useCaptureSession();

  const [settings, setSettings] = useState(() => ({
    ...DEFAULT_SETTINGS,
    timezone:
      Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_SETTINGS.timezone,
    profile: readLastProfile(),
  }));
  const [windowHoursOptions, setWindowHoursOptions] = useState([]);

  useEffect(() => {
    fetchCaptureOptions()
      .then((payload) => setWindowHoursOptions(payload.windowHours ?? []))
      .catch(() => setWindowHoursOptions([]));
  }, []);

  // Drop a remembered project that no longer exists in the profiles file.
  useEffect(() => {
    if (profilesLoading || !settings.profile) return;
    if (!names.includes(settings.profile)) {
      setSettings((previous) => ({ ...previous, profile: "" }));
    }
  }, [names, profilesLoading, settings.profile]);

  if (active) {
    return (
      <CaptureProgressPanel
        profile={runningSettings?.profile ?? settings.profile}
        stopMode={runningSettings?.stopMode ?? settings.stopMode}
        status={status}
        progress={progress}
        stopping={stopping}
        onStop={stop}
      />
    );
  }

  if (report) {
    return <CoverageSummary report={report} onNewCapture={reset} />;
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-airship-navy">Data collection audit</h1>
        <p className="mt-1 text-sm text-airship-muted">
          Capture a tracking-only RTDS stream and generate the tagging plan.
        </p>
      </header>

      {error ? (
        <div className="alert-warning">
          <p className="font-semibold">{error}</p>
          {errorHint ? <p className="mt-1">{errorHint}</p> : null}
        </div>
      ) : null}

      {status && !active ? <p className="text-sm text-airship-body">{status}</p> : null}

      <CaptureForm
        profileNames={names}
        profilesLoading={profilesLoading}
        windowHoursOptions={windowHoursOptions}
        settings={settings}
        onChange={setSettings}
        onSubmit={() => start(settings)}
        disabled={active}
      />
    </div>
  );
}
