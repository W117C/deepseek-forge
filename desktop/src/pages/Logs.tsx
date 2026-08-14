// Increment ⑥: Logs —— 安装日志（~/.deepseek-forge/logs/install/，JSONL 追加）。
import { useEffect, useState } from "react";
import { LoaderCircle, ScrollText, TriangleAlert } from "lucide-react";
import { logsList } from "../ipc";
import { useI18n } from "../i18n";
import type { LogEntry } from "../ipc";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; entries: LogEntry[] };

export default function Logs() {
  const { t } = useI18n();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    logsList()
      .then((entries) => setState({ status: "ready", entries }))
      .catch((err: unknown) =>
        setState({ status: "error", message: err instanceof Error ? err.message : String(err) })
      );
  }, []);

  if (state.status === "loading") {
    return (
      <div className="page">
        <div className="dashboard-loading" role="status">
          <LoaderCircle size={16} className="spin" />
          <span>{t("lg.loading")}</span>
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

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-heading">{t("nav.logs")}</h1>
        <p className="page-sub">{t("lg.subtitle")}</p>
      </header>
      {state.entries.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-card-head">
            <ScrollText size={15} />
            <span className="empty-card-title">{t("lg.emptyTitle")}</span>
          </div>
          <p className="empty-card-body">{t("lg.emptyBody")}</p>
        </div>
      ) : (
        <div className="card">
          {state.entries.map((e, i) => (
            <div key={i} className="registry-row">
              <span className="registry-k mono">{e.ts}</span>
              <span className="registry-v">
                <span className="badge badge-community">{e.kind}</span>{" "}
                {e.id}{e.kind === "install" ? " v" + e.version : " " + t("lg.verdict") + " " + e.version} —{" "}
                {e.ok ? t("lg.ok") : t("lg.failed")}
                {e.code ? " · " + (e.kind === "security" ? "score " + e.code : e.code) : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
