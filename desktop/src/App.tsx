import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "./layout/Sidebar";
import Dashboard from "./pages/Dashboard";
import Import from "./pages/Import";
import Placeholder from "./pages/Placeholder";
import Agents from "./pages/Agents";
import Composer from "./pages/Composer";
import Processes from "./pages/Processes";
import Sessions from "./pages/Sessions";
import Updates from "./pages/Updates";
import Logs from "./pages/Logs";
import {
  SecurityPage,
  SettingsPage,
  SourcesPage,
} from "./pages/SystemPages";

export default function App() {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route
            path="/marketplace"
            element={<Placeholder title="Marketplace" phase="Phase 4" />}
          />
          <Route path="/import" element={<Import />} />
          <Route path="/agents" element={<Agents />} />
          <Route
            path="/skills"
            element={<Placeholder title="My Skills" phase="Phase 6" />}
          />
          <Route
            path="/plugins"
            element={<Placeholder title="My Plugins" phase="Phase 3" />}
          />
          <Route path="/bundles" element={<Composer />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/processes" element={<Processes />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/security" element={<SecurityPage />} />
          <Route path="/sources" element={<SourcesPage />} />
          <Route path="/updates" element={<Updates />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
