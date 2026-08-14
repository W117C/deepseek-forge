import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { LayoutGrid, List, SlidersHorizontal, X } from "lucide-react";
import type { Filters, PackageType, SortKey, TrustLevel } from "../types";
import { categories, sortOptions } from "../data/mock";

export const DEFAULT_FILTERS: Filters = {
  types: [],
  categories: [],
  trust: [],
  compat: [],
  sort: "trending",
};

export function useQueryFilters(): { filters: Filters; set: (patch: Partial<Filters>) => void; toggle: (group: "types" | "categories" | "trust", value: string) => void; clear: () => void; view: "grid" | "list"; setView: (v: "grid" | "list") => void } {
  const [sp, setSp] = useSearchParams();

  const filters: Filters = useMemo(() => ({
    types: (sp.get("t") ?? "").split(",").filter(Boolean) as PackageType[],
    categories: (sp.get("cat") ?? "").split(",").filter(Boolean),
    trust: (sp.get("trust") ?? "").split(",").filter(Boolean) as TrustLevel[],
    compat: (sp.get("compat") ?? "").split(",").filter(Boolean),
    sort: (sp.get("sort") as SortKey) || "trending",
  }), [sp]);

  const view: "grid" | "list" = sp.get("view") === "list" ? "list" : "grid";

  function set(patch: Partial<Filters>) {
    const next = { ...filters, ...patch };
    const p = new URLSearchParams(sp);
    for (const key of Object.keys(next) as (keyof Filters)[]) {
      const v = next[key];
      if (Array.isArray(v)) {
        if (v.length === 0) p.delete(paramName(key));
        else p.set(paramName(key), v.join(","));
      } else if (v && v !== "trending") {
        p.set(paramName(key), String(v));
      } else {
        p.delete(paramName(key));
      }
    }
    setSp(p, { replace: true });
  }

  function toggle(group: "types" | "categories" | "trust", value: string) {
    const cur = filters[group] as string[];
    const nextGroup = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    set({ [group]: nextGroup } as Partial<Filters>);
  }

  function clear() {
    setSp(new URLSearchParams(), { replace: true });
  }

  function setView(v: "grid" | "list") {
    const p = new URLSearchParams(sp);
    if (v === "list") p.set("view", "list");
    else p.delete("view");
    setSp(p, { replace: true });
  }

  return { filters, set, toggle, clear, view, setView };
}

function paramName(key: string): string {
  if (key === "types") return "t";
  if (key === "categories") return "cat";
  return key;
}

/* ============================================================
   Sidebar
   ============================================================ */
export function FilterSidebar({
  filters,
  toggle,
  onClose,
}: {
  filters: Filters;
  toggle: (group: "types" | "categories" | "trust", value: string) => void;
  onClose?: () => void;
}) {
  const typeCounts: Record<string, number> = { agent: 6, bundle: 5, plugin: 8, skill: 8 };
  const trustOptions: { value: TrustLevel; label: string }[] = [
    { value: "verified", label: "Verified" },
    { value: "scanned", label: "Security Scanned" },
    { value: "community", label: "Community" },
  ];

  return (
    <div>
      {onClose && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span className="eyebrow">Filters</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close filters"><X size={16} /></button>
        </div>
      )}

      <div className="filter-group">
        <div className="filter-group-title">Type</div>
        {(["agent", "bundle", "plugin", "skill"] as PackageType[]).map((t) => (
          <label key={t} className="checkbox-row">
            <input
              type="checkbox"
              checked={filters.types.includes(t)}
              onChange={() => toggle("types", t)}
            />
            {t.charAt(0).toUpperCase() + t.slice(1)}s
            <span className="count">{typeCounts[t]}</span>
          </label>
        ))}
      </div>

      <div className="filter-group">
        <div className="filter-group-title">Category</div>
        {categories.slice(0, 8).map((c) => (
          <label key={c.slug} className="checkbox-row">
            <input
              type="checkbox"
              checked={filters.categories.includes(c.slug)}
              onChange={() => toggle("categories", c.slug)}
            />
            {c.name}
            <span className="count">{c.count}</span>
          </label>
        ))}
      </div>

      <div className="filter-group">
        <div className="filter-group-title">Compatibility</div>
        <label className="checkbox-row">
          <input type="checkbox" disabled checked readOnly />
          DeepSeek Harness
          <span className="count">all</span>
        </label>
      </div>

      <div className="filter-group">
        <div className="filter-group-title">Trust</div>
        {trustOptions.map((t) => (
          <label key={t.value} className="checkbox-row">
            <input
              type="checkbox"
              checked={filters.trust.includes(t.value)}
              onChange={() => toggle("trust", t.value)}
            />
            {t.label}
          </label>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   Sort + view controls
   ============================================================ */
export function SortSelect({ value, onChange }: { value: SortKey; onChange: (v: SortKey) => void }) {
  return (
    <select
      className="sort-select"
      value={value}
      onChange={(e) => onChange(e.target.value as SortKey)}
      aria-label="Sort results"
    >
      {sortOptions.map((o) => (
        <option key={o.key} value={o.key}>{o.label}</option>
      ))}
    </select>
  );
}

export function ViewToggle({ view, onChange }: { view: "grid" | "list"; onChange: (v: "grid" | "list") => void }) {
  return (
    <div className="view-toggle" role="group" aria-label="Result layout">
      <button className={view === "grid" ? "on" : ""} onClick={() => onChange("grid")} aria-label="Grid view" aria-pressed={view === "grid"}>
        <LayoutGrid size={14} />
      </button>
      <button className={view === "list" ? "on" : ""} onClick={() => onChange("list")} aria-label="List view" aria-pressed={view === "list"}>
        <List size={14} />
      </button>
    </div>
  );
}

export function MobileFilterButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="btn btn-outline btn-sm mobile-filter-btn" onClick={onClick}>
      <SlidersHorizontal size={13} /> Filters
    </button>
  );
}

/* ============================================================
   Active filter chips
   ============================================================ */
export function ActiveFilterChips({
  filters,
  onRemove,
  onClear,
}: {
  filters: Filters;
  onRemove: (group: "types" | "categories" | "trust", value: string) => void;
  onClear: () => void;
}) {
  const chips: { group: "types" | "categories" | "trust"; value: string; label: string }[] = [];
  filters.types.forEach((t) => chips.push({ group: "types", value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }));
  filters.categories.forEach((slug) => {
    const c = categories.find((x) => x.slug === slug);
    chips.push({ group: "categories", value: slug, label: c ? c.name : slug });
  });
  filters.trust.forEach((t) => chips.push({ group: "trust", value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }));

  if (chips.length === 0) return null;
  return (
    <div className="filter-chips" style={{ width: "100%", marginTop: 8 }}>
      {chips.map((c) => (
        <span key={c.group + c.value} className="filter-chip">
          {c.label}
          <button onClick={() => onRemove(c.group, c.value)} aria-label={"Remove filter " + c.label}>
            <X size={11} />
          </button>
        </span>
      ))}
      <button className="btn btn-ghost btn-sm" onClick={onClear} style={{ height: 24, fontSize: 11.5 }}>
        Clear all
      </button>
    </div>
  );
}
