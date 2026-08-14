import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AnyPackage } from "../types";
import { listPackages, reportInstallation, registryBase } from "../api";
import { mapApiPackage } from "../lib/registry";

type Theme = "light" | "dark";

interface AppState {
  theme: Theme;
  toggleTheme: () => void;
  installed: string[];
  isInstalled: (id: string) => boolean;
  install: (id: string, version: string) => void;
  allPackages: AnyPackage[];
  loading: boolean;
  error: string | null;
  registryUrl: string;
  refresh: () => void;
}

const AppContext = createContext<AppState | null>(null);

const LS_THEME = "forge-theme";
const LS_INSTALLED = "forge-installed";

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const q = new URLSearchParams(window.location.search).get("theme");
    if (q === "dark" || q === "light") return q;
    try {
      const saved = localStorage.getItem(LS_THEME);
      if (saved === "dark" || saved === "light") return saved;
    } catch { /* storage unavailable */ }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  const [installed, setInstalled] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(LS_INSTALLED);
      if (raw) return JSON.parse(raw) as string[];
    } catch { /* storage unavailable */ }
    return [];
  });

  // v0.3：真实 Marketplace 数据来自 Registry API（不再有 mock）。
  const [packages, setPackages] = useState<AnyPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    listPackages()
      .then((list) => setPackages(list.map(mapApiPackage)))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(LS_THEME, theme); } catch { /* noop */ }
  }, [theme]);

  useEffect(() => {
    try { localStorage.setItem(LS_INSTALLED, JSON.stringify(installed)); } catch { /* noop */ }
  }, [installed]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }, []);

  const isInstalled = useCallback((id: string) => installed.includes(id), [installed]);

  const install = useCallback((id: string, version: string) => {
    setInstalled((prev) => (prev.includes(id) ? prev : [...prev, id]));
    // 匿名安装上报（幂等；失败不影响本地状态）
    reportInstallation(id, version, crypto.randomUUID()).catch(() => { /* noop */ });
  }, []);

  const value = useMemo<AppState>(
    () => ({ theme, toggleTheme, installed, isInstalled, install, allPackages: packages, loading, error, registryUrl: registryBase(), refresh }),
    [theme, toggleTheme, installed, isInstalled, install, packages, loading, error, refresh]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
