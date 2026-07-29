import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import AppNav from "./components/AppNav.jsx";
import DocumentStatus from "./components/DocumentStatus.jsx";
import UpdateBanner from "./components/UpdateBanner.jsx";
import { CaptureSessionProvider } from "./contexts/CaptureSessionContext.jsx";
import { ProfilesProvider } from "./contexts/ProfilesContext.jsx";
import CapturePage from "./pages/CapturePage.jsx";
import HistoryPage from "./pages/HistoryPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";

export default function App() {
  return (
    <HashRouter>
      <ProfilesProvider>
        <CaptureSessionProvider>
          <DocumentStatus />
          <div className="app-shell">
            <AppNav />
            <main className="page-container max-w-5xl">
              <UpdateBanner />
              <Routes>
                <Route path="/" element={<CapturePage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </CaptureSessionProvider>
      </ProfilesProvider>
    </HashRouter>
  );
}
