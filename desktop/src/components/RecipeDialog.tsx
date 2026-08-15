// RecipeDialog — 组合模板的安装面板（Recipes 的核心交互）。
// Effectiveness gates — combinations are never arbitrary:
//   1. slot → real registry component resolution (first available id wins);
//   2. per-component readiness: adapted (runnable) vs source-imported;
//   3. dependency resolution (real Rust kernel) runs BEFORE install —
//      conflicts / missing dependencies block the recipe with reasons.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, Check, CircleDashed, Github, ShieldCheck } from "lucide-react";
import { bundleCreate, bundleInstall, composerResolve, registryInfo } from "../ipc";
import type { RegistrySummary, ResolveReport } from "../ipc";
import { useI18n } from "../i18n";
import { Modal, Badge, useToast, typeIcon } from "./ui";
import InstallProgress from "./InstallProgress";
import type { Recipe } from "../data/recipes";
import { resolveRecipe } from "../data/recipes";

type Status = "confirm" | "resolving" | "running" | "done" | "failed" | "blocked";

/** A registry component is "adapted" when it can actually run inside an agent. */
function isAdapted(info: Record<string, any> | null): boolean {
  if (!info) return false;
  const artifact = info.artifact;
  if (artifact && (artifact.filename || artifact.sha256)) return true;
  const runtimeProfile = info.runtime?.profile;
  if (runtimeProfile && Array.isArray(runtimeProfile.bundles) && runtimeProfile.bundles.length > 0) return true;
  const ep = info.entrypoint;
  if (ep && (ep.profile || ep.command)) return true;
  return false;
}

export default function RecipeDialog({
  recipe,
  registry,
  installed,
  onClose,
  onFinished,
}: {
  recipe: Recipe | null;
  registry: RegistrySummary[] | null;
  installed: Record<string, Record<string, unknown>>;
  onClose: () => void;
  onFinished?: () => void;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [status, setStatus] = useState<Status>("confirm");
  const [err, setErr] = useState<string | null>(null);
  const [failedAt, setFailedAt] = useState<number | undefined>(undefined);
  const [details, setDetails] = useState<Record<string, Record<string, any> | null>>({});
  const [report, setReport] = useState<ResolveReport | null>(null);

  useEffect(() => {
    if (recipe) {
      setStatus("confirm");
      setErr(null);
      setFailedAt(undefined);
      setDetails({});
      setReport(null);
    }
  }, [recipe]);

  const resolved = useMemo(() => {
    if (!recipe || !registry) return [];
    const ids = new Set(registry.map((p) => p.id));
    return resolveRecipe(recipe, ids);
  }, [recipe, registry]);

  // Resolved components — memoized so the details-fetch effect below has a
  // stable dependency (rules of hooks: all hooks must run unconditionally).
  const available = useMemo(
    () =>
      recipe && registry
        ? resolved
            .filter((r) => r.componentId)
            .map((r) => ({
              slot: r.slot,
              pkg: registry.find((p) => p.id === r.componentId)!,
            }))
        : [],
    [resolved, recipe, registry]
  );

  // Fetch real manifest details per component to judge adaptation readiness.
  useEffect(() => {
    if (!recipe || available.length === 0) return;
    let cancelled = false;
    Promise.all(
      available.map((a) =>
        registryInfo(a.pkg.id)
          .then((info) => ({ id: a.pkg.id, info: info as Record<string, any> }))
          .catch(() => ({ id: a.pkg.id, info: null }))
      )
    ).then((rows) => {
      if (cancelled) return;
      const map: Record<string, Record<string, any> | null> = {};
      for (const row of rows) map[row.id] = row.info;
      setDetails(map);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe, available]);

  if (!recipe) return null;

  const L = (x: { zh: string; en: string }) => (locale === "zh" ? x.zh : x.en);
  // Narrow for closures: after the guard, recipe is non-null here.
  const currentRecipe = recipe;
  const licenses = Array.from(
    new Set(available.map((a) => a.pkg.license).filter(Boolean))
  );

  const adaptedCount = available.filter((a) => isAdapted(details[a.pkg.id] ?? null)).length;

  async function install() {
    const recipeName = L(currentRecipe.name);
    const ids = available.map((a) => a.pkg.id);
    // Gate 1: dependency resolution — never install an unvalidated combination.
    setStatus("resolving");
    setErr(null);
    try {
      const rep = await composerResolve(ids);
      setReport(rep);
      if (rep.conflicts.length > 0 || rep.missing.length > 0) {
        setStatus("blocked");
        return;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStatus("failed");
      return;
    }
    // Gate 1 passed → real bundle install.
    setStatus("running");
    try {
      await bundleCreate(currentRecipe.id, ids);
      const res = (await bundleInstall(currentRecipe.id)) as Record<string, unknown>;
      if (res.ok === false) {
        setFailedAt(typeof res.failedAt === "number" ? res.failedAt : undefined);
        setErr(String(res.note ?? t("common.failed")));
        setStatus("failed");
        toast("error", t("toast.installFailed"), recipeName);
        return;
      }
      setStatus("done");
      toast("success", t("recipe.done"), recipeName);
      onFinished?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStatus("failed");
      toast("error", t("toast.installFailed"), recipeName);
    }
  }

  const body =
    status === "confirm" ? (
      <div className="install-sheet">
        <p className="sub" style={{ marginBottom: 10, lineHeight: 1.6 }}>{L(currentRecipe.description)}</p>

        <div className="recipe-block-title">{t("recipe.flow")}</div>
        <div className="recipe-flow">
          {currentRecipe.flow.map((f, i) => (
            <div key={i} className="recipe-flow-row">
              <span className="recipe-flow-step">{L(f)}</span>
              {i < currentRecipe.flow.length - 1 && (
                <ArrowDown size={11} className="recipe-flow-arrow" />
              )}
            </div>
          ))}
        </div>

        <div className="recipe-block-title">
          {t("recipe.components")} · {available.length}/{resolved.length}
        </div>
        <div className="recipe-slots">
          {resolved.map((r, i) => {
            const pkg = r.componentId ? available.find((a) => a.pkg.id === r.componentId)?.pkg : null;
            const isInstalled = pkg ? pkg.id in installed : false;
            const Icon = pkg ? typeIcon(pkg.type) : CircleDashed;
            const adapted = pkg ? isAdapted(details[pkg.id] ?? null) : false;
            return (
              <div key={i} className="recipe-slot">
                <span className="recipe-slot-role">{L(r.slot.role)}</span>
                {pkg ? (
                  <>
                    <span className="recipe-slot-ico"><Icon size={12} /></span>
                    <span className="recipe-slot-name">{pkg.id}</span>
                    <span className="recipe-slot-meta">{pkg.type} · v{pkg.versionLatest}</span>
                    {isInstalled ? (
                      <Badge tone="accent"><Check size={9} /> {t("recipe.slot.installed")}</Badge>
                    ) : adapted ? (
                      <Badge tone="verified" >{t("recipe.adapted")}</Badge>
                    ) : (
                      <span title={t("recipe.sourceOnlyTitle")}>
                        <Badge tone="warning">{t("recipe.sourceOnly")}</Badge>
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="recipe-slot-ico recipe-slot-ico--warn"><CircleDashed size={12} /></span>
                    <span className="recipe-slot-missing">{t("recipe.slot.missing")}</span>
                    <Link
                      className="recipe-slot-import"
                      to={
                        "/import?recipe=" +
                        encodeURIComponent(currentRecipe.id) +
                        "&role=" +
                        encodeURIComponent(L(r.slot.role))
                      }
                      onClick={onClose}
                      title={t("recipe.slot.importTitle", { role: L(r.slot.role) })}
                    >
                      <Github size={10} /> {t("recipe.slot.importHint")}
                    </Link>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="sheet-kv">
          <span className="k">{t("recipe.effectiveness")}</span>
          <span className="v">
            {t("recipe.effectivenessNote", { k: adaptedCount, n: available.length })}
          </span>
        </div>
        <div className="sheet-kv">
          <span className="k">{t("mp.license")}</span>
          <span className="v mono">{licenses.length > 0 ? licenses.join(" · ") : "—"}</span>
        </div>
        <div className="sheet-kv">
          <span className="k"><ShieldCheck size={12} /> {t("mp.security")}</span>
          <span className="v">{t("recipe.securityNote")}</span>
        </div>
      </div>
    ) : status === "blocked" ? (
      <div className="install-sheet">
        <div className="error-head" style={{ marginBottom: 8 }}>
          <CircleDashed size={14} className="error-ico" style={{ color: "var(--warning)" }} />
          <span className="error-title">{t("recipe.resolveBlockedTitle")}</span>
        </div>
        {report && report.conflicts.length > 0 && (
          <div className="error-reason" style={{ marginTop: 6 }}>
            <span className="lbl">{t("recipe.resolveConflicts")}</span>
            {report.conflicts.map((c, i) => (
              <div key={i}>⚠ {c}</div>
            ))}
          </div>
        )}
        {report && report.missing.length > 0 && (
          <div className="error-reason" style={{ marginTop: 6 }}>
            <span className="lbl">{t("recipe.resolveMissing")}</span>
            {report.missing.map((m, i) => (
              <div key={i}>○ {m}</div>
            ))}
          </div>
        )}
        <p className="field-hint" style={{ marginTop: 8 }}>{t("recipe.resolveBlockedNote")}</p>
      </div>
    ) : (
      <div className="install-sheet">
        {status === "resolving" && (
          <p className="sub" style={{ marginBottom: 4 }}>{t("recipe.resolving")}</p>
        )}
        {status !== "resolving" && (
          <p className="sub" style={{ marginBottom: 4 }}>{t("install.progressNote")}</p>
        )}
        {report && report.conflicts.length === 0 && report.missing.length === 0 && (
          <div className="note" data-tone="ok" style={{ marginBottom: 8 }}>
            <Check size={13} className="note-ico" />
            <span>{t("recipe.resolveOk")}</span>
          </div>
        )}
        <InstallProgress
          targetId={currentRecipe.id}
          forceDone={status === "done"}
          failedAt={failedAt}
          onFailed={() => setStatus("failed")}
        />
        {status === "failed" && (
          <div className="error-reason" style={{ marginTop: 8 }}>
            <span className="lbl">{t("err.reason")}</span> {err}
          </div>
        )}
        {status === "done" && (
          <div className="note" data-tone="ok" style={{ marginTop: 8 }}>
            <Check size={13} className="note-ico" />
            <span>
              {t("recipe.doneBody")}{" "}
              <Link to="/bundles" className="mono" style={{ color: "var(--accent)" }} onClick={onClose}>
                {t("nav.bundles")} →
              </Link>
            </span>
          </div>
        )}
      </div>
    );

  const footer =
    status === "confirm" ? (
      <>
        <button className="btn btn-ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button
          className="btn btn-primary"
          onClick={() => void install()}
          disabled={available.length < 2}
          title={available.length < 2 ? t("recipe.needTwo") : undefined}
        >
          {t("recipe.resolveAndInstall", { n: available.length })}
        </button>
      </>
    ) : status === "blocked" ? (
      <button className="btn btn-ghost" onClick={onClose}>{t("common.close")}</button>
    ) : (
      <button className="btn btn-ghost" onClick={onClose}>{t("common.close")}</button>
    );

  return (
    <Modal
      title={L(currentRecipe.name) + " · " + L(currentRecipe.category)}
      onClose={onClose}
      footer={footer}
      width={560}
    >
      <div className="modal-body">{body}</div>
    </Modal>
  );
}
