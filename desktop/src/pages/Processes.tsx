// Processes — dsh processes observed via ps. Stop/Restart are executed by
// Rust Core (kill -TERM / detached restart); the UI never fakes a process.
import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { runtimeRestart, runtimeStatus, runtimeStop } from "../ipc";
import { useI18n } from "../i18n";
import type { RuntimeStatus } from "../ipc";
import { EmptyState, ErrorCard, InlineLoading, RowSkeleton, useDialog, useToast } from "../components/ui";

type State =
  | { status: "loading" }
  | { status: "error"; message: unknown }
  | { status: "ready"; runtime: RuntimeStatus };

export default function Processes() {
  const { t } = useI18n();
  const dialog = useDialog();
  const toast = useToast();
  const [state, setState] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    setState({ status: "loading" });
    runtimeStatus()
      .then((runtime) => setState({ status: "ready", runtime }))
      .catch((err: unknown) => setState({ status: "error", message: err }));
  }

  useEffect(load, []);

  async function stop(pid: number) {
    const ok = await dialog.confirm({
      title: t("pr.stopConfirm", { pid }),
      body: t("pr.stopConfirmBody"),
      confirmLabel: t("pr.stop"),
      danger: true,
    });
    if (!ok) return;
    setBusy("stop:" + pid);
    try {
      await runtimeStop(pid);
      toast("success", t("pr.stopped", { pid }));
      load();
    } catch (err) {
      toast("error", t("common.failed"), err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function restart(command: string) {
    setBusy("restart");
    try {
      await runtimeRestart(command);
      toast("success", t("pr.restarted"));
      load();
    } catch (err) {
      toast("error", t("common.failed"), err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

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
        <ErrorCard error={state.message} onRetry={load} title={t("nav.processes")} />
      </div>
    );
  }

  const { runtime } = state;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-heading">{t("nav.processes")}</h1>
          <p className="page-sub">{t("pr.subtitle")}</p>
        </div>
      </header>

      {runtime.processes.length === 0 ? (
        <EmptyState icon={Activity} title={t("pr.emptyTitle")} body={t("pr.emptyBody")} />
      ) : (
        <div className="list">
          <div className="list-head" style={{ gridTemplateColumns: "72px minmax(0,1fr) auto" }}>
            <span className="col-label">PID</span>
            <span className="col-label">{t("pr.command")}</span>
            <span className="col-label" style={{ textAlign: "right" }}>
              {t("plugins.actions")}
            </span>
          </div>
          {runtime.processes.map((p) => (
            <div
              key={p.pid}
              className="list-row"
              style={{ gridTemplateColumns: "72px minmax(0,1fr) auto" }}
            >
              <span className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>
                {p.pid}
              </span>
              <span className="mono cell-title" style={{ fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.command}
              </span>
              <div className="cell-actions">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => void restart(p.command)}
                  disabled={busy !== null}
                >
                  {busy === "restart" ? (
                    <InlineLoading label={t("pr.restarting")} />
                  ) : (
                    t("pr.restart")
                  )}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => void stop(p.pid)}
                  disabled={busy !== null}
                >
                  {busy === "stop:" + p.pid ? (
                    <InlineLoading label={t("pr.stopping")} />
                  ) : (
                    t("pr.stop")
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="field-hint" style={{ marginTop: 12 }}>
        {t("pr.note")}
      </p>
    </div>
  );
}
