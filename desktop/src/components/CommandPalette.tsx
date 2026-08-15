// ⌘K command palette — Forge's quick entry point.
// Real navigation (HashRouter) + "install <query>" against the real registry.
// Keyboard-first: ↑↓ navigate, Enter open, Esc close.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bot,
  Command,
  Database,
  Github,
  Languages,
  Layers,
  LayoutDashboard,
  Plug,
  RefreshCw,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  TerminalSquare,
} from "lucide-react";
import { installPackage, registryList } from "../ipc";
import type { RegistrySummary } from "../ipc";
import { useI18n } from "../i18n";
import { Kbd, useToast } from "./ui";

interface Item {
  id: string;
  label: string;
  sub?: string;
  icon: LucideIcon;
  kbd?: string;
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
  const toast = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(0);
  const [matches, setMatches] = useState<RegistrySummary[]>([]);
  const [installBusy, setInstallBusy] = useState<string | null>(null);

  const navItems: Item[] = useMemo(() => {
    const pages: { key: string; path: string; icon: LucideIcon; kbd?: string }[] = [
      { key: "nav.dashboard", path: "/", icon: LayoutDashboard, kbd: "⌘1" },
      { key: "nav.marketplace", path: "/marketplace", icon: Store, kbd: "⌘2" },
      { key: "nav.import", path: "/import", icon: Github },
      { key: "nav.agents", path: "/agents", icon: Bot, kbd: "⌘4" },
      { key: "nav.skills", path: "/skills", icon: Sparkles },
      { key: "nav.plugins", path: "/plugins", icon: Plug, kbd: "⌘3" },
      { key: "nav.bundles", path: "/bundles", icon: Layers },
      { key: "nav.sessions", path: "/sessions", icon: TerminalSquare },
      { key: "nav.processes", path: "/processes", icon: Activity },
      { key: "nav.logs", path: "/logs", icon: ScrollText },
      { key: "nav.security", path: "/security", icon: ShieldCheck },
      { key: "nav.sources", path: "/sources", icon: Database },
      { key: "nav.updates", path: "/updates", icon: RefreshCw },
      { key: "nav.settings", path: "/settings", icon: Settings },
    ];
    return pages.map((p) => ({
      id: "nav:" + p.path,
      label: t(p.key),
      icon: p.icon,
      kbd: p.kbd,
      action: () => navigate(p.path),
    }));
  }, [t, navigate]);

  const actionItems: Item[] = useMemo(() => {
    return [
      {
        id: "lang:" + (locale === "zh" ? "en" : "zh"),
        label: locale === "zh" ? "Switch to English" : "切换到中文",
        sub: t("palette.langSub"),
        icon: Languages,
        action: () => setLocale(locale === "zh" ? "en" : "zh"),
      },
    ];
  }, [locale, setLocale, t]);

  // "install <query>" — real Core API: search registry and install.
  const installQuery = useMemo(() => {
    const m = query.trim().match(/^(?:install|安装)\s+(.+)$/i);
    return m ? m[1] : null;
  }, [query]);

  useEffect(() => {
    if (!installQuery) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    registryList()
      .then((pkgs) => {
        if (cancelled) return;
        const q = installQuery.toLowerCase();
        setMatches(
          pkgs
            .filter((p) =>
              [p.name, p.id, p.description].join(" ").toLowerCase().includes(q)
            )
            .slice(0, 8)
        );
      })
      .catch(() => {
        if (!cancelled) setMatches([]);
      });
    return () => {
      cancelled = true;
    };
  }, [installQuery]);

  const installItems: Item[] = useMemo(
    () =>
      matches.map((p) => ({
        id: "install:" + p.id,
        label: p.name,
        sub: p.type + " · v" + p.versionLatest + (p.license ? " · " + p.license : ""),
        icon: Store,
        action: () => {
          setInstallBusy(p.id);
          installPackage(p.id)
            .then(() => {
              toast("success", t("toast.installed", { name: p.name }));
              navigate("/plugins/" + p.id);
            })
            .catch((e: unknown) => {
              const msg = e instanceof Error ? e.message : String(e);
              toast("error", t("toast.installFailed"), p.name + " — " + msg);
            })
            .finally(() => setInstallBusy(null));
        },
      })),
    [matches, t, toast, navigate]
  );

  const groups: { label: string; items: Item[] }[] = useMemo(() => {
    if (installQuery) {
      return [
        { label: t("palette.installResults"), items: installItems },
        { label: t("palette.nav"), items: navItems },
      ];
    }
    const q = query.trim().toLowerCase();
    if (!q) {
      return [
        { label: t("palette.nav"), items: navItems },
        { label: t("palette.actions"), items: actionItems },
      ];
    }
    return [
      {
        label: t("palette.nav"),
        items: navItems.filter((i) => i.label.toLowerCase().includes(q)),
      },
      {
        label: t("palette.actions"),
        items: actionItems.filter((i) =>
          (i.label + " " + (i.sub ?? "")).toLowerCase().includes(q)
        ),
      },
    ];
  }, [installQuery, installItems, navItems, actionItems, query, t]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

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
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input-row">
          <Command size={15} />
          <input
            ref={inputRef}
            placeholder={t("palette.placeholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, flat.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const item = flat[active];
                // 安装进行中时跳过已被禁用的 install 项，避免重复触发并发安装
                if (item && !(installBusy !== null && item.id.startsWith("install:"))) pick(item);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
          />
          <Kbd>Esc</Kbd>
        </div>
        <div className="palette-results">
          {flat.length === 0 && (
            <div className="palette-empty">
              <div>{t("palette.noResults")}</div>
              <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 11 }}>
                install &lt;name&gt;
              </div>
            </div>
          )}
          {groups.map((group) => {
            const startIdx = groups
              .slice(0, groups.indexOf(group))
              .reduce((acc, g) => acc + g.items.length, 0);
            if (group.items.length === 0) return null;
            return (
              <div key={group.label}>
                <div className="palette-group-label">{group.label}</div>
                {group.items.map((item, i) => {
                  const idx = startIdx + i;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      className={"palette-item" + (idx === active ? " active" : "")}
                      disabled={installBusy !== null && item.id.startsWith("install:")}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => pick(item)}
                    >
                      <span className="pal-ico">
                        {installBusy === item.id ? (
                          <Search size={14} className="spin" />
                        ) : (
                          <Icon size={14} />
                        )}
                      </span>
                      <span className="pal-label">{item.label}</span>
                      {item.sub && <span className="pal-meta">{item.sub}</span>}
                      {item.kbd && <span className="pal-kbd">{item.kbd}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="palette-foot">
          <span>
            <Kbd>↑↓</Kbd> {t("palette.select")}
          </span>
          <span>
            <Kbd>↵</Kbd> {t("palette.open")}
          </span>
          <span>
            <Kbd>esc</Kbd> {t("palette.close")}
          </span>
          <span style={{ marginLeft: "auto" }}>{t("palette.installHint")}</span>
        </div>
      </div>
    </div>
  );
}
