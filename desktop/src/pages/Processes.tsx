// Phase 7: Runtime —— 进程表来自真实 ps 输出；进程管理（stop/restart）在后续阶段接入。
import { useEffect, useState } from "react";
import { Activity, LoaderCircle, TriangleAlert } from "lucide-react";
import { runtimeStatus } from "../ipc";
import type { RuntimeStatus } from "../ipc";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; runtime: RuntimeStatus };

export default function Processes() {
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
          <span>Loading processes…</span>
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
        <h1 className="page-heading">Processes</h1>
        <p className="page-sub">dsh processes observed from the system (no fabricated entries).</p>
      </header>
      {runtime.processes.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-card-head">
            <Activity size={15} />
            <span className="empty-card-title">No dsh processes</span>
          </div>
          <p className="empty-card-body">Start DeepSeek Harness and its processes will appear here.</p>
        </div>
      ) : (
        <div className="card">
          {runtime.processes.map((p) => (
            <div key={p.pid} className="registry-row">
              <span className="registry-k mono">{p.pid}</span>
              <span className="registry-v mono">{p.command}</span>
            </div>
          ))}
        </div>
      )}
      <p className="field-hint" style={{ marginTop: 12 }}>
        Stop/restart 控制（由 Rust Core 执行，UI 不得直接 kill）将在 Runtime 阶段后续接入。
      </p>
    </div>
  );
}
