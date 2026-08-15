// Sessions — real DeepSeek Harness runtime state (session store on disk, ps-observed processes).
import { useEffect, useState } from "react";
import { CircleCheck, CircleDashed, TerminalSquare } from "lucide-react";
import { runtimeStatus } from "../ipc";
import { useI18n } from "../i18n";
import type { RuntimeStatus } from "../ipc";
import { EmptyState, ErrorCard, RowSkeleton } from "../components/ui";

type State =
  | { status: "loading" }
  | { status: "error"; message: unknown }
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
        if (!cancelled) setState({ status: "error", message: err });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="page">
        <RowSkeleton rows={4} />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="page">
        <ErrorCard error={state.message} title={t("nav.sessions")} />
      </div>
    );
  }

  const { runtime } = state;
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-heading">{t("nav.sessions")}</h1>
          <p className="page-sub">{t("se.subtitle")}</p>
        </div>
      </header>

      <section className="stat-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
        <div className="stat-card">
          <div className="stat-head">
            {runtime.harnessDetected ? (
              <CircleCheck size={13} style={{ color: "var(--success)" }} />
            ) : (
              <CircleDashed size={13} />
            )}
            <span className="stat-label">{t("se.harness")}</span>
          </div>
          <div className={"stat-value" + (runtime.harnessDetected ? " ok" : " warn")}>
            {runtime.harnessDetected ? t("se.running") : t("se.notFound")}
          </div>
          <div className="stat-detail mono">
            {runtime.harnessVersion ?? "—"} · {runtime.harnessBin ?? ""}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-head">
            <TerminalSquare size={13} />
            <span className="stat-label">{t("se.sessions")}</span>
          </div>
          <div className="stat-value">{runtime.sessionCount}</div>
          <div className="stat-detail mono">{runtime.sessionsDir}</div>
        </div>
        <div className="stat-card">
          <div className="stat-head">
            <TerminalSquare size={13} />
            <span className="stat-label">{t("se.dshProcesses")}</span>
          </div>
          <div className="stat-value">{runtime.processes.length}</div>
          <div className="stat-detail">{t("se.viaPs")}</div>
        </div>
      </section>

      <section>
        <div className="sec-head">
          <h2 className="sec-title">{t("se.recentSessions")}</h2>
          <span className="sec-count">{runtime.sessions.length}</span>
        </div>
        {runtime.sessions.length === 0 ? (
          <EmptyState
            icon={TerminalSquare}
            title={t("se.noSessions")}
            body={t("se.noSessionsBody")}
          />
        ) : (
          <div className="list">
            <div className="list-head" style={{ gridTemplateColumns: "minmax(0,1fr) 120px 160px" }}>
              <span className="col-label">{t("se.session")}</span>
              <span className="col-label">{t("se.size")}</span>
              <span className="col-label">{t("se.modified")}</span>
            </div>
            {runtime.sessions.map((s) => (
              <div
                key={s.id}
                className="list-row"
                style={{ gridTemplateColumns: "minmax(0,1fr) 120px 160px" }}
              >
                <span className="cell-title mono">{s.id}</span>
                <span className="mono" style={{ fontSize: 11.5, color: "var(--foreground-2)" }}>
                  {s.sizeBytes} B
                </span>
                <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                  {s.modifiedAt}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
