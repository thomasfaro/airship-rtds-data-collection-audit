import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { auditProgressStatusText } from "../lib/audit/auditProgress.js";
import { hydrateAuditReport } from "../lib/audit/hydrateAuditReport.js";
import { runDataCollectionCapture, stopCapture } from "../services/captureApi.js";
import { writeLastProfile } from "./ProfilesContext.jsx";

const CaptureSessionContext = createContext(null);

const IDLE_PROGRESS = {
  phase: "download",
  linesWritten: 0,
  elapsedLabel: "0s",
  coverage: { keys: { customEvents: 0, attributes: 0, tags: 0, screens: 0, subscriptionLists: 0, total: 0 } },
};

export function CaptureSessionProvider({ children }) {
  const stopStreamRef = useRef(null);
  const userStoppedRef = useRef(false);

  const [active, setActive] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const [errorHint, setErrorHint] = useState("");
  const [report, setReport] = useState(null);

  const reset = useCallback(() => {
    stopStreamRef.current?.();
    stopStreamRef.current = null;
    setActive(false);
    setStopping(false);
    setProgress(null);
    setStatus("");
    setError("");
    setErrorHint("");
    setReport(null);
  }, []);

  const start = useCallback((nextSettings) => {
    if (!nextSettings?.profile) return;

    userStoppedRef.current = false;
    stopStreamRef.current?.();
    writeLastProfile(nextSettings.profile);

    setActive(true);
    setStopping(false);
    setSettings(nextSettings);
    setError("");
    setErrorHint("");
    setReport(null);
    setProgress({ ...IDLE_PROGRESS, ...nextSettings });
    setStatus("Connecting to RTDS…");

    stopStreamRef.current = runDataCollectionCapture({
      ...nextSettings,
      onStatus: (payload) => setStatus(payload.message || "Capturing…"),
      onProgress: (payload) => {
        setProgress((previous) => ({ ...previous, ...payload }));
        if (payload.reconnectMessage) {
          setStatus(payload.reconnectMessage);
          return;
        }
        if (payload.phase && payload.phase !== "download") {
          const text = auditProgressStatusText(payload);
          if (text) setStatus(text);
        }
      },
      onComplete: (result) => {
        setActive(false);
        setStopping(false);
        setProgress(null);
        setStatus("Opening the coverage summary…");
        hydrateAuditReport(result).then((hydrated) => {
          startTransition(() => {
            setReport(hydrated);
            setStatus("");
          });
        });
      },
      onError: (err) => {
        setActive(false);
        setStopping(false);
        setProgress(null);
        setStatus("");
        setError(err.message);
        setErrorHint(err.causeHint || err.detail || "");
      },
    });
  }, []);

  const stop = useCallback(async () => {
    if (!settings?.profile) return;
    userStoppedRef.current = true;
    setStopping(true);
    setStatus("Stopping the capture, building the tagging plan…");
    try {
      await stopCapture(settings.profile);
    } catch (err) {
      setError(err.message);
      setActive(false);
      setStopping(false);
    }
  }, [settings]);

  const openReport = useCallback((nextReport) => {
    setReport(nextReport);
    setError("");
    setErrorHint("");
    setStatus("");
  }, []);

  const value = useMemo(
    () => ({
      active,
      stopping,
      settings,
      status,
      progress,
      error,
      errorHint,
      report,
      start,
      stop,
      reset,
      openReport,
      clearError: () => {
        setError("");
        setErrorHint("");
      },
    }),
    [active, stopping, settings, status, progress, error, errorHint, report, start, stop, reset, openReport],
  );

  return <CaptureSessionContext.Provider value={value}>{children}</CaptureSessionContext.Provider>;
}

export function useCaptureSession() {
  const context = useContext(CaptureSessionContext);
  if (!context) {
    throw new Error("useCaptureSession must be used inside a CaptureSessionProvider");
  }
  return context;
}
