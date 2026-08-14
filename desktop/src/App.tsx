import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "./layout/Sidebar";
import Dashboard from "./pages/Dashboard";
import Placeholder from "./pages/Placeholder";

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
          <Route
            path="/import"
            element={<Placeholder title="GitHub Import" phase="Phase 4" />}
          />
          <Route
            path="/agents"
            element={<Placeholder title="My Agents" phase="Phase 6" />}
          />
          <Route
            path="/skills"
            element={<Placeholder title="My Skills" phase="Phase 6" />}
          />
          <Route
            path="/plugins"
            element={<Placeholder title="My Plugins" phase="Phase 3" />}
          />
          <Route
            path="/bundles"
            element={<Placeholder title="Bundles" phase="Phase 6" />}
          />
          <Route
            path="/sessions"
            element={<Placeholder title="Sessions" phase="Phase 7" />}
          />
          <Route
            path="/processes"
            element={<Placeholder title="Processes" phase="Phase 7" />}
          />
          <Route
            path="/logs"
            element={<Placeholder title="Logs" phase="Phase 7" />}
          />
          <Route
            path="/security"
            element={<Placeholder title="Security" phase="Phase 8" />}
          />
          <Route
            path="/sources"
            element={<Placeholder title="Sources" phase="Phase 8" />}
          />
          <Route
            path="/updates"
            element={<Placeholder title="Updates" phase="Phase 8" />}
          />
          <Route
            path="/settings"
            element={<Placeholder title="Settings" phase="Phase 8" />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
