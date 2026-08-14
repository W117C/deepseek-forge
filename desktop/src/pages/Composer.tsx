// Increment ④: Composer —— 左：本地 Registry 可用组件；右：当前组合。
// Resolve 经 Rust Kernel 输出确定性安装序 + 冲突/缺失（提前发现）。
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Boxes, LoaderCircle, TriangleAlert } from "lucide-react";
import { composerResolve, registryList } from "../ipc";
import type { RegistrySummary, ResolveReport } from "../ipc";

export default function Composer() {
  const [available, setAvailable] = useState<RegistrySummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [report, setReport] = useState<ResolveReport | null>(null);
  const [busy, setBusy] = useState(false);

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
