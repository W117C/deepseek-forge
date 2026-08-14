// Phase 7: Runtime —— 观察 Harness 真实状态（会话来自 DSH 会话库，进程来自 ps）。
// 不重新实现 Runtime；拿不到的数据显示空态，绝不伪造。
import { useEffect, useState } from "react";
import { CircleCheck, CircleDashed, LoaderCircle, Terminal, TriangleAlert } from "lucide-react";
import { runtimeStatus } from "../ipc";
import { useI18n } from "../i18n";
import type { RuntimeStatus } from "../ipc";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; runtime: RuntimeStatus };

export default function Sessions() {
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
          <span>{t("se.loading")}</span>
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
  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-heading">{t("nav.sessions")}</h1>
        <p className="page-sub">{t("se.subtitle")}</p>
      </header>

      <section className="stat-grid">
        <div className="card stat-card">
          <div className="stat-card-head">
            {runtime.harnessDetected ? <CircleCheck size={15} /> : <CircleDashed size={15} />}
            <span className="stat-card-label">{t("se.harness")}</span>
          </div>
          <div className="stat-card-value">{runtime.harnessDetected ? t("se.running") : t("se.notFound")}</div>
          <div className="stat-card-detail mono">
            {runtime.harnessVersion ?? "—"} · {runtime.harnessBin ?? ""}
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-card-head">
            <Terminal size={15} />
            <span className="stat-card-label">{t("se.sessions")}</span>
          </div>
          <div className="stat-card-value">{runtime.sessionCount}</div>
          <div className="stat-card-detail mono">{runtime.sessionsDir}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-card-head">
            <Terminal size={15} />
            <span className="stat-card-label">{t("se.dshProcesses")}</span>
          </div>
          <div className="stat-card-value">{runtime.processes.length}</div>
          <div className="stat-card-detail">{t("se.viaPs")}</div>
        </div>
      </section>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">{t("se.recentSessions")}</h2>
        {runtime.sessions.length === 0 ? (
          <div className="card empty-card">
            <div className="empty-card-head">
              <Terminal size={15} />
              <span className="empty-card-title">{t("se.noSessions")}</span>
            </div>
            <p className="empty-card-body">{t("se.noSessionsBody")}</p>
          </div>
        ) : (
          <div className="card">
            {runtime.sessions.map((s) => (
              <div key={s.id} className="registry-row">
                <span className="registry-k mono">{s.id}</span>
                <span className="registry-v mono">{s.sizeBytes} B · {s.modifiedAt}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
