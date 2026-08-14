// Phase 4: GitHub Import —— 粘贴 URL 或本地路径 → 分析（license/依赖/入口/能力/安全）。
// 本阶段 Local-first：URL 需已在 ~/.deepseek-forge/cache/repos/ 克隆；分析不执行第三方代码。
import { useState } from "react";
import { Github, LoaderCircle, ScanSearch, TriangleAlert } from "lucide-react";
import { adapterPropose, importAnalyze } from "../ipc";
import type { AdapterProposal, RepositoryAnalysis } from "../ipc";

type State =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "error"; message: string }
  | { status: "ready"; analysis: RepositoryAnalysis };

const TYPE_LABEL: Record<string, string> = {
  agent: "Agent",
  skill: "Skill",
  tool: "Tool",
  mcp: "MCP",
  plugin: "Plugin",
  workflow: "Workflow",
  bundle: "Bundle",
  unknown: "Unknown",
};

export default function Import() {
  const [source, setSource] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const [proposal, setProposal] = useState<AdapterProposal | null>(null);
  const [proposalErr, setProposalErr] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);

  async function proposeAdapter() {
    const s = source.trim();
    if (!s) return;
    setProposing(true);
    setProposalErr(null);
    try {
      setProposal(await adapterPropose(s));
    } catch (err) {
      setProposal(null);
      setProposalErr(err instanceof Error ? err.message : String(err));
    } finally {
      setProposing(false);
    }
  }

  async function run() {
    const s = source.trim();
    if (!s) return;
    setState({ status: "busy" });
    try {
      const analysis = await importAnalyze(s);
      setState({ status: "ready", analysis });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  const a = state.status === "ready" ? state.analysis : null;

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-heading">GitHub Import</h1>
        <p className="page-sub">
          Analyze an open-source project before it becomes a Forge package. Nothing is executed.
        </p>
      </header>

      <div className="card import-form">
        <div className="import-input-row">
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="https://github.com/owner/repo 或本地目录路径"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void run();
            }}
          />
          <button className="btn btn-primary" onClick={() => void run()} disabled={state.status === "busy" || !source.trim()}>
            {state.status === "busy" ? <LoaderCircle size={15} className="spin" /> : <ScanSearch size={15} />}
            Analyze
          </button>
        </div>
        <p className="field-hint">
          当前为 Local-first 阶段：GitHub URL 需先克隆到 ~/.deepseek-forge/cache/repos/OWNER__REPO/。
        </p>
      </div>

      {state.status === "error" && (
        <div className="card error-state">
          <TriangleAlert size={18} className="err-icon" />
          <p>{state.message}</p>
        </div>
      )}

      {a && (
        <div className="card import-result">
          <div className="import-head">
            <Github size={18} />
            <span className="mono">{a.owner ? a.owner + "/" + a.repo : a.source}</span>
            <span className="badge badge-community">{TYPE_LABEL[a.packageType] ?? a.packageType}</span>
            <span className={"badge " + (a.securityRisk === "low" ? "badge-verified" : a.securityRisk === "high" ? "badge-blocked" : "badge-community")}>
              Risk {a.securityRisk}
            </span>
          </div>

          <div className="stat-grid" style={{ marginTop: 12 }}>
            <Stat label="License" value={a.license ?? "—"} warn={a.licenseMissing} />
            <Stat label="Language" value={a.language ?? "—"} />
            <Stat label="Entry point" value={a.entryPoint ?? "—"} />
            <Stat label="Forge compatibility" value={a.forgeCompatibility} />
          </div>

          {a.licenseMissing && (
            <div className="field-error" style={{ marginTop: 10 }}>
              No license detected. Forge refuses to package unlicensed code (Principle 5).
            </div>
          )}

          <h3 className="eyebrow" style={{ margin: "16px 0 8px" }}>Capabilities & security</h3>
          <ul className="cap-list">
            <li>{a.networkUsage.length} network reference(s)</li>
            <li>{a.filesystemUsage.length} filesystem write(s)</li>
            <li>{a.envVars.length} environment variable(s)</li>
            <li>{a.dangerousCommands.length} dangerous command(s)</li>
            <li>{a.secretsFound.length} secret finding(s)</li>
            <li>
              Scan: {a.scan.score}/100 ({a.scan.verdict}, {a.scan.files} files)
            </li>
          </ul>

          {a.dependencies.length > 0 && (
            <>
              <h3 className="eyebrow" style={{ margin: "16px 0 8px" }}>
                Dependencies ({a.dependencies.length})
              </h3>
              <div className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>
                {a.dependencies.slice(0, 12).join(" · ")}
                {a.dependencies.length > 12 ? " …" : ""}
              </div>
            </>
          )}

          <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn btn-primary" onClick={() => void proposeAdapter()} disabled={proposing}>
              {proposing ? <LoaderCircle size={15} className="spin" /> : null}
              Create Adapter Proposal
            </button>
            <span className="field-hint">规则型生成器（非 AI），生成后必须人工审阅。</span>
          </div>

          {proposalErr && (
            <div className="field-error" style={{ marginTop: 10 }}>{proposalErr}</div>
          )}

          {proposal && (
            <div className="card" style={{ marginTop: 12 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                <span className="badge badge-community">{proposal.generator === "rules" ? "rules (非 AI)" : proposal.generator}</span>
                {proposal.requiresHumanReview && (
                  <span className="badge badge-blocked">需人工审阅（高风险/危险命令）</span>
                )}
              </div>
              <pre className="mono" style={{ fontSize: 11, maxHeight: 320, overflow: "auto", background: "var(--bg-soft)", padding: 10, borderRadius: 6 }}>
                {JSON.stringify(proposal.manifest, null, 2)}
              </pre>
              <p className="field-hint">
                落地为文件：forge-core adapter generate &lt;源&gt; --out &lt;目录&gt;（骨架 install/configure/healthcheck 待人工补充后才会被使用）。
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="card stat-card">
      <div className="stat-card-head">
        <span className="stat-card-label">{label}</span>
      </div>
      <div className="stat-card-value" style={warn ? { color: "var(--danger, #ff7b7b)" } : undefined}>
        {value}
      </div>
    </div>
  );
}
