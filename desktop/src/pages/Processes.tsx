// Phase 7: Runtime —— 进程表来自真实 ps 输出；进程管理（stop/restart）在后续阶段接入。
import { useEffect, useState } from "react";
import { Activity, LoaderCircle, TriangleAlert } from "lucide-react";
import { runtimeRestart, runtimeStatus, runtimeStop } from "../ipc";
import { useI18n } from "../i18n";
import type { RuntimeStatus } from "../ipc";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; runtime: RuntimeStatus };

export default function Processes() {
  const { t } = useI18n();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    runtimeStatus()
      .then((runtime) => {
        if (!cancelled) setState({ status: "ready", runtime });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="page">
        <div className="dashboard-loading" role="status">
          <LoaderCircle size={16} className="spin" />
          <span>{t("pr.loading")}</span>
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

  const { runtime } = state;

  async function stop(pid: number) {
    try {
      await runtimeStop(pid);
      window.location.reload();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function restart(command: string) {
    try {
      await runtimeRestart(command);
      window.location.reload();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-heading">{t("nav.processes")}</h1>
        <p className="page-sub">{t("pr.subtitle")}</p>
      </header>
      {runtime.processes.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-card-head">
            <Activity size={15} />
            <span className="empty-card-title">{t("pr.emptyTitle")}</span>
          </div>
          <p className="empty-card-body">{t("pr.emptyBody")}</p>
        </div>
      ) : (
        <div className="card">
          {runtime.processes.map((p) => (
            <div key={p.pid} className="registry-row">
              <span className="registry-k mono">{p.pid}</span>
              <span className="registry-v mono" style={{ flex: 1 }}>{p.command}</span>
              <button className="btn btn-ghost" onClick={() => void restart(p.command)}>{t("pr.restart")}</button>
              <button className="btn btn-ghost" onClick={() => void stop(p.pid)}>{t("pr.stop")}</button>
            </div>
          ))}
        </div>
      )}
      <p className="field-hint" style={{ marginTop: 12 }}>{t("pr.note")}</p>
    </div>
  );
}
