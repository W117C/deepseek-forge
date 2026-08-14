import { NavLink } from "react-router-dom";
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
    title: "Discover",
    items: [
      { to: "/marketplace", label: "Marketplace", icon: Store, phase: "Phase 4" },
      { to: "/import", label: "GitHub Import", icon: Github, phase: "Phase 4" },
    ],
  },
  {
    title: "Workspace",
    items: [
      { to: "/agents", label: "My Agents", icon: Bot, phase: "Phase 6" },
      { to: "/skills", label: "My Skills", icon: Sparkles, phase: "Phase 6" },
      { to: "/plugins", label: "My Plugins", icon: Puzzle, phase: "Phase 3" },
      { to: "/bundles", label: "Bundles", icon: Package, phase: "Phase 6" },
    ],
  },
  {
    title: "Runtime",
    items: [
      { to: "/sessions", label: "Sessions", icon: Terminal, phase: "Phase 7" },
      { to: "/processes", label: "Processes", icon: Activity, phase: "Phase 7" },
      { to: "/logs", label: "Logs", icon: ScrollText, phase: "Phase 7" },
    ],
  },
  {
    title: "System",
    items: [
      { to: "/security", label: "Security", icon: ShieldCheck, phase: "Phase 8" },
      { to: "/sources", label: "Sources", icon: Database, phase: "Phase 8" },
      { to: "/updates", label: "Updates", icon: RefreshCw, phase: "Phase 8" },
      { to: "/settings", label: "Settings", icon: Settings, phase: "Phase 8" },
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
          <span>Dashboard</span>
        </NavLink>

        {GROUPS.map((group) => (
          <div className="sidebar-group" key={group.title}>
            <div className="sidebar-group-title">{group.title}</div>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink key={item.to} to={item.to} className={linkClass}>
                  <Icon size={16} />
                  <span>{item.label}</span>
                  <span className="sidebar-phase">{item.phase}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
