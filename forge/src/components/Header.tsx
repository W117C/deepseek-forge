import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Github, Menu, Moon, Search, Sun, X } from "lucide-react";
import { useApp } from "../context/app";
import { ForgeIcon } from "./ForgeIcon";
import { CommandPalette } from "./CommandPalette";
import { useKey } from "../lib/hooks";

const NAV = [
  { to: "/explore", label: "Explore" },
  { to: "/agents", label: "Agents" },
  { to: "/bundles", label: "Bundles" },
  { to: "/plugins", label: "Plugins" },
  { to: "/skills", label: "Skills" },
];

export function Header() {
  const { theme, toggleTheme } = useApp();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
    setPaletteOpen(false);
  }, [location.pathname]);

  useKey(
    (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    },
    []
  );

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="brand" aria-label="DeepSeek Forge home">
            <ForgeIcon size={20} className="forge-mark" />
            <span className="brand-name">
              DeepSeek <span>Forge</span>
            </span>
          </Link>

          <nav className="header-nav" aria-label="Primary">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="header-actions">
            <button
              className="header-search-btn"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open search"
            >
              <Search size={14} />
              <span style={{ fontSize: 12.5 }}>Search</span>
              <kbd className="kbd">⌘K</kbd>
            </button>

            <a
              className="icon-btn"
              href="https://github.com/W117C/deepseek-agenthub"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub repository"
            >
              <Github size={16} />
            </a>

            <button className="icon-btn" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            <Link to="/publish" className="btn btn-primary btn-sm" style={{ marginLeft: 4 }}>
              Publish
            </Link>

            <button className="icon-btn menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Open menu">
              <Menu size={18} />
            </button>
          </div>
        </div>
      </header>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}

      {menuOpen && (
        <div className="mobile-menu open" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="mobile-menu-head">
            <Link to="/" className="brand">
              <ForgeIcon size={20} className="forge-mark" />
              <span className="brand-name">DeepSeek <span>Forge</span></span>
            </Link>
            <button className="icon-btn" onClick={() => setMenuOpen(false)} aria-label="Close menu">
              <X size={18} />
            </button>
          </div>
          <nav aria-label="Mobile">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
                {n.label}
              </NavLink>
            ))}
            <NavLink to="/publish" className="nav-link">Publish</NavLink>
          </nav>
        </div>
      )}
    </>
  );
}
