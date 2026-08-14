// Phase 8: System 组诚实最小页 —— 只显示有真实后端支撑的数据，其余为空态。
import { useEffect, useState } from "react";
import { Database, LoaderCircle, Settings, ShieldCheck, TriangleAlert } from "lucide-react";
import { stateList, systemStatus } from "../ipc";
import type { InstalledAgent, SystemStatus } from "../ipc";

function useSystem() {
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    systemStatus()
      .then(setSystem)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  return { system, err };
}

export function SecurityPage() {
  const [agents, setAgents] = useState<Record<string, InstalledAgent> | null>(null);
  useEffect(() => {
    stateList()
      .then((s) => setAgents(s.agents ?? {}))
      .catch(() => setAgents({}));
  }, []);
  const entries = Object.entries(agents ?? {});
  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-heading">Security</h1>
        <p className="page-sub">Installed packages: trust and scan score from the registry-backed state.</p>
      </header>
      {entries.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-card-head"><ShieldCheck size={15} /><span className="empty-card-title">No installed packages</span></div>
          <p className="empty-card-body">Install a package to see its trust level and scan score here.</p>
        </div>
      ) : (
        <div className="card">
          {entries.map(([id, a]) => (
            <div key={id} className="registry-row">
              <span className="registry-k mono">{id}</span>
              <span className="registry-v">
                trust <b>{a.trust ?? "?"}</b> · score <b>{a.score ?? "—"}</b>/100
              </span>
            </div>
          ))}
          <p className="field-hint" style={{ marginTop: 10 }}>
            安装时已执行：SHA256 + Ed25519 验签 + 静态扫描 + 信任门禁（详情见 CLI 安装输出）。
          </p>
        </div>
      )}
    </div>
  );
}

export function SourcesPage() {
  const { system, err } = useSystem();
  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-heading">Sources</h1>
        <p className="page-sub">Registry providers (Local-first).</p>
      </header>
      {err && (
        <div className="card error-state"><TriangleAlert size={18} className="err-icon" /><p>{err}</p></div>
      )}
      {!system && !err && (
        <div className="dashboard-loading"><LoaderCircle size={16} className="spin" /><span>Loading…</span></div>
      )}
      {system && (
        <div className="card">
          <div className="registry-row">
            <span className="registry-k"><Database size={13} /> Local Registry</span>
            <span className={"registry-v " + (system.registryAvailable ? "ok" : "warn")}>
              {system.registryAvailable ? "Available" : "Unavailable"}
            </span>
          </div>
          <div className="registry-row">
            <span className="registry-k">Path</span>
            <span className="registry-v mono">{system.registryPath}</span>
          </div>
          <div className="registry-row">
            <span className="registry-k">Name</span>
            <span className="registry-v">{system.registryName ?? "—"}</span>
          </div>
          <p className="field-hint" style={{ marginTop: 10 }}>
            Git Registry 与 HTTP/Private Registry 为后续阶段能力（协议已预留，不提前实现）。
          </p>
        </div>
      )}
    </div>
  );
}

export function SettingsPage() {
  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-heading">Settings</h1>
        <p className="page-sub">Only settings backed by real functionality are shown.</p>
      </header>
      <div className="card empty-card">
        <div className="empty-card-head"><Settings size={15} /><span className="empty-card-title">No configurable settings yet</span></div>
        <p className="empty-card-body">
          主题当前固定为 dark（设计系统 token）；其余设置项将随对应功能（默认 Registry、验证策略、日志级别）逐步开放。
        </p>
      </div>
    </div>
  );
}
