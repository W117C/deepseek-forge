// Updates — real update execution (validate → snapshot → install → health;
// automatic rollback on failure) via the Rust Kernel.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, RefreshCw } from "lucide-react";
import { packageRollback, updateApply, updateCheck } from "../ipc";
import type { UpdateEntry } from "../ipc";
import { useI18n } from "../i18n";
import {
  EmptyState,
  ErrorCard,
  InlineLoading,
  RowSkeleton,
  useToast,
} from "../components/ui";

type State =
  | { status: "loading" }
  | { status: "error"; message: unknown }
  | { status: "ready"; entries: UpdateEntry[] };

export default function Updates() {
  const { t } = useI18n();
  const toast = useToast();
  const [state, setState] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  function load() {
    setState({ status: "loading" });
    updateCheck()
      .then((entries) => setState({ status: "ready", entries }))
      .catch((err: unknown) => setState({ status: "error", message: err }));
  }

  useEffect(load, []);

  async function applyOne(id: string) {
    setBusy(id);
    setRowError((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      await updateApply(id);
      toast("success", t("toast.updated", { name: id }));
      load();
    } catch (err) {
      setRowError((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : String(err),
      }));
      toast("error", t("toast.updateFailed"), id);
    } finally {
      setBusy(null);
    }
  }

  async function rollbackToSnapshot(id: string) {
    setBusy("rollback:" + id);
    try {
      await packageRollback(id);
      toast("warning", t("toast.rolledBack", { name: id }));
      load();
    } catch (err) {
      setRowError((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setBusy(null);
    }
  }

  async function applyAll(ids: string[]) {
    for (const id of ids) {
      await applyOne(id);
    }
  }

  if (state.status === "loading") {
    return (
      <div className="page">
        <RowSkeleton rows={5} />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="page">
        <ErrorCard error={state.message} onRetry={load} title={t("updates.title")} />
      </div>
    );
  }

  const outdated = state.entries.filter((e) => e.outdated);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-heading">{t("updates.title")}</h1>
          <p className="page-sub">
            {outdated.length > 0
              ? t("updates.subAvailable", { n: outdated.length })
              : t("updates.subNone")}
          </p>
        </div>
        {outdated.length > 0 && (
          <div className="page-actions">
            <button
              className="btn btn-primary"
              onClick={() => void applyAll(outdated.map((e) => e.id))}
              disabled={busy !== null}
            >
              {busy !== null ? (
                <InlineLoading label={t("updates.updating")} />
              ) : (
                <>
                  <RefreshCw size={13} />
                  {t("updates.updateAll")}
                </>
              )}
            </button>
          </div>
        )}
      </header>

      {state.entries.length === 0 ? (
        <EmptyState
          icon={RefreshCw}
          title={t("updates.nothingInstalled")}
          body={t("updates.nothingBody")}
        />
      ) : (
        <div className="list">
          <div
            className="list-head"
            style={{ gridTemplateColumns: "minmax(0,1fr) 170px 110px auto" }}
          >
            <span className="col-label">{t("plugins.package")}</span>
            <span className="col-label">{t("updates.version")}</span>
            <span className="col-label">{t("db.status")}</span>
            <span className="col-label" style={{ textAlign: "right" }}>
              {t("plugins.actions")}
            </span>
          </div>
          {state.entries.map((e) => (
            <div
              key={e.id}
              className="list-row"
              style={{ gridTemplateColumns: "minmax(0,1fr) 170px 110px auto" }}
            >
              <div className="cell">
                <Link to={"/plugins/" + e.id} className="cell-title mono">{e.id}</Link>
              </div>
              <div className="cell">
                <span className="mono" style={{ fontSize: 11.5, color: "var(--foreground-2)" }}>
                  v{e.installed}
                  {e.outdated && (
                    <>
                      {" "}
                      <ArrowRight size={11} style={{ verticalAlign: "-1px" }} />{" "}
                      <span style={{ color: "var(--accent)" }}>v{e.latest}</span>
                    </>
                  )}
                </span>
              </div>
              <div className="cell">
                {e.outdated ? (
                  <span className="badge badge-warning">{t("updates.available")}</span>
                ) : (
                  <span className="badge badge-verified">{t("updates.upToDate")}</span>
                )}
              </div>
              <div className="cell-actions">
                {e.outdated && (
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => void applyOne(e.id)}
                    disabled={busy !== null}
                  >
                    {busy === e.id ? (
                      <InlineLoading label={t("updates.updating")} />
                    ) : (
                      <>
                        <RefreshCw size={12} />
                        {t("updates.update")}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
          {Object.entries(rowError).map(([id, msg]) => (
            <div key={"err-" + id} className="list-row" style={{ gridTemplateColumns: "1fr auto", background: "var(--danger-soft)" }}>
              <span className="field-error" style={{ marginTop: 0 }}>
                {id}: {msg}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => void rollbackToSnapshot(id)}
                disabled={busy !== null}
              >
                {busy === "rollback:" + id ? (
                  <InlineLoading label={t("ag.rollback")} />
                ) : (
                  t("ag.rollback")
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="field-hint" style={{ marginTop: 12 }}>
        {t("updates.pipelineNote")}
      </p>
    </div>
  );
}
