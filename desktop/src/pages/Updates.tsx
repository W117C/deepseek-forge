// STEP 12: Updates —— 真实更新执行（update apply 经 Rust Kernel：
// plugin/imported → 重新收录新版本；artifact 包 → install-from-registry 管线，失败自动回滚）。
import { useEffect, useState } from "react";
import { LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { updateApply, updateCheck } from "../ipc";
import type { UpdateEntry } from "../ipc";
import { useI18n } from "../i18n";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; entries: UpdateEntry[] };

export default function Updates() {
  const { t } = useI18n();
  const [state, setState] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  function load() {
    setState({ status: "loading" });
    updateCheck()
      .then((entries) => setState({ status: "ready", entries }))
      .catch((err: unknown) =>
        setState({ status: "error", message: err instanceof Error ? err.message : String(err) })
      );
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
      load();
    } catch (err) {
      setRowError((prev) => ({ ...prev, [id]: err instanceof Error ? err.message : String(err) }));
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
        <div className="dashboard-loading" role="status">
          <LoaderCircle size={16} className="spin" />
          <span>{t("updates.updating")}</span>
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

  const outdated = state.entries.filter((e) => e.outdated);
  const sub =
    outdated.length > 0
      ? t("updates.subAvailable", { n: outdated.length })
      : t("updates.subNone");

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-heading">{t("updates.title")}</h1>
        <p className="page-sub">{sub}</p>
      </header>

      {outdated.length > 0 && (
        <button
          className="btn"
          style={{ marginBottom: 12 }}
          onClick={() => void applyAll(outdated.map((e) => e.id))}
          disabled={busy !== null}
        >
          {busy !== null ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}
          {t("updates.updateAll")}
        </button>
      )}

      {state.entries.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-card-head">
            <RefreshCw size={15} />
            <span className="empty-card-title">{t("updates.nothingInstalled")}</span>
          </div>
          <p className="empty-card-body">{t("updates.nothingBody")}</p>
        </div>
      ) : (
        <div className="card">
          {state.entries.map((e) => (
            <div key={e.id} className="registry-row">
              <span className="registry-k mono">{e.id}</span>
              <span className="registry-v">
                v{e.installed} → v{e.latest || "—"}
                {e.outdated
                  ? " · " + t("updates.available")
                  : " · " + t("updates.upToDate")}
              </span>
              {e.outdated && (
                <button
                  className="btn btn-ghost"
                  onClick={() => void applyOne(e.id)}
                  disabled={busy !== null}
                >
                  {busy === e.id ? (
                    <LoaderCircle size={14} className="spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  {busy === e.id ? t("updates.updating") : t("updates.update")}
                </button>
              )}
            </div>
          ))}
          {Object.entries(rowError).map(([id, msg]) => (
            <p key={id} className="field-hint" style={{ color: "var(--danger, #ff6b6b)" }}>
              {id}: {msg}
            </p>
          ))}
          <p className="field-hint" style={{ marginTop: 10 }}>
            更新 = 校验 → 快照 → 安装 → 健康检查；失败自动回滚到旧版本。
          </p>
        </div>
      )}
    </div>
  );
}
