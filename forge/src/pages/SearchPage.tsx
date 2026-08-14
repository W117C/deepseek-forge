import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { AnyPackage, PackageType } from "../types";
import { useApp } from "../context/app";
import { highlightMatches, searchPackages } from "../lib/registry";
import { useReady } from "../lib/hooks";
import { SearchBar } from "../components/SearchBar";
import { EmptyState } from "../components/states";
import { SortSelect } from "../components/filters";
import type { SortKey } from "../types";
import { sortPackages, typeLabel } from "../lib/registry";

const TABS: { key: "all" | PackageType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "agent", label: "Agents" },
  { key: "bundle", label: "Bundles" },
  { key: "plugin", label: "Plugins" },
  { key: "skill", label: "Skills" },
];

export function SearchPage() {
  const [sp] = useSearchParams();
  const { allPackages } = useApp();
  const q = sp.get("q") ?? "";
  const [tab, setTab] = useState<"all" | PackageType>("all");
  const [sort, setSort] = useState<SortKey>("popular");
  const ready = useReady(320);

  const results = useMemo(() => searchPackages(q, allPackages), [q, allPackages]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: results.length };
    for (const t of TABS) if (t.key !== "all") c[t.key] = results.filter((r) => r.type === t.key).length;
    return c;
  }, [results]);

  const visible: AnyPackage[] = useMemo(() => {
    const filtered = tab === "all" ? results : results.filter((r) => r.type === tab);
    return sortPackages(filtered, sort);
  }, [results, tab, sort]);

  const rowsReady = ready;

  return (
    <main>
      <section className="page-hero">
        <div className="forge-container">
          <span className="eyebrow">Search</span>
          <h1 style={{ fontSize: "clamp(26px, 4vw, 38px)" }}>
            Results for <mark style={{ background: "var(--accent-soft)" }}>“{q}”</mark>
          </h1>
          <p className="lead">
            {q.trim() === "" ? "Type a query to search the registry." : results.length + " packages match across agents, bundles, plugins and skills."}
          </p>
          <div style={{ maxWidth: 560, marginTop: 24 }}>
            <SearchBar initial={q} large={false} />
          </div>
        </div>
      </section>

      <div className="forge-container" style={{ paddingTop: 24, paddingBottom: 96 }}>
        <div className="results-head" style={{ marginTop: 12 }}>
          <SortSelect value={sort} onChange={setSort} />
        </div>

        <div className="tabs" role="tablist" aria-label="Filter results by type" style={{ marginTop: 16 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              className={"tab" + (tab === t.key ? " active" : "")}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              <span className="count">{counts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>

        {!rowsReady ? (
          <div style={{ marginTop: 8 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ display: "flex", gap: 14, padding: "18px 8px", borderBottom: "1px solid var(--border)" }}>
                <div className="skel" style={{ width: 32, height: 32 }} />
                <div style={{ flex: 1 }}>
                  <div className="skel skel-line title" style={{ width: "30%" }} />
                  <div className="skel skel-line" style={{ width: "60%" }} />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            title="No results found."
            message={"Nothing matches “" + q + "” in this group. Try a broader term or a different type."}
            suggestions={["finance", "quant", "research"]}
          />
        ) : (
          <div className="list-rows">
            {visible.map((p) => (
              <HighlightRow key={p.id} pkg={p} query={q} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function HighlightRow({ pkg, query }: { pkg: AnyPackage; query: string }) {
  return (
    <Link to={"/" + (pkg.type === "agent" ? "agents" : pkg.type + "s") + "/" + pkg.slug} className="list-row">
      <span className="pkg-icon"><TypeDot type={pkg.type} /></span>
      <span className="lr-main">
        <span className="lr-name">
          {highlightMatches(pkg.name, query).map((p, k) =>
            p.match ? <span key={k}><mark>{p.match}</mark>{p.post}</span> : <span key={k}>{p.pre}{p.post}</span>
          )}
        </span>
        <span className="lr-desc">
          {highlightMatches(pkg.description, query).map((p, k) =>
            p.match ? <span key={k}><mark>{p.match}</mark>{p.post}</span> : <span key={k}>{p.pre}{p.post}</span>
          )}
        </span>
      </span>
      <span className="lr-meta">v{pkg.version} · {typeLabel(pkg.type)} · @{pkg.authorId}</span>
      <span className="lr-badges">
        {pkg.verified ? <span className="badge badge-verified">✓ Verified</span> : <span className="badge badge-community">Community</span>}
      </span>
    </Link>
  );
}

function TypeDot({ type }: { type: PackageType }) {
  const letter = type.charAt(0).toUpperCase();
  return <span className="mono" style={{ color: "var(--accent)", fontWeight: 600 }}>{letter}</span>;
}
