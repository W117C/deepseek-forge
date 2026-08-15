import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import Sidebar from "./layout/Sidebar";
import Titlebar from "./layout/Titlebar";
import Dashboard from "./pages/Dashboard";
import Import from "./pages/Import";
import Skills from "./pages/Skills";
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
import { DialogProvider, ToastProvider } from "./components/ui";

export default function App() {
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    // Native macOS traffic lights overlay the webview under Tauri's Overlay
    // titlebar; on other platforms we draw the decorative dots ourselves.
    const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform ?? "");
    document.body.classList.toggle("is-mac", isMac);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      // ⌘1..⌘4 quick navigation (keyboard-first workspace)
      if (e.altKey || e.shiftKey) return;
      const target: Record<string, string> = {
        "1": "/",
        "2": "/marketplace",
        "3": "/plugins",
        "4": "/agents",
      };
      if (target[k]) {
        e.preventDefault();
        navigate(target[k]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <ToastProvider>
      <DialogProvider>
        <div className="app-shell">
          <Titlebar onOpenPalette={() => setPaletteOpen(true)} />
          <Sidebar />
          <main className="app-main">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/marketplace" element={<Marketplace />} />
              <Route path="/import" element={<Import />} />
              <Route path="/agents" element={<Agents />} />
              <Route path="/skills" element={<Skills />} />
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
          <CommandPalette
            open={paletteOpen}
            onClose={() => setPaletteOpen(false)}
          />
        </div>
      </DialogProvider>
    </ToastProvider>
  );
}
