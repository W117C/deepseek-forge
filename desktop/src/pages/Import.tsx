// GitHub Import — a developer tool, not a chat UI.
// Paste a repository URL / local path → analyze (nothing executed) →
// review capability & security findings → propose adapter / generate scaffold.
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, CircleDashed, Github, ScanSearch, ShieldCheck, TriangleAlert } from "lucide-react";
import { adapterGenerate, adapterPropose, adapterStatus, importAnalyze, registryImportAgent } from "../ipc";
import { useI18n } from "../i18n";
import { RECIPES } from "../data/recipes";
import {
  Badge,
  ErrorCard,
  InlineLoading,
  useToast,
} from "../components/ui";
import type { AdapterProposal, AdapterStatus, RepositoryAnalysis } from "../ipc";

type State =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "error"; message: unknown }
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
  const { t, locale } = useI18n();
  const toast = useToast();
  const [params] = useSearchParams();
  const recipeId = params.get("recipe");
  const role = params.get("role");
  const recipe = recipeId ? RECIPES.find((r) => r.id === recipeId) : null;
  const L = (x: { zh: string; en: string }) => (locale === "zh" ? x.zh : x.en);
  const [source, setSource] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const [proposal, setProposal] = useState<AdapterProposal | null>(null);
  const [proposalErr, setProposalErr] = useState<unknown>(null);
  const [proposing, setProposing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const [adapt, setAdapt] = useState<AdapterStatus | null>(null);
  const [adaptErr, setAdaptErr] = useState<unknown>(null);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);

  async function refreshAdapt(dir: string) {
    setAdaptErr(null);
    try {
      const st = await adapterStatus(dir);
      setAdapt(st);
      if (!st.exists) setAdaptErr(new Error(t("im.adaptMissing", { dir })));
    } catch (err) {
      setAdapt(null);
      setAdaptErr(err);
    }
  }

  async function registerAgent(dir: string) {
    setRegistering(true);
    setAdaptErr(null);
    try {
      await registryImportAgent(dir);
      setRegistered(true);
      toast("success", t("im.adaptRegistered"));
    } catch (err) {
      setAdaptErr(err);
      toast("error", t("common.failed"), dir);
    } finally {
      setRegistering(false);
    }
  }

  async function proposeAdapter() {
    const s = source.trim();
    if (!s) return;
    setProposing(true);
    setProposalErr(null);
    try {
      setProposal(await adapterPropose(s));
    } catch (err) {
      setProposal(null);
      setProposalErr(err);
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
      const dir = res.packageDir ?? "";
      setGenerated(dir);
      setRegistered(false);
      toast("success", t("im.generatedShort"));
      void refreshAdapt(dir);
    } catch (err) {
      setProposalErr(err);
    } finally {
      setGenerating(false);
    }
  }

  async function run() {
    const s = source.trim();
    if (!s) return;
    setState({ status: "busy" });
    setProposal(null);
    setGenerated(null);
    try {
      const analysis = await importAnalyze(s);
      setState({ status: "ready", analysis });
    } catch (err) {
      setState({ status: "error", message: err });
    }
  }

  const a = state.status === "ready" ? state.analysis : null;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-heading">{t("nav.import")}</h1>
          <p className="page-sub">{t("im.subtitle")}</p>
        </div>
      </header>

      {recipe && role && (
        <div className="note" data-tone="ok" style={{ marginBottom: 16 }}>
          <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span>
              {t("im.recipeFillNote", { recipe: L(recipe.name), role })}
            </span>
            <Link
              to="/marketplace"
              className="mono"
              style={{ color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}
              title={t("im.backToRecipes")}
            >
              <ArrowLeft size={11} />
              {t("im.backToRecipes")}
            </Link>
          </span>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <div className="search-box">
            <Github size={13} className="search-icon" />
            <input
              className="input"
              placeholder={t("im.placeholder")}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void run();
              }}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={() => void run()}
            disabled={state.status === "busy" || !source.trim()}
          >
            {state.status === "busy" ? (
              <InlineLoading label={t("im.analyzing")} />
            ) : (
              <>
                <ScanSearch size={14} />
                {t("im.analyze")}
              </>
            )}
          </button>
        </div>
        <p className="field-hint">{t("im.localHint")}</p>
      </div>

      {state.status === "error" && <ErrorCard error={state.message} />}

      {a && (
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Github size={16} />
            <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
              {a.owner ? a.owner + "/" + a.repo : a.source}
            </span>
            <Badge tone="community">{TYPE_LABEL[a.packageType] ?? a.packageType}</Badge>
            <Badge
              tone={
                a.securityRisk === "low"
                  ? "verified"
                  : a.securityRisk === "high"
                    ? "blocked"
                    : "warning"
              }
            >
              {t("im.risk")} {a.securityRisk}
            </Badge>
          </div>

          <div className="stat-grid" style={{ marginTop: 16, gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
            <Stat label={t("im.license")} value={a.license ?? "—"} warn={a.licenseMissing} />
            <Stat label={t("im.language")} value={a.language ?? "—"} />
            <Stat label={t("im.entryPoint")} value={a.entryPoint ?? "—"} />
            <Stat label={t("im.forgeCompat")} value={a.forgeCompatibility} />
          </div>

          {a.licenseMissing && (
            <div className="note" style={{ marginTop: 12 }}>
              {t("im.noLicense")}
            </div>
          )}

          <div className="sec-head" style={{ margin: "24px 0 8px" }}>
            <h2 className="sec-title">{t("im.capsSecurity")}</h2>
            <span className="sec-count">
              {t("im.scanLine", {
                score: a.scan.score,
                verdict: a.scan.verdict,
                files: a.scan.files,
              })}
            </span>
          </div>
          <div className="list">
            <CapRow icon={ShieldCheck} label={t("im.networkRefs", { n: a.networkUsage.length })} />
            <CapRow icon={ShieldCheck} label={t("im.fsWrites", { n: a.filesystemUsage.length })} />
            <CapRow icon={ShieldCheck} label={t("im.envVars", { n: a.envVars.length })} />
            <CapRow
              icon={TriangleAlert}
              label={t("im.dangerous", { n: a.dangerousCommands.length })}
              tone={a.dangerousCommands.length > 0 ? "warn" : undefined}
            />
            <CapRow
              icon={TriangleAlert}
              label={t("im.secrets", { n: a.secretsFound.length })}
              tone={a.secretsFound.length > 0 ? "warn" : undefined}
            />
          </div>

          {a.dependencies.length > 0 && (
            <>
              <div className="sec-head" style={{ margin: "24px 0 8px" }}>
                <h2 className="sec-title">{t("im.deps", { n: a.dependencies.length })}</h2>
              </div>
              <div className="card" style={{ padding: "12px 16px" }}>
                <span className="mono" style={{ fontSize: 11.5, color: "var(--foreground-2)", lineHeight: 2 }}>
                  {a.dependencies.slice(0, 12).join(" · ")}
                  {a.dependencies.length > 12 ? " …" : ""}
                </span>
              </div>
            </>
          )}

          <div style={{ marginTop: 20, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={() => void proposeAdapter()} disabled={proposing}>
              {proposing ? <InlineLoading label={t("im.proposing")} /> : t("im.createProposal")}
            </button>
            <button className="btn btn-outline" onClick={() => void generate()} disabled={generating}>
              {generating ? <InlineLoading label={t("im.generating")} /> : t("im.generate")}
            </button>
            <span className="field-hint" style={{ marginTop: 0 }}>{t("im.rulesGen")}</span>
          </div>

          {proposalErr ? (
            <div style={{ marginTop: 12 }}>
              <ErrorCard error={proposalErr} />
            </div>
          ) : null}

          {proposal && (
            <div className="card" style={{ marginTop: 12, padding: 16 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                <Badge tone="community">
                  {proposal.generator === "rules" ? "rules (non-AI)" : proposal.generator}
                </Badge>
                {proposal.requiresHumanReview && (
                  <Badge tone="blocked">{t("im.requiresReview")}</Badge>
                )}
              </div>
              <pre
                className="mono"
                style={{
                  fontSize: 11,
                  maxHeight: 320,
                  overflow: "auto",
                  background: "var(--bg-soft)",
                  border: "1px solid var(--border)",
                  padding: 12,
                  borderRadius: 6,
                  lineHeight: 1.7,
                }}
              >
                {JSON.stringify(proposal.manifest, null, 2)}
              </pre>
              <p className="field-hint">{t("im.generateNote")}</p>
            </div>
          )}
        </div>
      )}
          {generated && (
            <div className="card" style={{ marginTop: 12, padding: 16 }}>
              <div className="detail-sec-head">
                <span className="detail-sec-title">{t("im.adaptPanel")}</span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {generated}
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={() => void refreshAdapt(generated)}>
                    {t("im.adaptRefresh")}
                  </button>
                </span>
              </div>

              {adapt && (
                <>
                  <div className="recipe-block-title">
                    {t("im.adaptHooks")} · {adapt.hooksFilled}/{adapt.hooksTotal}
                  </div>
                  <div className="recipe-slots">
                    {adapt.hooks.map((h) => (
                      <div key={h.name} className="recipe-slot" style={{ padding: "5px 10px" }}>
                        <span className="recipe-slot-role" style={{ width: 150 }}>{h.name}</span>
                        {h.filled ? (
                          <span className="stack-cap-state ok"><Check size={11} /> {t("im.adaptHookFilled")}</span>
                        ) : (
                          <span className="stack-cap-state"><CircleDashed size={11} /> {t("im.adaptHookEmpty")}</span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="recipe-block-title">{t("im.adaptAgentForm")}</div>
                  <div className="recipe-slot" style={{ padding: "5px 10px" }}>
                    <span className="recipe-slot-role" style={{ width: 150 }}>agenthub.yaml + preset/ + bundle/</span>
                    {adapt.agentForm ? (
                      <span className="stack-cap-state ok"><Check size={11} /> {t("im.adaptHookFilled")}</span>
                    ) : (
                      <span className="stack-cap-state"><CircleDashed size={11} /> {t("im.adaptHookEmpty")}</span>
                    )}
                  </div>
                  <p className="field-hint">{t("im.adaptAgentFormHint")}</p>

                  <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      className="btn btn-primary"
                      onClick={() => void registerAgent(generated)}
                      disabled={registering || registered || adapt.hooksFilled < adapt.hooksTotal || !adapt.agentForm}
                      title={adapt.hooksFilled < adapt.hooksTotal || !adapt.agentForm ? t("im.adaptNeedAll") : undefined}
                    >
                      {registering ? (
                        <InlineLoading label={t("im.adaptRegistering")} />
                      ) : registered ? (
                        t("im.adaptRegistered") + " ✓"
                      ) : (
                        t("im.adaptRegister")
                      )}
                    </button>
                    {registered && (
                      <Link className="btn btn-ghost btn-sm" to="/marketplace">
                        {t("im.adaptGoInstall")}
                      </Link>
                    )}
                  </div>
                </>
              )}
              {adaptErr ? (
                <div style={{ marginTop: 10 }}>
                  <ErrorCard error={adaptErr} />
                </div>
              ) : null}
            </div>
          )}

    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="stat-card" style={{ padding: 12, gap: 6 }}>
      <div className="stat-head">
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-value" style={{ fontSize: 16, ...(warn ? { color: "var(--warning)" } : {}) }}>
        {value}
      </div>
    </div>
  );
}

function CapRow({
  icon: Icon,
  label,
  tone,
}: {
  icon: typeof ShieldCheck;
  label: string;
  tone?: "warn";
}) {
  return (
    <div className="act-row" style={{ padding: "8px 16px" }}>
      <span className="act-time" />
      <span className="act-ico" style={tone ? { color: "var(--warning)", borderColor: "var(--warning-soft)" } : undefined}>
        <Icon size={12} />
      </span>
      <span className="act-text" style={{ color: "var(--foreground)" }}>{label}</span>
    </div>
  );
}
