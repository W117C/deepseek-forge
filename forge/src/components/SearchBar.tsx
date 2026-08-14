import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { useApp } from "../context/app";
import { formatDownloads, routeFor, searchPackages, typeLabel } from "../lib/registry";
import { popularSearches } from "../data/mock";
import { highlightMatches } from "../lib/registry";

export function SearchBar({ initial = "", large = true }: { initial?: string; large?: boolean }) {
  const navigate = useNavigate();
  const { allPackages } = useApp();
  const [q, setQ] = useState(initial);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => searchPackages(q, allPackages).slice(0, 6), [q, allPackages]);
  const showResults = focused && q.trim().length > 0;
  const showPopular = focused && q.trim().length === 0;

  function go(pkgRoute: string) {
    setFocused(false);
    setQ("");
    navigate(pkgRoute);
  }

  function submit() {
    const target = q.trim();
    setFocused(false);
    if (showResults && active >= 0 && results[active]) {
      navigate(routeFor(results[active]));
      setQ("");
      return;
    }
    if (target) navigate("/search?q=" + encodeURIComponent(target));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Escape") {
      setFocused(false);
    }
  }

  return (
    <div
      className={large ? "hero-search" : "hero-search"}
      style={large ? undefined : { maxWidth: 520, margin: 0 }}
      ref={boxRef}
      onBlur={(e) => {
        if (!boxRef.current?.contains(e.relatedTarget as Node)) setFocused(false);
      }}
    >
      <div className="input-shell" style={large ? undefined : { height: 42 }}>
        <Search size={large ? 18 : 15} className="search-icon" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(-1); setFocused(true); }}
          onFocus={() => setFocused(true)}
          onKeyDown={onKeyDown}
          placeholder="Search agents, bundles, plugins, skills…"
          aria-label="Search packages"
          role="combobox"
          aria-expanded={showResults || showPopular}
          aria-controls="search-suggest"
          spellCheck={false}
        />
        {large && <kbd className="kbd">⌘ K</kbd>}
      </div>

      {(showResults || showPopular) && (
        <div className="search-suggest" id="search-suggest" role="listbox">
          {showPopular && (
            <>
              <div className="search-suggest-head">Popular searches</div>
              {popularSearches.map((s) => (
                <button key={s} className="suggest-row" onMouseDown={(e) => { e.preventDefault(); go("/search?q=" + encodeURIComponent(s)); }} role="option">
                  <Search size={13} style={{ color: "var(--muted)" }} />
                  <span className="s-name">{s}</span>
                </button>
              ))}
            </>
          )}
          {showResults && (
            <>
              <div className="search-suggest-head">Packages</div>
              {results.length === 0 && <div style={{ padding: "10px 14px", fontSize: 13, color: "var(--muted)" }}>No packages match “{q}”. Press Enter to search anyway.</div>}
              {results.map((pkg, i) => (
                <button
                  key={pkg.id}
                  className={"suggest-row" + (i === active ? " active" : "")}
                  onMouseDown={(e) => { e.preventDefault(); go(routeFor(pkg)); }}
                  onMouseEnter={() => setActive(i)}
                  role="option"
                >
                  <span className="s-type">{typeLabel(pkg.type).toUpperCase()}</span>
                  <span className="s-name">
                    {highlightMatches(pkg.name, q).map((p, k) =>
                      p.match ? <span key={k}><mark>{p.match}</mark>{p.post}</span> : <span key={k}>{p.pre}{p.post}</span>
                    )}
                  </span>
                  <span className="s-meta">v{pkg.version} · {formatDownloads(pkg.downloads)}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
