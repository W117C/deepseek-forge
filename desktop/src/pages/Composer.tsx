// Composer — the agent builder. Left: available components from the local
// registry. Right: the composition. Add / remove / reorder, resolve the
// dependency graph (real Rust Kernel), then create a bundle or a runnable agent.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  Check,
  Layers,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  bundleCreate,
  bundleInstall,
  bundleList,
  bundleUninstall,
  composeGenerate,
  composerResolve,
  dependentsList,
  registryList,
  stateList,
} from "../ipc";
import type { RegistrySummary, ResolveReport } from "../ipc";
import { useI18n } from "../i18n";
import {
  EmptyState,
  ErrorCard,
  InlineLoading,
  RowSkeleton,
  typeIcon,
  useDialog,
  useToast,
} from "../components/ui";
import { RECIPES } from "../data/recipes";

export default function Composer() {
  const { t, locale } = useI18n();
  const dialog = useDialog();
  const toast = useToast();
  const L = (x: { zh: string; en: string }) => (locale === "zh" ? x.zh : x.en);
  const [available, setAvailable] = useState<RegistrySummary[] | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [report, setReport] = useState<ResolveReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [bundleName, setBundleName] = useState("");
  const [bundles, setBundles] = useState<Record<string, any>[]>([]);
  const [bundleBusy, setBundleBusy] = useState<string | null>(null);
  const [bundleErr, setBundleErr] = useState<unknown>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentResult, setAgentResult] = useState<Record<string, unknown> | null>(null);
  const [agentErr, setAgentErr] = useState<unknown>(null);
  const [componentQuery, setComponentQuery] = useState("");

  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());

  function loadBundles() {
    bundleList()
      .then(setBundles)
      .catch((e: unknown) => setBundleErr(e));
    stateList()
      .then((s) => setInstalledIds(new Set(Object.keys(s.agents ?? {}))))
      .catch(() => setInstalledIds(new Set()));
  }
  useEffect(loadBundles, []);

  async function createBundle() {
    if (!bundleName.trim() || selected.length < 2) return;
    setBundleBusy("create");
    setBundleErr(null);
    try {
      // 有效性门禁：组合必须先通过依赖解析，拒绝随意组合。
      const rep = await composerResolve(selected);
      setReport(rep);
      if (rep.conflicts.length > 0 || rep.missing.length > 0) {
        const reasons = [
          ...rep.conflicts.map((c) => "⚠ " + c),
          ...rep.missing.map((m) => "○ " + m),
        ].join("\n");
        setBundleErr(new Error(t("co.createBlocked") + "\n" + reasons));
        return;
      }
      await bundleCreate(bundleName.trim(), selected);
      toast("success", t("toast.bundleCreated", { name: bundleName.trim() }));
      setBundleName("");
      loadBundles();
    } catch (e) {
      setBundleErr(e);
    } finally {
      setBundleBusy(null);
    }
  }

  async function generateAgent() {
    if (!bundleName.trim() || selected.length < 2) return;
    setAgentBusy(true);
    setAgentErr(null);
    setAgentResult(null);
    try {
      const res = await composeGenerate(bundleName.trim(), selected);
      setAgentResult(res as unknown as Record<string, unknown>);
      toast("success", t("co.agentGeneratedShort", { name: bundleName.trim() }));
    } catch (e) {
      setAgentErr(e);
    } finally {
      setAgentBusy(false);
    }
  }

  async function installBundle(id: string) {
    setBundleBusy("install:" + id);
    setBundleErr(null);
    try {
      await bundleInstall(id);
      toast("success", t("toast.bundleInstalled", { name: id }));
      loadBundles();
    } catch (e) {
      setBundleErr(e);
    } finally {
      setBundleBusy(null);
    }
  }

  async function uninstallBundle(id: string) {
    const bundle = bundles.find((b) => b.id === id);
    const comps: string[] = Array.isArray(bundle?.components) ? bundle.components : [];
    const conflicts: string[] = [];
    for (const cid of comps) {
      try {
        const d = await dependentsList(cid);
        const others = (d.dependents ?? []).filter(
          (r) => !(r.kind === "bundle" && r.id === id)
        );
        if (others.length > 0) {
          conflicts.push(
            cid + " → " + others.map((r) => r.kind + " " + r.id).join(", ")
          );
        }
      } catch {
        /* a failed dependency query must not block the main flow */
      }
    }
    if (conflicts.length > 0) {
      await dialog.confirm({
        title: t("co.uninstallBlockedBy"),
        body: t("co.uninstallBlockedBody"),
        list: conflicts,
        confirmLabel: t("common.close"),
      });
      return;
    }
    const ok = await dialog.confirm({
      title: t("dialog.uninstallTitle", { id }),
      body: t("co.confirmUninstall", { id }),
      confirmLabel: t("plugins.uninstall"),
      danger: true,
    });
    if (!ok) return;
    setBundleBusy("uninstall:" + id);
    setBundleErr(null);
    try {
      await bundleUninstall(id);
      toast("success", t("toast.uninstalled", { name: id }));
      loadBundles();
    } catch (e) {
      setBundleErr(e);
    } finally {
      setBundleBusy(null);
    }
  }

  useEffect(() => {
    registryList()
      .then(setAvailable)
      .catch((e: unknown) => setErr(e));
  }, []);

  const pool = useMemo(() => {
    const q = componentQuery.trim().toLowerCase();
    let list = available ?? [];
    if (q) {
      list = list.filter((p) =>
        [p.name, p.id, p.description, p.type].join(" ").toLowerCase().includes(q)
      );
    }
    return list;
  }, [available, componentQuery]);

  function add(id: string) {
    setReport(null);
    setSelected((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function remove(id: string) {
    setReport(null);
    setSelected((prev) => prev.filter((x) => x !== id));
  }

  function move(idx: number, dir: -1 | 1) {
    setReport(null);
    setSelected((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return next;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  async function resolve() {
    setBusy(true);
    setErr(null);
    try {
      setReport(await composerResolve(selected));
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  const selSummary = useMemo(
    () =>
      selected
        .map((id) => (available ?? []).find((p) => p.id === id))
        .filter(Boolean) as RegistrySummary[],
    [selected, available]
  );

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-heading">{t("nav.bundles")}</h1>
          <p className="page-sub">{t("co.subtitle")}</p>
        </div>
      </header>

      {err ? <ErrorCard error={err} /> : null}

      {!available && !err && <RowSkeleton rows={6} />}

      {available && (
        <div className="composer-grid">
          <div className="pane">
            <div className="pane-head">
              <span className="pane-title">{t("co.available")}</span>
              <span className="pane-count">{pool.length}</span>
            </div>
            <div className="pane-body">
              <div className="search-box" style={{ marginBottom: 10 }}>
                <Search size={13} className="search-icon" />
                <input
                  className="input"
                  placeholder={t("mp.search")}
                  value={componentQuery}
                  onChange={(e) => setComponentQuery(e.target.value)}
                />
              </div>
              <div className="pane-scroll">
                {pool.length === 0 && <p className="sub">{t("co.empty")}</p>}
                {pool.map((p) => {
                  const Icon = typeIcon(p.type);
                  const isSel = selected.includes(p.id);
                  return (
                    <div key={p.id} className={"avail-item" + (isSel ? " is-selected" : "")}>
                      <span className="avail-ico">
                        <Icon size={13} />
                      </span>
                      <div className="avail-main">
                        <div className="avail-name">{p.id}</div>
                        <div className="avail-meta">
                          {p.type} · v{p.versionLatest}
                        </div>
                      </div>
                      {!isSel && (
                        <button
                          className="icon-btn accent"
                          onClick={() => add(p.id)}
                          aria-label={t("co.add") + " " + p.id}
                          title={t("co.add")}
                        >
                          <Plus size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pane">
            <div className="pane-head">
              <span className="pane-title">{t("co.composition")}</span>
              <span className="pane-count">{selSummary.length}</span>
            </div>
            <div className="pane-body">
              <div className="pane-scroll" style={{ minHeight: 120 }}>
                {selSummary.length === 0 && (
                  <EmptyState
                    icon={Layers}
                    title={t("co.selectHint")}
                    body={t("co.selectHintBody")}
                  />
                )}
                {selSummary.map((p, i) => (
                  <div key={p.id} className="comp-item">
                    <span className="comp-index">{i + 1}</span>
                    <div className="comp-main">
                      <div className="avail-name">{p.id}</div>
                      <div className="avail-meta">
                        {p.type} · v{p.versionLatest}
                      </div>
                    </div>
                    <div className="comp-controls">
                      <button
                        className="icon-btn"
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        aria-label={t("co.moveUp")}
                        title={t("co.moveUp")}
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        className="icon-btn"
                        onClick={() => move(i, 1)}
                        disabled={i === selSummary.length - 1}
                        aria-label={t("co.moveDown")}
                        title={t("co.moveDown")}
                      >
                        <ArrowDown size={13} />
                      </button>
                      <button
                        className="icon-btn danger"
                        onClick={() => remove(p.id)}
                        aria-label={t("co.remove") + " " + p.id}
                        title={t("co.remove")}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <button
                  className="btn btn-outline"
                  onClick={() => void resolve()}
                  disabled={busy || selSummary.length === 0}
                >
                  {busy ? (
                    <InlineLoading label={t("co.resolving")} />
                  ) : (
                    <>
                      <Boxes size={13} />
                      {t("co.resolve")}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {available && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="panel-title">{t("co.createTitle")}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="search-box">
              <Layers size={13} className="search-icon" />
              <input
                className="input"
                placeholder={t("co.bundleNamePlaceholder")}
                value={bundleName}
                onChange={(e) => setBundleName(e.target.value)}
              />
            </div>
            <button
              className="btn btn-primary"
              onClick={() => void createBundle()}
              disabled={bundleBusy === "create" || selSummary.length < 2}
              title={selSummary.length < 2 ? t("co.needTwo") : undefined}
            >
              {bundleBusy === "create" ? (
                <InlineLoading label={t("co.creating")} />
              ) : (
                <>
                  <Layers size={13} />
                  {t("co.createBundle")}
                </>
              )}
            </button>
            <button
              className="btn btn-outline"
              onClick={() => void generateAgent()}
              disabled={agentBusy || selSummary.length < 2}
              title={selSummary.length < 2 ? t("co.needTwo") : undefined}
            >
              {agentBusy ? (
                <InlineLoading label={t("co.generating")} />
              ) : (
                <>
                  <Sparkles size={13} />
                  {t("co.generateAgent")}
                </>
              )}
            </button>
          </div>
          {selSummary.length < 2 && (
            <p className="field-hint" style={{ color: "var(--warning)" }}>
              {t("co.needTwo")}（{t("co.haveSelected", { n: selSummary.length })}）
            </p>
          )}
          <p className="field-hint">{t("co.agentOnlyHint")}</p>
          {agentErr ? (
            <div style={{ marginTop: 8 }}>
              <ErrorCard error={agentErr} />
            </div>
          ) : null}
          {agentResult && (
            <div className="note" data-tone="ok" style={{ marginTop: 10 }}>
              <Sparkles size={13} className="note-ico" />
              <span>
                {t("co.agentGenerated", {
                  id: String(agentResult.agentId ?? ""),
                  profile: String(agentResult.profile ?? ""),
                })}{" "}
                <Link to="/agents" className="mono" style={{ color: "var(--accent)" }}>
                  {t("nav.agents")} →
                </Link>
              </span>
            </div>
          )}
        </div>
      )}

      {report && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="panel-title">{t("co.dependencyGraph")}</div>
          {report.conflicts.length > 0 && (
            <div className="note" style={{ marginBottom: 10 }}>
              {report.conflicts.map((c, i) => (
                <div key={i}>⚠ {c}</div>
              ))}
            </div>
          )}
          {report.missing.length > 0 && (
            <div className="field-hint" style={{ marginBottom: 10 }}>
              {report.missing.map((m, i) => (
                <div key={i}>{m}</div>
              ))}
            </div>
          )}
          {report.order.length > 0 ? (
            <div className="resolve-flow">
              {report.order.map((o, i) => (
                <span key={o}>
                  <span className={"resolve-step" + (i === 0 ? " acc" : "")}>
                    {o}
                  </span>
                  {i < report.order.length - 1 && (
                    <span className="resolve-arrow" style={{ margin: "0 4px" }}>
                      →
                    </span>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <p className="sub">{t("co.resolveEmpty")}</p>
          )}
          <p className="field-hint" style={{ marginTop: 10 }}>
            {t("co.installNote")}
          </p>
        </div>
      )}

      {bundles.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div className="sec-head" style={{ margin: "0 0 12px" }}>
            <h2 className="sec-title">{t("co.bundles")}</h2>
            <span className="sec-count">{bundles.length}</span>
          </div>
          {bundles.map((b) => {
            const recipe = RECIPES.find((r) => r.id === b.id);
            const comps: string[] = Array.isArray(b.components) ? b.components : [];
            return (
              <div key={b.id} className="card bundle-stack-card" style={{ marginBottom: 12 }}>
                <div className="bundle-stack-head">
                  <span className="bundle-stack-name">{b.name}</span>
                  {recipe && (
                    <Link
                      to="/marketplace"
                      className="badge badge-accent"
                      title={t("co.viewRecipe")}
                    >
                      {t("co.recipeBadge")} · {L(recipe.name)}
                    </Link>
                  )}
                  <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => void installBundle(b.id)}
                      disabled={bundleBusy !== null}
                    >
                      {bundleBusy === "install:" + b.id ? (
                        <InlineLoading label={t("co.installAll")} />
                      ) : (
                        t("co.installAll")
                      )}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => void uninstallBundle(b.id)}
                      disabled={bundleBusy !== null}
                    >
                      {t("plugins.uninstall")}
                    </button>
                  </span>
                </div>

                <div className="bundle-stack">
                  {comps.map((cid, i) => {
                    const pkg = (available ?? []).find((p) => p.id === cid);
                    const Icon = typeIcon(pkg?.type);
                    const isInstalled = installedIds.has(cid);
                    return (
                      <div key={cid} className="stack-cap">
                        <span className="comp-index">{i + 1}</span>
                        <span className="stack-cap-ico"><Icon size={12} /></span>
                        <span className="stack-cap-name">{cid}</span>
                        {pkg && (
                          <span className="stack-cap-meta">{pkg.type} · v{pkg.versionLatest}</span>
                        )}
                        {isInstalled ? (
                          <span className="stack-cap-state ok">
                            <Check size={11} /> {t("co.stackInstalled")}
                          </span>
                        ) : (
                          <span className="stack-cap-state">{t("co.stackNotInstalled")}</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {recipe?.capabilities && recipe.capabilities.length > 0 && (
                  <div className="stack-caps">
                    <span className="stack-caps-title">{t("co.capabilities")}</span>
                    {recipe.capabilities.map((c) => (
                      <span key={c.en} className="stack-cap-chip">
                        <Check size={10} />
                        {L(c)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {bundleErr ? (
        <div style={{ marginTop: 12 }}>
          <ErrorCard error={bundleErr} />
        </div>
      ) : null}
    </div>
  );
}
