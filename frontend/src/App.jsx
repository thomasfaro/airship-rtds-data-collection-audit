import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import AppNav from "./components/AppNav.jsx";
import DocumentStatus from "./components/DocumentStatus.jsx";
import UpdateBanner from "./components/UpdateBanner.jsx";
import { CaptureSessionProvider } from "./contexts/CaptureSessionContext.jsx";
import { LiveStreamProvider } from "./contexts/LiveStreamContext.jsx";
import { ProfilesProvider } from "./contexts/ProfilesContext.jsx";
import CapturePage from "./pages/CapturePage.jsx";
import HistoryPage from "./pages/HistoryPage.jsx";
import LiveMonitorPage from "./pages/LiveMonitorPage.jsx";
import LivePage from "./pages/LivePage.jsx";
import LiveSetupPage from "./pages/LiveSetupPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";

function AppShell() {
  const location = useLocation();
  const wide = location.pathname.startsWith("/live/monitor");

  return (
    <div className="app-shell">
      <AppNav />
      <main className={wide ? "page-container-dense" : "page-container max-w-5xl"}>
        <UpdateBanner />
        <Routes>
          <Route path="/" element={<CapturePage />} />
          <Route path="/live" element={<LivePage />}>
            <Route index element={<LiveSetupPage />} />
            <Route path="monitor" element={<LiveMonitorPage />} />
          </Route>
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <ProfilesProvider>
        <CaptureSessionProvider>
          <LiveStreamProvider>
            <DocumentStatus />
            <AppShell />
          </LiveStreamProvider>
        </CaptureSessionProvider>
      </ProfilesProvider>
    </HashRouter>
  );
}
