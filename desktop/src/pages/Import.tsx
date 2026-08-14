// Phase 4: GitHub Import —— 粘贴 URL 或本地路径 → 分析（license/依赖/入口/能力/安全）。
// 本阶段 Local-first：URL 需已在 ~/.deepseek-forge/cache/repos/ 克隆；分析不执行第三方代码。
import { useState } from "react";
import { Github, LoaderCircle, ScanSearch, TriangleAlert } from "lucide-react";
import { adapterGenerate, adapterPropose, importAnalyze } from "../ipc";
import { useI18n } from "../i18n";
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
  const { t } = useI18n();
  const [source, setSource] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const [proposal, setProposal] = useState<AdapterProposal | null>(null);
  const [proposalErr, setProposalErr] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);

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

  async function generate() {
    const s = source.trim();
    if (!s) return;
    setGenerating(true);
    setGenerated(null);
    try {
      const res = await adapterGenerate(s);
      setGenerated(res.packageDir ?? "");
    } catch (err) {
      setProposalErr(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
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
        <h1 className="page-heading">{t("nav.import")}</h1>
        <p className="page-sub">{t("im.subtitle")}</p>
      </header>

      <div className="card import-form">
        <div className="import-input-row">
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder={t("im.placeholder")}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void run();
            }}
          />
          <button className="btn btn-primary" onClick={() => void run()} disabled={state.status === "busy" || !source.trim()}>
            {state.status === "busy" ? <LoaderCircle size={15} className="spin" /> : <ScanSearch size={15} />}
            {t("im.analyze")}
          </button>
        </div>
        <p className="field-hint">{t("im.localHint")}</p>
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
              {t("im.risk")} {a.securityRisk}
            </span>
          </div>

          <div className="stat-grid" style={{ marginTop: 12 }}>
            <Stat label={t("im.license")} value={a.license ?? "—"} warn={a.licenseMissing} />
            <Stat label={t("im.language")} value={a.language ?? "—"} />
            <Stat label={t("im.entryPoint")} value={a.entryPoint ?? "—"} />
            <Stat label={t("im.forgeCompat")} value={a.forgeCompatibility} />
          </div>

          {a.licenseMissing && (
            <div className="field-error" style={{ marginTop: 10 }}>
              {t("im.noLicense")}
            </div>
          )}

          <h3 className="eyebrow" style={{ margin: "16px 0 8px" }}>{t("im.capsSecurity")}</h3>
          <ul className="cap-list">
            <li>{t("im.networkRefs", { n: a.networkUsage.length })}</li>
            <li>{t("im.fsWrites", { n: a.filesystemUsage.length })}</li>
            <li>{t("im.envVars", { n: a.envVars.length })}</li>
            <li>{t("im.dangerous", { n: a.dangerousCommands.length })}</li>
            <li>{t("im.secrets", { n: a.secretsFound.length })}</li>
            <li>
              {t("im.scanLine", { score: a.scan.score, verdict: a.scan.verdict, files: a.scan.files })}
            </li>
          </ul>

          {a.dependencies.length > 0 && (
            <>
              <h3 className="eyebrow" style={{ margin: "16px 0 8px" }}>
                {t("im.deps", { n: a.dependencies.length })}
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
              {t("im.createProposal")}
            </button>
            <button className="btn" onClick={() => void generate()} disabled={generating}>
              {generating ? <LoaderCircle size={15} className="spin" /> : null}
              {generating ? t("im.generating") : t("im.generate")}
            </button>
            <span className="field-hint">{t("im.rulesGen")}</span>
          </div>
          {generated && (
            <div className="field-hint" style={{ marginTop: 10, color: "var(--success, #3fb950)" }}>
              {t("im.generated", { dir: generated })}
            </div>
          )}

          {proposalErr && (
            <div className="field-error" style={{ marginTop: 10 }}>{proposalErr}</div>
          )}

          {proposal && (
            <div className="card" style={{ marginTop: 12 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                <span className="badge badge-community">{proposal.generator === "rules" ? "rules (非 AI)" : proposal.generator}</span>
                {proposal.requiresHumanReview && (
                  <span className="badge badge-blocked">{t("im.requiresReview")}</span>
                )}
              </div>
              <pre className="mono" style={{ fontSize: 11, maxHeight: 320, overflow: "auto", background: "var(--bg-soft)", padding: 10, borderRadius: 6 }}>
                {JSON.stringify(proposal.manifest, null, 2)}
              </pre>
              <p className="field-hint">{t("im.generateNote")}</p>
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
