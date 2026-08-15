// Marketplace — capabilities curated from the open-source registry.
// Two levels: Components (package cards) and Recipes (composition templates).
// Recipe install = real bundle_create + bundle_install over real components.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChartColumn,
  Code,
  ExternalLink,
  Github,
  GitFork,
  Globe,
  GraduationCap,
  Layers,
  PenLine,
  Search,
  ShieldCheck,
  ShoppingCart,
  Star,
  TrendingUp,
} from "lucide-react";
import { openExternal, registryList, stateList } from "../ipc";
import type { RegistrySummary } from "../ipc";
import { useI18n } from "../i18n";
import { typeIcon, PkgCardSkeleton, EmptyState, ErrorCard, Badge, Segmented } from "../components/ui";
import InstallDialog from "../components/InstallDialog";
import type { InstallTarget } from "../components/InstallDialog";
import RecipeDialog from "../components/RecipeDialog";
import { RECIPES, resolveRecipe } from "../data/recipes";
import type { Recipe } from "../data/recipes";

const RECIPE_ICONS: Record<string, LucideIcon> = {
  research: BookOpen,
  coding: Code,
  academic: GraduationCap,
  data: ChartColumn,
  finance: TrendingUp,
  content: PenLine,
  engineering: GitFork,
  browser: Globe,
  ecommerce: ShoppingCart,
  custom: Layers,
};

function recipeIcon(r: Recipe): LucideIcon {
  const cat = r.category.en.toLowerCase();
  if (cat.includes("research") && r.id === "browser-research") return RECIPE_ICONS.browser;
  if (cat.includes("coding") || r.id === "coding-agent") return RECIPE_ICONS.coding;
  if (cat.includes("academic")) return RECIPE_ICONS.academic;
  if (cat.includes("data")) return RECIPE_ICONS.data;
  if (cat.includes("finance")) return RECIPE_ICONS.finance;
  if (cat.includes("content")) return RECIPE_ICONS.content;
  if (cat.includes("engineering")) return RECIPE_ICONS.engineering;
  if (cat.includes("e-commerce")) return RECIPE_ICONS.ecommerce;
  if (r.composerOnly) return RECIPE_ICONS.custom;
  return RECIPE_ICONS.research;
}

type View = "components" | "recipes";

export default function Marketplace() {
  const { t, locale } = useI18n();
  const [view, setView] = useState<View>("components");
  const [packages, setPackages] = useState<RegistrySummary[] | null>(null);
  const [installed, setInstalled] = useState<Record<string, Record<string, unknown>>>({});
  const [err, setErr] = useState<unknown>(null);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState("popular");
  const [onlyInstalled, setOnlyInstalled] = useState(false);
  const [licFilter, setLicFilter] = useState("all");
  const [featured, setFeatured] = useState(false);
  const [installTarget, setInstallTarget] = useState<InstallTarget | null>(null);
  const [recipeTarget, setRecipeTarget] = useState<Recipe | null>(null);

  function load() {
    setErr(null);
    setPackages(null);
    Promise.all([registryList(), stateList()])
      .then(([pkgs, state]) => {
        setPackages(pkgs);
        setInstalled((state.agents ?? {}) as Record<string, Record<string, unknown>>);
      })
      .catch((e: unknown) => setErr(e));
  }

  useEffect(load, []);

  const filtered = useMemo(() => {
    let list = packages ?? [];
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((p) =>
        [p.name, p.id, p.description, p.category ?? "", p.license ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    if (cat !== "all") list = list.filter((p) => p.type === cat);
    if (onlyInstalled) list = list.filter((p) => p.id in installed);
    if (licFilter !== "all") list = list.filter((p) => (p.license ?? "") === licFilter);
    if (featured) list = list.filter((p) => p.publisher === "agenthub");
    const sorted = [...list];
    if (sort === "popular") sorted.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));
    else if (sort === "recent")
      sorted.sort((a, b) => String(b.pushedAt ?? "").localeCompare(String(a.pushedAt ?? "")));
    else sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [packages, query, cat, sort, onlyInstalled, installed, licFilter, featured]);

  // Sections: Featured (curated) + the rest — only when the grid is unfiltered.
  const sectionsActive = !query && cat === "all" && !onlyInstalled && licFilter === "all" && !featured;
  const featuredList = useMemo(
    () =>
      sectionsActive
        ? filtered.filter((p) => p.publisher === "agenthub").slice(0, 6)
        : [],
    [filtered, sectionsActive]
  );
  const restList = useMemo(
    () =>
      sectionsActive ? filtered.filter((p) => p.publisher !== "agenthub") : filtered,
    [filtered, sectionsActive]
  );

  const licenses = useMemo(() => {
    const set = new Set<string>();
    (packages ?? []).forEach((p) => {
      if (p.license) set.add(p.license);
    });
    return Array.from(set).sort();
  }, [packages]);

  const cats = useMemo(() => {
    const set = new Set<string>();
    (packages ?? []).forEach((p) => set.add(p.type));
    return ["all", ...Array.from(set)];
  }, [packages]);

  const registryIds = useMemo(
    () => new Set((packages ?? []).map((p) => p.id)),
    [packages]
  );

  const filteredRecipes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return RECIPES;
    return RECIPES.filter((r) =>
      [r.id, r.name.zh, r.name.en, r.category.zh, r.category.en]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [query]);

  function openInstall(p: RegistrySummary) {
    setInstallTarget({
      id: p.id,
      name: p.name,
      version: p.versionLatest,
      repository: p.repository,
      license: p.license,
      capabilities: p.capabilities ?? [],
    });
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-heading">{t("mp.title")}</h1>
          <p className="page-sub">
            {view === "components" ? t("mp.subtitle") : t("mp.recipesSubtitle")}
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn btn-outline" to="/import">
            <Github size={14} />
            {t("nav.import")}
          </Link>
        </div>
      </header>

      <div style={{ marginBottom: 20 }}>
        <Segmented<View>
          value={view}
          onChange={setView}
          ariaLabel={t("mp.viewLabel")}
          options={[
            { value: "components", label: t("mp.viewComponents"), count: packages?.length },
            { value: "recipes", label: t("mp.viewRecipes"), count: RECIPES.length },
          ]}
        />
      </div>

      {view === "components" && (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <div className="search-box">
              <Search size={13} className="search-icon" />
              <input
                className="input"
                placeholder={t("mp.search")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select
              className="input"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              style={{ width: 150, flexShrink: 0 }}
            >
              <option value="popular">{t("mp.sort.popular")}</option>
              <option value="recent">{t("mp.sort.recent")}</option>
              <option value="az">{t("mp.sort.az")}</option>
            </select>
            <select
              className="input"
              value={licFilter}
              onChange={(e) => setLicFilter(e.target.value)}
              style={{ width: 140, flexShrink: 0 }}
            >
              <option value="all">{t("mp.filterLicense")}</option>
              {licenses.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
            <div className="seg" role="tablist" aria-label={t("mp.categories")}>
              {cats.map((c) => (
                <button
                  key={c}
                  role="tab"
                  aria-selected={cat === c}
                  className={"seg-item" + (cat === c ? " on" : "")}
                  onClick={() => setCat(c)}
                >
                  {c === "all" ? t("mp.all") : c}
                </button>
              ))}
            </div>
            <button
              className={"btn btn-ghost btn-sm" + (featured ? " btn-outline" : "")}
              onClick={() => setFeatured((v) => !v)}
            >
              {t("mp.featured")}
            </button>
            <button
              className={"btn btn-ghost btn-sm" + (onlyInstalled ? " btn-outline" : "")}
              onClick={() => setOnlyInstalled((v) => !v)}
            >
              {onlyInstalled ? t("mp.onlyInstalled") : t("mp.allPackages")}
            </button>
          </div>

          {err ? <ErrorCard error={err} onRetry={load} title={t("mp.loadFailed")} /> : null}

          {!err && !packages && (
            <div className="mp-grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <PkgCardSkeleton key={i} />
              ))}
            </div>
          )}

          {!err && packages && filtered.length === 0 && (
            <EmptyState icon={Search} title={t("mp.empty")} body={t("mp.emptyBody")} />
          )}

          {!err && packages && (
            <>
              {featuredList.length > 0 && (
                <section>
                  <div className="sec-head">
                    <h2 className="sec-title">{t("mp.featuredTitle")}</h2>
                    <span className="sec-count">{featuredList.length}</span>
                  </div>
                  <div className="mp-grid">
                    {featuredList.map((p) => (
                      <PkgCard
                        key={p.id}
                        p={p}
                        installed={installed}
                        onInstall={() => openInstall(p)}
                        t={t}
                      />
                    ))}
                  </div>
                </section>
              )}

              {restList.length > 0 && (
                <section style={featuredList.length > 0 ? { marginTop: 28 } : undefined}>
                  {sectionsActive && featuredList.length > 0 && (
                    <div className="sec-head">
                      <h2 className="sec-title">{t("mp.allPackages")}</h2>
                      <span className="sec-count">{restList.length}</span>
                    </div>
                  )}
                  <div className="mp-grid">
                    {restList.map((p) => (
                      <PkgCard
                        key={p.id}
                        p={p}
                        installed={installed}
                        onInstall={() => openInstall(p)}
                        t={t}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}

      {view === "recipes" && (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
            <div className="search-box" style={{ maxWidth: 340 }}>
              <Search size={13} className="search-icon" />
              <input
                className="input"
                placeholder={t("mp.searchRecipes")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <span className="sec-count">{filteredRecipes.length} recipes</span>
          </div>

          {filteredRecipes.length === 0 && (
            <EmptyState icon={Layers} title={t("mp.empty")} body={t("mp.emptyBody")} />
          )}

          <div className="mp-grid">
            {filteredRecipes.map((r) => (
              <RecipeCard
                key={r.id}
                recipe={r}
                registryIds={registryIds}
                installed={installed}
                locale={locale}
                onOpen={() => setRecipeTarget(r)}
                t={t}
              />
            ))}
          </div>
        </>
      )}

      <InstallDialog
        target={installTarget}
        onClose={() => setInstallTarget(null)}
        onFinished={load}
      />

      <RecipeDialog
        recipe={recipeTarget}
        registry={packages}
        installed={installed}
        onClose={() => setRecipeTarget(null)}
        onFinished={load}
      />
    </div>
  );
}

function RecipeCard({
  recipe,
  registryIds,
  installed,
  locale,
  onOpen,
  t,
}: {
  recipe: Recipe;
  registryIds: Set<string>;
  installed: Record<string, Record<string, unknown>>;
  locale: "zh" | "en";
  onOpen: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const navigate = useNavigate();
  const L = (x: { zh: string; en: string }) => (locale === "zh" ? x.zh : x.en);
  const Icon = recipeIcon(recipe);
  const resolved = resolveRecipe(recipe, registryIds);
  const availableCount = resolved.filter((r) => r.componentId !== null).length;
  const installedCount = resolved.filter(
    (r) => r.componentId !== null && r.componentId! in installed
  ).length;

  if (recipe.composerOnly) {
    return (
      <div
        className="pkg-card pkg-card--clickable recipe-card"
        onClick={() => navigate("/bundles")}
        title={t("recipe.openComposer")}
      >
        <div className="pkg-head">
          <span className="pkg-icon acc">
            <Icon size={14} />
          </span>
          <div className="pkg-head-main">
            <span className="pkg-name">{L(recipe.name)}</span>
            <div className="pkg-subline">{L(recipe.category)} · {t("recipe.custom")}</div>
          </div>
        </div>
        <p className="pkg-desc">{L(recipe.description)}</p>
        <div className="pkg-caps">
          {(recipe.capabilities ?? []).map((c) => (
            <span key={c.en} className="chip">{L(c)}</span>
          ))}
        </div>
        <div className="pkg-foot">
          <span className="pkg-sec">
            <Layers size={12} /> {t("recipe.composeFree")}
          </span>
          <span className="btn btn-primary btn-sm">
            {t("recipe.openComposer")}
            <ArrowRight size={12} />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="pkg-card pkg-card--clickable recipe-card"
      onClick={onOpen}
      title={t("mp.viewDetails")}
    >
      <div className="pkg-head">
        <span className="pkg-icon acc">
          <Icon size={14} />
        </span>
        <div className="pkg-head-main">
          <span className="pkg-name">{L(recipe.name)}</span>
          <div className="pkg-subline">{L(recipe.category)}</div>
        </div>
        {installedCount > 0 && (
          <Badge tone="accent">{t("recipe.installedN", { n: installedCount })}</Badge>
        )}
      </div>

      <p className="pkg-desc">{L(recipe.tagline)}</p>

      <div className="recipe-card-flow">
        {recipe.flow.slice(0, 4).map((f, i) => (
          <span key={i} className="recipe-card-flow-row">
            <span className="recipe-flow-node">{L(f)}</span>
            {i < Math.min(recipe.flow.length, 4) - 1 && (
              <ArrowRight size={10} className="recipe-card-flow-arrow" />
            )}
          </span>
        ))}
      </div>

      <div className="pkg-caps">
        {(recipe.capabilities ?? []).slice(0, 3).map((c) => (
          <span key={c.en} className="chip">{L(c)}</span>
        ))}
      </div>

      <div className="pkg-foot">
        <span className="pkg-sec">
          <ShieldCheck size={12} />
          {t("recipe.availableN", { n: availableCount, m: resolved.length })}
        </span>
        <button
          className="btn btn-primary btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          {t("recipe.installShort")}
        </button>
      </div>
    </div>
  );
}

function PkgCard({
  p,
  installed,
  onInstall,
  t,
}: {
  p: RegistrySummary;
  installed: Record<string, Record<string, unknown>>;
  onInstall: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const navigate = useNavigate();
  const isInstalled = p.id in installed;
  const entry = installed[p.id] as { scanVerdict?: string } | undefined;
  const Icon = typeIcon(p.type);
  const repoShort = p.repository
    ? String(p.repository).replace("https://github.com/", "github.com/")
    : null;
  const openDetail = () => navigate("/plugins/" + p.id);

  return (
    <div
      className="pkg-card pkg-card--clickable"
      onClick={openDetail}
      title={t("mp.viewDetails")}
    >
      <div className="pkg-head">
        <span className="pkg-icon">
          <Icon size={14} />
        </span>
        <div className="pkg-head-main">
          <Link to={"/plugins/" + p.id} className="pkg-name">
            {p.name}
          </Link>
          <div className="pkg-subline">
            {p.type} · v{p.versionLatest}
          </div>
        </div>
        <span className="pkg-ver">v{p.versionLatest}</span>
      </div>

      <p className="pkg-desc">{p.description || "—"}</p>

      <div className="pkg-meta">
        <span>{p.license ?? t("mp.unknown")}</span>
        {repoShort && (
          <>
            <span className="sep">·</span>
            <a
              className="repo pkg-repo-link"
              href={p.repository ?? "#"}
              rel="noopener noreferrer"
              title={t("pd.open") + " · " + repoShort}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (p.repository) void openExternal(p.repository);
              }}
            >
              {repoShort}
              <ExternalLink size={10} />
            </a>
          </>
        )}
        {p.stars !== null && p.stars !== undefined && (
          <span className="pkg-stars">
            <Star size={11} />
            {p.stars}
          </span>
        )}
      </div>

      <div className="pkg-caps">
        {(p.capabilities ?? []).slice(0, 3).map((c) => (
          <span key={c} className="chip">
            {c}
          </span>
        ))}
      </div>

      <div className="pkg-foot">
        {isInstalled ? (
          entry?.scanVerdict ? (
            <span className="pkg-sec ok">
              <ShieldCheck size={12} />
              {t("mp.scanned")} · {entry.scanVerdict}
            </span>
          ) : (
            <Badge tone="accent">{t("mp.installed")} ✓</Badge>
          )
        ) : (
          <span className="pkg-sec">
            <ShieldCheck size={12} />
            {t("mp.unscanned")}
          </span>
        )}
        {isInstalled ? (
          <Link
            className="btn btn-ghost btn-sm"
            to={"/plugins/" + p.id}
            onClick={(e) => e.stopPropagation()}
          >
            {t("mp.view")}
            <ArrowUpRight size={12} />
          </Link>
        ) : (
          <button
            className="btn btn-primary btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              onInstall();
            }}
          >
            {t("mp.install")}
          </button>
        )}
      </div>
    </div>
  );
}
