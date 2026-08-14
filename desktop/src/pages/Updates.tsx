// Increment ③: Updates —— 已装版本 vs 本地 Registry 版本（真实对比，无公网源）。
import { useEffect, useState } from "react";
import { LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { updateCheck } from "../ipc";
import type { UpdateEntry } from "../ipc";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; entries: UpdateEntry[] };

export default function Updates() {
  const [state, setState] = useState<State>({ status: "loading" });

  function load() {
    setState({ status: "loading" });
    updateCheck()
      .then((entries) => setState({ status: "ready", entries }))
      .catch((err: unknown) =>
        setState({ status: "error", message: err instanceof Error ? err.message : String(err) })
      );
  }

  useEffect(load, []);

  if (state.status === "loading") {
    return (
      <div className="page">
        <div className="dashboard-loading" role="status">
          <LoaderCircle size={16} className="spin" />
          <span>Checking updates…</span>
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
  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-heading">Updates</h1>
        <p className="page-sub">
          {outdated.length > 0
            ? outdated.length + " update(s) available in the local registry."
            : "No updates available in the local registry."}
        </p>
      </header>

      {state.entries.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-card-head">
            <RefreshCw size={15} />
            <span className="empty-card-title">Nothing installed</span>
          </div>
          <p className="empty-card-body">Installed packages will be compared against the local registry here.</p>
        </div>
      ) : (
        <div className="card">
          {state.entries.map((e) => (
            <div key={e.id} className="registry-row">
              <span className="registry-k mono">{e.id}</span>
              <span className="registry-v">
                v{e.installed} → v{e.latest || "—"}
                {e.outdated ? " · update available" : " · up to date"}
              </span>
            </div>
          ))}
          <p className="field-hint" style={{ marginTop: 10 }}>
            更新执行（下载→验证→快照→安装→健康，失败自动回滚）经 Rust Kernel 的安装管线，将在更新操作 UI 接入。
          </p>
        </div>
      )}
    </div>
  );
}
