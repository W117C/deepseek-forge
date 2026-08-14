import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Github, Moon, Search, Sun } from "lucide-react";
import { useApp } from "../context/app";
import { highlightMatches, routeFor, searchPackages } from "../lib/registry";
import { typeLabels } from "../lib/site";
import { useBodyLock, useKey } from "../lib/hooks";
import type { AnyPackage, PackageType } from "../types";

type Item =
  | { kind: "pkg"; pkg: AnyPackage }
  | { kind: "cmd"; id: string; label: string; hint: string; action: () => void };

const GROUP_ORDER: PackageType[] = ["agent", "bundle", "plugin", "skill"];

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { allPackages, theme, toggleTheme } = useApp();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useBodyLock(true);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const items = useMemo<Item[]>(() => {
    const q = query.trim();
    const base: Item[] = [
      { kind: "cmd", id: "explore", label: "Explore Marketplace", hint: "Browse all packages", action: () => navigate("/explore") },
      { kind: "cmd", id: "publish", label: "Publish a Package", hint: "Share with the community", action: () => navigate("/publish") },
      { kind: "cmd", id: "docs", label: "Open GitHub Repository", hint: "github.com/W117C/deepseek-forge", action: () => window.open("https://github.com/W117C/deepseek-forge", "_blank", "noopener") },
      { kind: "cmd", id: "theme", label: theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode", hint: "Appearance", action: toggleTheme },
    ];
    if (!q) return base;
    const results = searchPackages(q, allPackages).slice(0, 10);
    const pkgs: Item[] = results.map((pkg) => ({ kind: "pkg", pkg }));
    return pkgs.length > 0 ? pkgs : base;
  }, [query, allPackages, navigate, theme, toggleTheme]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [active, items]);

  useKey(
    (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
      else if (e.key === "Enter") {
        e.preventDefault();
        const it = items[active];
        if (it) run(it);
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [items, active]
  );

  function run(it: Item) {
    if (it.kind === "pkg") {
      navigate(routeFor(it.pkg));
      onClose();
    } else {
      it.action();
      if (it.id !== "theme") onClose();
    }
  }

  const rows = items.map((item, index) => ({ item, index }));
  const cmdRows = rows.filter((r) => r.item.kind === "cmd");
  const groups: { type: PackageType; rows: typeof rows }[] = GROUP_ORDER
    .map((t) => ({ type: t, rows: rows.filter((r) => r.item.kind === "pkg" && r.item.pkg.type === t) }))
    .filter((g) => g.rows.length > 0);
  const isEmpty = rows.length === 0;

  return (
    <div className="palette-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search packages">
        <div className="palette-input-row">
          <Search size={17} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents, bundles, plugins, skills…"
            aria-label="Search packages"
            spellCheck={false}
          />
          <kbd className="kbd">esc</kbd>
        </div>

        <div className="palette-results" ref={listRef}>
          {isEmpty && (
            <div className="palette-empty">
              No results for “{query}”.<br />
              Try <span className="mono" style={{ color: "var(--accent)" }}>finance</span>,{" "}
              <span className="mono" style={{ color: "var(--accent)" }}>quant</span> or{" "}
              <span className="mono" style={{ color: "var(--accent)" }}>research</span>.
            </div>
          )}

          {cmdRows.length > 0 && (
            <>
              <div className="palette-group-label">Commands</div>
              {cmdRows.map(({ item, index }) => {
                if (item.kind !== "cmd") return null;
                return (
                  <button
                    key={item.id}
                    className={"palette-item" + (index === active ? " active" : "")}
                    data-active={index === active}
                    onClick={() => run(item)}
                    onMouseEnter={() => setActive(index)}
                  >
                    <CmdIcon id={item.id} />
                    <span className="p-name">{item.label}</span>
                    <span className="p-meta">{item.hint}</span>
                    <span className="p-enter">↵</span>
                  </button>
                );
              })}
            </>
          )}

          {groups.map((g) => (
            <div key={g.type}>
              <div className="palette-group-label">{typeLabels[g.type].toUpperCase()}S</div>
              {g.rows.map(({ item, index }) => {
                if (item.kind !== "pkg") return null;
                return (
                  <button
                    key={item.pkg.id}
                    className={"palette-item" + (index === active ? " active" : "")}
                    data-active={index === active}
                    onClick={() => run(item)}
                    onMouseEnter={() => setActive(index)}
                  >
                    <span className="p-type">{typeLabels[g.type].toUpperCase()}</span>
                    <span className="p-name">
                      {highlightMatches(item.pkg.name, query).map((p, k) =>
                        p.match ? <span key={k}><mark>{p.match}</mark>{p.post}</span> : <span key={k}>{p.pre}{p.post}</span>
                      )}
                    </span>
                    <span className="p-meta">v{item.pkg.version}</span>
                    <span className="p-enter">↵</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="palette-foot">
          <span><ArrowRight size={11} /> open</span>
          <span>↑↓ navigate</span>
          <span>esc close</span>
          <span style={{ marginLeft: "auto" }}>DeepSeek Forge</span>
        </div>
      </div>
    </div>
  );
}

function CmdIcon({ id }: { id: string }) {
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  const color = "var(--muted)";
  if (id === "explore") return <Search size={14} style={{ color }} />;
  if (id === "publish") return <ArrowRight size={14} style={{ color }} />;
  if (id === "docs") return <Github size={14} style={{ color }} />;
  if (id === "theme") return dark ? <Sun size={14} style={{ color }} /> : <Moon size={14} style={{ color }} />;
  return <Github size={14} style={{ color }} />;
}
