import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AnyPackage } from "../types";
import { packages as mockPackages } from "../data/mock";

type Theme = "light" | "dark";

interface AppState {
  theme: Theme;
  toggleTheme: () => void;
  installed: string[];
  isInstalled: (id: string) => boolean;
  install: (id: string) => void;
  published: AnyPackage[];
  publishPackage: (pkg: AnyPackage) => void;
  allPackages: AnyPackage[];
}

const AppContext = createContext<AppState | null>(null);

const LS_THEME = "forge-theme";
const LS_INSTALLED = "forge-installed";
const LS_PUBLISHED = "forge-published";

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

  const [published, setPublished] = useState<AnyPackage[]>(() => {
    try {
      const raw = localStorage.getItem(LS_PUBLISHED);
      if (raw) return JSON.parse(raw) as AnyPackage[];
    } catch { /* storage unavailable */ }
    return [];
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(LS_THEME, theme); } catch { /* noop */ }
  }, [theme]);

  useEffect(() => {
    try { localStorage.setItem(LS_INSTALLED, JSON.stringify(installed)); } catch { /* noop */ }
  }, [installed]);

  useEffect(() => {
    try { localStorage.setItem(LS_PUBLISHED, JSON.stringify(published)); } catch { /* noop */ }
  }, [published]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }, []);

  const isInstalled = useCallback((id: string) => installed.includes(id), [installed]);

  const install = useCallback((id: string) => {
    setInstalled((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const publishPackage = useCallback((pkg: AnyPackage) => {
    setPublished((prev) => [pkg, ...prev]);
  }, []);

  const allPackages = useMemo(
    () => [...published, ...mockPackages],
    [published]
  );

  const value = useMemo<AppState>(
    () => ({ theme, toggleTheme, installed, isInstalled, install, published, publishPackage, allPackages }),
    [theme, toggleTheme, installed, isInstalled, install, published, publishPackage, allPackages]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
