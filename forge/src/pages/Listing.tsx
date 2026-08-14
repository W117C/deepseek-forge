import { useMemo, useState } from "react";
import type { AnyPackage, PackageType } from "../types";
import { useApp } from "../context/app";
import { applyFilters, typeLabel } from "../lib/registry";
import { useReady } from "../lib/hooks";
import { AgentCard } from "../components/cards/AgentCard";
import { BundleCard } from "../components/cards/BundleCard";
import { PluginCard } from "../components/cards/PluginCard";
import { SkillCard } from "../components/cards/SkillCard";
import { PackageRow } from "../components/cards/PackageRow";
import { CardGridSkeleton, EmptyState } from "../components/states";
import {
  ActiveFilterChips,
  FilterSidebar,
  MobileFilterButton,
  SortSelect,
  useQueryFilters,
  ViewToggle,
} from "../components/filters";

interface ListingPageProps {
  title: string;
  eyebrow: string;
  subtitle: string;
  type?: PackageType; // lock listing to one package type
}

export function ListingPage({ title, eyebrow, subtitle, type }: ListingPageProps) {
  const { allPackages } = useApp();
  const { filters, set, toggle, clear, view, setView } = useQueryFilters();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const ready = useReady(380);

  const pool = useMemo(() => (type ? allPackages.filter((p) => p.type === type) : allPackages), [allPackages, type]);

  const effective = useMemo<AnyPackage[]>(() => {
    const f = { ...filters };
    if (type) f.types = [type];
    return applyFilters(pool, f);
  }, [pool, filters, type]);

  const fForSidebar = type ? { ...filters, types: [type] } : filters;

  const hasFilters =
    (type ? false : filters.types.length > 0) ||
    filters.categories.length > 0 ||
    filters.trust.length > 0;

  return (
    <main>
      <section className="page-hero">
        <div className="forge-container">
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p className="lead">{subtitle}</p>
          <div className="page-hero-meta">
            <span>{pool.length} packages</span>
            <span>·</span>
            <span>DeepSeek Harness &gt;= 0.5.0</span>
            <span>·</span>
            <span>Registry synced just now</span>
          </div>
        </div>
      </section>

      <div className="forge-container explore-layout">
        <aside className={"filter-side" + (drawerOpen ? " open" : "")}>
          <FilterSidebar filters={fForSidebar} toggle={toggle} onClose={drawerOpen ? () => setDrawerOpen(false) : undefined} />
        </aside>

        <div>
          <div className="results-head">
            <span className="results-count">{effective.length} results</span>
            <MobileFilterButton onClick={() => setDrawerOpen(true)} />
            <SortSelect value={filters.sort} onChange={(v) => set({ sort: v })} />
            <ViewToggle view={view} onChange={setView} />
            <ActiveFilterChips
              filters={fForSidebar}
              onRemove={(g, v) => {
                if (g === "types" && type) return;
                toggle(g, v);
              }}
              onClear={clear}
            />
          </div>

          {!ready ? (
            <CardGridSkeleton count={6} />
          ) : effective.length === 0 ? (
            <EmptyState
              title={"No " + (type ? typeLabel(type).toLowerCase() + "s" : "packages") + " found."}
              message="Try a different combination of filters, or search for a capability instead."
              suggestions={["finance", "quant", "research"]}
              onClear={clear}
            />
          ) : view === "list" ? (
            <div className="list-rows">
              {effective.map((p) => <PackageRow key={p.id} pkg={p} />)}
            </div>
          ) : (
            <div className="grid-cards">
              {effective.map((p) => {
                if (p.type === "agent") return <AgentCard key={p.id} agent={p} />;
                if (p.type === "bundle") return <BundleCard key={p.id} bundle={p} />;
                if (p.type === "plugin") return <PluginCard key={p.id} plugin={p} />;
                return <SkillCard key={p.id} skill={p} />;
              })}
            </div>
          )}

          {hasFilters && effective.length > 0 && (
            <p className="mono" style={{ marginTop: 24, fontSize: 11, color: "var(--muted)" }}>
              Showing {effective.length} of {pool.length} packages · filters applied
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
