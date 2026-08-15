// Sidebar — FORGE / DISCOVER / WORKSPACE / RUNTIME / SYSTEM.
// No development-phase markers. The Updates badge is the real outdated count.
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { Languages } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bot,
  Database,
  Github,
  Layers,
  LayoutDashboard,
  Plug,
  RefreshCw,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  TerminalSquare,
} from "lucide-react";
import { updateCheck } from "../ipc";
import { useI18n } from "../i18n";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    title: "forge",
    items: [{ to: "/", label: "dashboard", icon: LayoutDashboard, end: true }],
  },
  {
    title: "discover",
    items: [
      { to: "/marketplace", label: "marketplace", icon: Store },
      { to: "/import", label: "import", icon: Github },
    ],
  },
  {
    title: "workspace",
    items: [
      { to: "/agents", label: "agents", icon: Bot },
      { to: "/skills", label: "skills", icon: Sparkles },
      { to: "/plugins", label: "plugins", icon: Plug },
      { to: "/bundles", label: "bundles", icon: Layers },
    ],
  },
  {
    title: "runtime",
    items: [
      { to: "/sessions", label: "sessions", icon: TerminalSquare },
      { to: "/processes", label: "processes", icon: Activity },
      { to: "/logs", label: "logs", icon: ScrollText },
    ],
  },
  {
    title: "system",
    items: [
      { to: "/security", label: "security", icon: ShieldCheck },
      { to: "/sources", label: "sources", icon: Database },
      { to: "/updates", label: "updates", icon: RefreshCw },
      { to: "/settings", label: "settings", icon: Settings },
    ],
  },
];

const APP_VERSION = "0.4.0";

const linkClass = ({ isActive }: { isActive: boolean }): string =>
  "sidebar-link" + (isActive ? " is-active" : "");

function ForgeMark() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M16 1.5l12.5 7.2v14.6L16 30.5l-12.5-7.2V8.7L16 1.5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M16 9v6.2M16 15.2l3.6 3.6M16 15.2l-3.6 3.6M16 15.2l3.6-3.6M16 15.2l-3.6-3.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="16" cy="15.2" r="1.4" fill="currentColor" />
    </svg>
  );
}

export default function Sidebar() {
  const { t, locale, setLocale } = useI18n();
  const [outdatedCount, setOutdatedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    updateCheck()
      .then((entries) => {
        if (!cancelled) {
          setOutdatedCount(entries.filter((e) => e.outdated).length);
        }
      })
      .catch(() => {
        /* registry unavailable — no badge */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <ForgeMark />
        <div>
          <span className="sidebar-brand-name">
            DeepSeek <em>Forge</em>
          </span>
          <span className="sidebar-brand-sub">Agent Package OS</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Primary">
        {GROUPS.map((group) => (
          <div className="sidebar-group" key={group.title}>
            <div className="sidebar-group-title">
              {t("nav." + group.title.toLowerCase())}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const label = t(
                "nav." + item.label.toLowerCase().replace(/ /g, "")
              );
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={linkClass}
                >
                  <Icon size={15} />
                  <span>{label}</span>
                  {item.to === "/updates" && outdatedCount > 0 && (
                    <span className="sidebar-badge accent">{outdatedCount}</span>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <button
          className="sidebar-lang"
          onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
          aria-label="Switch language"
        >
          <Languages size={13} />
          {locale === "zh" ? "English" : "中文"}
        </button>
        <div className="sidebar-version">
          <span>{t("sidebar.version")}</span>
          <span>v{APP_VERSION}</span>
        </div>
      </div>
    </aside>
  );
}
