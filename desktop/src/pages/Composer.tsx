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
  registryList,
} from "../ipc";
import type { RegistrySummary, ResolveReport } from "../ipc";

export default function Composer() {
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
    if (!window.confirm("Uninstall bundle " + id + "?\n其组件登记将被移除（被其他组合引用的组件需单独处理）。")) return;
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
        <h1 className="page-heading">Composer</h1>
        <p className="page-sub">Combine packages from the local registry into an agent composition.</p>
      </header>

      {err && (
        <div className="card error-state">
          <TriangleAlert size={18} className="err-icon" />
          <p>{err}</p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <h2 className="dashboard-section-title">Available</h2>
          {pool.length === 0 && <p className="sub">Local registry is empty — import a project first.</p>}
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
          <h2 className="dashboard-section-title">Composition</h2>
          {selSummary.length === 0 && <p className="sub">Select packages on the left.</p>}
          {selSummary.map((p) => (
            <div key={p.id} className="registry-row">
              <span className="registry-k mono">{p.id}</span>
              <span className="registry-v">{p.type} · v{p.versionLatest}</span>
            </div>
          ))}
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={() => void resolve()} disabled={busy || selSummary.length === 0}>
              {busy ? <LoaderCircle size={14} className="spin" /> : <Boxes size={14} />}
              Resolve
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder="Bundle 名称（如 Research Stack）"
          value={bundleName}
          onChange={(e) => setBundleName(e.target.value)}
        />
        <button
          className="btn btn-primary"
          onClick={() => void createBundle()}
          disabled={bundleBusy === "create" || selSummary.length < 2}
        >
          {bundleBusy === "create" ? <LoaderCircle size={14} className="spin" /> : null}
          Create Bundle
        </button>
      </div>

      {bundles.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h2 className="dashboard-section-title">Bundles</h2>
          {bundles.map((b) => (
            <div key={b.id} className="registry-row" style={{ padding: "8px 0" }}>
              <span className="registry-k mono">{b.name}</span>
              <span className="registry-v" style={{ flex: 1 }}>
                {(b.components ?? []).join(", ")}
              </span>
              <button className="btn btn-ghost" onClick={() => void installBundle(b.id)} disabled={bundleBusy !== null}>
                {bundleBusy === "install:" + b.id ? <LoaderCircle size={14} className="spin" /> : null}
                Install All
              </button>
              <button className="btn btn-ghost" onClick={() => void uninstallBundle(b.id)} disabled={bundleBusy !== null}>
                Uninstall
              </button>
            </div>
          ))}
        </div>
      )}

      {bundleErr && <div className="field-error" style={{ marginTop: 10 }}>{bundleErr}</div>}

      {report && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 className="dashboard-section-title">Dependency graph</h2>
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
            组合产物安装走 Rust Kernel 完整管线（哈希→验签→扫描→快照→安装→健康）；图形化 Agent 构建器的组合落盘在后续接入。
          </p>
        </div>
      )}
    </div>
  );
}
