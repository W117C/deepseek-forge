// Phase 8: My Agents —— 读取共享 DSH 状态库（与 CLI 同一 state.json），
// 支持经 Rust Kernel 回滚/卸载。空态诚实。
import { useCallback, useEffect, useState } from "react";
import { Bot, LoaderCircle, Play, RotateCcw, TriangleAlert } from "lucide-react";
import { packageRollback, runtimeRun, stateList } from "../ipc";
import { useI18n } from "../i18n";
import type { InstalledAgent } from "../ipc";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; agents: Record<string, InstalledAgent> };

export default function Agents() {
  const { t } = useI18n();
  const [state, setState] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [runBusy, setRunBusy] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<Record<string, { pid: number; logFile: string }>>({});
  const [actionErr, setActionErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ status: "loading" });
    stateList()
      .then((s) => setState({ status: "ready", agents: s.agents ?? {} }))
      .catch((err: unknown) =>
        setState({ status: "error", message: err instanceof Error ? err.message : String(err) })
      );
  }, []);

  useEffect(load, [load]);

  async function run(id: string, profile: string) {
    setRunBusy(id);
    setActionErr(null);
    try {
      const res = await runtimeRun(profile);
      setRunResult((prev) => ({ ...prev, [id]: res }));
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : String(err));
    } finally {
      setRunBusy(null);
    }
  }

  async function rollback(id: string) {
    setBusy(id);
    setActionErr(null);
    try {
      await packageRollback(id);
      load();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  if (state.status === "loading") {
    return (
      <div className="page">
        <div className="dashboard-loading" role="status">
          <LoaderCircle size={16} className="spin" />
          <span>{t("ag.loading")}</span>
        </div>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="page">
        <div className="error-state">
          <TriangleAlert size={22} className="err-icon" />
          <p>{state.message}</p>
        </div>
      </div>
    );
  }

  const entries = Object.entries(state.agents);
  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-heading">{t("nav.agents")}</h1>
        <p className="page-sub">{t("ag.subtitle")}</p>
      </header>

      {actionErr && (
        <div className="card error-state">
          <TriangleAlert size={18} className="err-icon" />
          <p>{actionErr}</p>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-card-head">
            <Bot size={15} />
            <span className="empty-card-title">{t("ag.emptyTitle")}</span>
          </div>
          <p className="empty-card-body">{t("ag.emptyBody")}</p>
        </div>
      ) : (
        <div className="card">
          {entries.map(([id, a]) => (
            <div key={id} className="registry-row" style={{ padding: "10px 0" }}>
              <div style={{ flex: 1 }}>
                <div className="mono">{id}</div>
                <div className="field-hint">
                  v{a.version ?? "?"} · profile {a.profile ?? "?"} · trust {a.trust ?? "?"} · score {a.score ?? "—"}
                  {a.kind === "plugin" ? " · plugin" : ""}
                </div>
              </div>
              {a.profile && a.kind !== "plugin" && (
                <button
                  className="btn btn-primary"
                  onClick={() => void run(id, String(a.profile))}
                  disabled={runBusy === id}
                  aria-label={t("ag.run") + " " + id}
                >
                  {runBusy === id ? <LoaderCircle size={14} className="spin" /> : <Play size={14} />}
                  {runBusy === id ? t("ag.running") : t("ag.run")}
                </button>
              )}
              <button
                className="btn btn-ghost"
                onClick={() => void rollback(id)}
                disabled={busy === id}
                aria-label={t("ag.rollback") + " " + id}
              >
                {busy === id ? <LoaderCircle size={14} className="spin" /> : <RotateCcw size={14} />}
                {t("ag.rollback")}
              </button>
              {runResult[id] && (
                <span className="field-hint" style={{ display: "block" }}>
                  {t("ag.runOk", { pid: runResult[id].pid })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
