import { NavLink } from "react-router-dom";
import { Languages } from "lucide-react";
import { useI18n } from "../i18n";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bot,
  Database,
  Github,
  LayoutDashboard,
  Package,
  Puzzle,
  RefreshCw,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Terminal,
} from "lucide-react";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  phase: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

// Sidebar groups per target-state §24.
const GROUPS: NavGroup[] = [
  {
    title: "discover",
    items: [
      { to: "/marketplace", label: "marketplace", icon: Store, phase: "" },
      { to: "/import", label: "import", icon: Github, phase: "" },
    ],
  },
  {
    title: "workspace",
    items: [
      { to: "/agents", label: "agents", icon: Bot, phase: "" },
      { to: "/skills", label: "skills", icon: Sparkles, phase: "" },
      { to: "/plugins", label: "plugins", icon: Puzzle, phase: "" },
      { to: "/bundles", label: "bundles", icon: Package, phase: "" },
    ],
  },
  {
    title: "runtime",
    items: [
      { to: "/sessions", label: "sessions", icon: Terminal, phase: "" },
      { to: "/processes", label: "processes", icon: Activity, phase: "" },
      { to: "/logs", label: "logs", icon: ScrollText, phase: "" },
    ],
  },
  {
    title: "system",
    items: [
      { to: "/security", label: "security", icon: ShieldCheck, phase: "" },
      { to: "/sources", label: "sources", icon: Database, phase: "" },
      { to: "/updates", label: "updates", icon: RefreshCw, phase: "" },
      { to: "/settings", label: "settings", icon: Settings, phase: "" },
    ],
  },
];

const linkClass = ({ isActive }: { isActive: boolean }): string =>
  "sidebar-link" + (isActive ? " is-active" : "");

function ForgeMark() {
  return (
    <svg
      width="24"
      height="24"
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
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <ForgeMark />
        <div>
          <span className="sidebar-brand-name">
            DeepSeek <em>Forge</em>
          </span>
          <span className="sidebar-brand-sub">Desktop</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Primary">
        <NavLink to="/" end className={linkClass}>
          <LayoutDashboard size={16} />
          <span>{t("nav.dashboard")}</span>
        </NavLink>

        {GROUPS.map((group) => (
          <div className="sidebar-group" key={group.title}>
            <div className="sidebar-group-title">{t("nav." + group.title.toLowerCase())}</div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const label = t("nav." + item.label.toLowerCase().replace(/ /g, ""));
              return (
                <NavLink key={item.to} to={item.to} className={linkClass}>
                  <Icon size={16} />
                  <span>{label}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button
          className="btn btn-ghost"
          style={{ width: "100%", justifyContent: "flex-start", gap: 8 }}
          onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
          aria-label="Switch language"
        >
          <Languages size={14} />
          {locale === "zh" ? "中文" : "English"}
        </button>
      </div>
    </aside>
  );
}
