// Increment ④: Composer —— 左：本地 Registry 可用组件；右：当前组合。
// Resolve 经 Rust Kernel 输出确定性安装序 + 冲突/缺失（提前发现）。
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Boxes, LoaderCircle, TriangleAlert } from "lucide-react";
import {
  bundleCreate,
  bundleInstall,
  bundleList,
  bundleUninstall,
  composerResolve,
  dependentsList,
  registryList,
} from "../ipc";
import type { RegistrySummary, ResolveReport } from "../ipc";
import { useI18n } from "../i18n";

export default function Composer() {
  const { t } = useI18n();
  const [available, setAvailable] = useState<RegistrySummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [report, setReport] = useState<ResolveReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [bundleName, setBundleName] = useState("");
  const [bundles, setBundles] = useState<Record<string, any>[]>([]);
  const [bundleBusy, setBundleBusy] = useState<string | null>(null);
  const [bundleErr, setBundleErr] = useState<string | null>(null);

  function loadBundles() {
    bundleList()
      .then(setBundles)
      .catch((e: unknown) => setBundleErr(e instanceof Error ? e.message : String(e)));
  }
  useEffect(loadBundles, []);

  async function createBundle() {
    if (!bundleName.trim() || selected.length < 2) return;
    setBundleBusy("create");
    setBundleErr(null);
    try {
      await bundleCreate(bundleName.trim(), selected);
      setBundleName("");
      loadBundles();
    } catch (e) {
      setBundleErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBundleBusy(null);
    }
  }

  async function installBundle(id: string) {
    setBundleBusy("install:" + id);
    setBundleErr(null);
    try {
      await bundleInstall(id);
      loadBundles();
    } catch (e) {
      setBundleErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBundleBusy(null);
    }
  }

  async function uninstallBundle(id: string) {
    const bundle = bundles.find((b) => b.id === id);
    const comps: string[] = Array.isArray(bundle?.components) ? bundle.components : [];
    // 组件级 used-by：卸载前逐一检查反向依赖（排除本组合自身）。
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
        /* 依赖查询失败不阻断主流程 */
      }
    }
    if (conflicts.length > 0) {
      window.alert(
        t("co.uninstallBlockedBy") +
          "\n\n" +
          t("co.uninstallBlockedBody") +
          "\n" +
          conflicts.map((c) => "• " + c).join("\n")
      );
      return;
    }
    if (!window.confirm(t("co.confirmUninstall", { id }))) return;
    setBundleBusy("uninstall:" + id);
    setBundleErr(null);
    try {
      await bundleUninstall(id);
      loadBundles();
    } catch (e) {
      setBundleErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBundleBusy(null);
    }
  }

  useEffect(() => {
    registryList()
      .then(setAvailable)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  const pool = available ?? [];

  function toggle(id: string) {
    setReport(null);
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function resolve() {
    setBusy(true);
    setErr(null);
    try {
      setReport(await composerResolve(selected));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const selSummary = useMemo(
    () => selected.map((id) => pool.find((p) => p.id === id)).filter(Boolean) as RegistrySummary[],
    [selected, pool]
  );

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-heading">{t("nav.bundles")}</h1>
        <p className="page-sub">{t("co.subtitle")}</p>
      </header>

      {err && (
        <div className="card error-state">
          <TriangleAlert size={18} className="err-icon" />
          <p>{err}</p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <h2 className="dashboard-section-title">{t("co.available")}</h2>
          {pool.length === 0 && <p className="sub">{t("co.empty")}</p>}
          {pool.map((p) => (
            <button
              key={p.id}
              className="btn btn-ghost"
              style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 4 }}
              onClick={() => toggle(p.id)}
            >
              {selected.includes(p.id) ? "✓ " : "○ "}
              <span className="mono">{p.id}</span>
              <span className="field-hint"> · {p.type} · v{p.versionLatest}</span>
            </button>
          ))}
        </div>

        <div className="card">
          <h2 className="dashboard-section-title">{t("co.composition")}</h2>
          {selSummary.length === 0 && <p className="sub">{t("co.selectHint")}</p>}
          {selSummary.map((p) => (
            <div key={p.id} className="registry-row">
              <span className="registry-k mono">{p.id}</span>
              <span className="registry-v">{p.type} · v{p.versionLatest}</span>
            </div>
          ))}
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={() => void resolve()} disabled={busy || selSummary.length === 0}>
              {busy ? <LoaderCircle size={14} className="spin" /> : <Boxes size={14} />}
              {t("co.resolve")}
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder={t("co.bundleNamePlaceholder")}
          value={bundleName}
          onChange={(e) => setBundleName(e.target.value)}
        />
        <button
          className="btn btn-primary"
          onClick={() => void createBundle()}
          disabled={bundleBusy === "create" || selSummary.length < 2}
        >
          {bundleBusy === "create" ? <LoaderCircle size={14} className="spin" /> : null}
          {t("co.createBundle")}
        </button>
      </div>

      {bundles.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h2 className="dashboard-section-title">{t("co.bundles")}</h2>
          {bundles.map((b) => (
            <div key={b.id} className="registry-row" style={{ padding: "8px 0" }}>
              <span className="registry-k mono">{b.name}</span>
              <span className="registry-v" style={{ flex: 1 }}>
                {(b.components ?? []).join(", ")}
              </span>
              <button className="btn btn-ghost" onClick={() => void installBundle(b.id)} disabled={bundleBusy !== null}>
                {bundleBusy === "install:" + b.id ? <LoaderCircle size={14} className="spin" /> : null}
                {t("co.installAll")}
              </button>
              <button className="btn btn-ghost" onClick={() => void uninstallBundle(b.id)} disabled={bundleBusy !== null}>
                {t("plugins.uninstall")}
              </button>
            </div>
          ))}
        </div>
      )}

      {bundleErr && <div className="field-error" style={{ marginTop: 10 }}>{bundleErr}</div>}

      {report && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 className="dashboard-section-title">{t("co.dependencyGraph")}</h2>
          {report.conflicts.length > 0 && (
            <div className="field-error">
              {report.conflicts.map((c) => (
                <div key={c}>⚠ {c}</div>
              ))}
            </div>
          )}
          {report.missing.length > 0 && (
            <div className="field-hint">
              {report.missing.map((m) => (
                <div key={m}>{m}</div>
              ))}
            </div>
          )}
          <div className="mono" style={{ marginTop: 8 }}>
            {report.order.map((o, i) => (
              <div key={o} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "var(--muted)" }}>{i + 1}.</span>
                {o}
                {i < report.order.length - 1 && <ArrowRight size={12} style={{ color: "var(--muted)" }} />}
              </div>
            ))}
          </div>
          <p className="field-hint" style={{ marginTop: 10 }}>
            {t("co.installNote")}
          </p>
        </div>
      )}
    </div>
  );
}
