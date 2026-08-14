// ⌘K 命令面板：真实导航（HashRouter）+ 语言切换。无 mock 数据。
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "lucide-react";
import { useI18n } from "../i18n";

interface Item {
  id: string;
  label: string;
  action: () => void;
}

export default function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t, locale, setLocale } = useI18n();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(0);

  const items: Item[] = useMemo(() => {
    const pages: [string, string][] = [
      ["nav.dashboard", "/"],
      ["nav.marketplace", "/marketplace"],
      ["nav.import", "/import"],
      ["nav.agents", "/agents"],
      ["nav.plugins", "/plugins"],
      ["nav.bundles", "/bundles"],
      ["nav.sessions", "/sessions"],
      ["nav.processes", "/processes"],
      ["nav.logs", "/logs"],
      ["nav.security", "/security"],
      ["nav.sources", "/sources"],
      ["nav.updates", "/updates"],
      ["nav.settings", "/settings"],
    ];
    const list: Item[] = pages.map(([key, path]) => ({
      id: "nav:" + path,
      label: t(key),
      action: () => navigate(path),
    }));
    list.push({
      id: "lang:" + (locale === "zh" ? "en" : "zh"),
      label: (locale === "zh" ? "切换到 English / Switch to English" : "切换到中文 / Switch to 中文"),
      action: () => setLocale(locale === "zh" ? "en" : "zh"),
    });
    return list;
  }, [t, locale, setLocale, navigate]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  function pick(item: Item) {
    item.action();
    onClose();
  }

  return (
    <div
      className="palette-overlay"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "16vh",
      }}
      onClick={onClose}
    >
      <div
        className="card palette"
        style={{ width: 520, maxWidth: "92vw", padding: 10 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px 10px" }}>
          <Command size={15} style={{ color: "var(--muted)" }} />
          <input
            ref={inputRef}
            className="input"
            style={{ flex: 1, border: "none", background: "transparent" }}
            placeholder={t("palette.placeholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const item = filtered[active];
                if (item) pick(item);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
          />
        </div>
        <div style={{ maxHeight: 320, overflow: "auto" }}>
          {filtered.length === 0 && (
            <p className="field-hint" style={{ padding: "8px 10px" }}>{t("mp.empty")}</p>
          )}
          {filtered.map((item, i) => (
            <button
              key={item.id}
              className="btn btn-ghost"
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                marginBottom: 2,
                background: i === active ? "var(--bg-soft)" : "transparent",
              }}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="field-hint" style={{ padding: "8px 10px 4px" }}>{t("palette.hint")}</p>
      </div>
    </div>
  );
}
