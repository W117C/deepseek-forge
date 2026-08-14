import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "./layout/Sidebar";
import Dashboard from "./pages/Dashboard";
import Import from "./pages/Import";
import Placeholder from "./pages/Placeholder";
import Agents from "./pages/Agents";
import Composer from "./pages/Composer";
import Marketplace from "./pages/Marketplace";
import PackageDetail from "./pages/PackageDetail";
import Plugins from "./pages/Plugins";
import Processes from "./pages/Processes";
import Sessions from "./pages/Sessions";
import Updates from "./pages/Updates";
import Logs from "./pages/Logs";
import {
  SecurityPage,
  SettingsPage,
  SourcesPage,
} from "./pages/SystemPages";
import CommandPalette from "./components/CommandPalette";
import { useI18n } from "./i18n";

export default function App() {
  const { t } = useI18n();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/import" element={<Import />} />
          <Route path="/agents" element={<Agents />} />
          <Route
            path="/skills"
            element={<Placeholder title={t("nav.skills")} />}
          />
          <Route path="/plugins" element={<Plugins />} />
          <Route path="/plugins/:id" element={<PackageDetail />} />
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
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
