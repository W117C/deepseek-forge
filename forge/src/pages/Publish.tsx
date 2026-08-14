import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, PackageCheck, ShieldCheck, Upload } from "lucide-react";
import type { AnyPackage, PackageType, SecurityReport } from "../types";
import { useApp } from "../context/app";
import { categories, plugins as mockPlugins, skills as mockSkills, workflowCatalog } from "../data/mock";
import { TypeIcon } from "../components/icons";
import { PackageCardPreview } from "../components/PreviewCard";

interface Draft {
  type: PackageType | null;
  name: string;
  description: string;
  category: string;
  repository: string;
  license: string;
  version: string;
  plugins: string[];
  skills: string[];
  workflows: string[];
  profile: string;
  network: string;
  filesystem: string;
  shell: string;
  secrets: string;
  scanned: boolean;
}

const INITIAL: Draft = {
  type: null, name: "", description: "", category: "", repository: "",
  license: "MIT", version: "0.1.0",
  plugins: [], skills: [], workflows: [], profile: "",
  network: "none", filesystem: "none", shell: "none", secrets: "none",
  scanned: false,
};

const STEPS = [
  { n: 1, label: "Package type" },
  { n: 2, label: "Information" },
  { n: 3, label: "Dependencies" },
  { n: 4, label: "Permissions" },
  { n: 5, label: "Security scan" },
  { n: 6, label: "Preview" },
  { n: 7, label: "Publish" },
];

const LICENSES = ["MIT", "Apache-2.0", "BSD-3-Clause", "GPL-3.0", "Proprietary"];

export function PublishPage() {
  const navigate = useNavigate();
  const { publishPackage } = useApp();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(INITIAL);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [scanLines, setScanLines] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<AnyPackage | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const slug = useMemo(
    () => draft.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
    [draft.name]
  );

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const mark = (k: string) => setTouched((t) => ({ ...t, [k]: true }));

  /* ---------- validation ---------- */
  const vName = draft.name.trim().length >= 3;
  const vDesc = draft.description.trim().length >= 20;
  const vVersion = /^\d+\.\d+\.\d+$/.test(draft.version.trim());
  const vRepo = draft.repository.trim() === "" || /^https?:\/\//.test(draft.repository.trim());
  const vDeps = draft.type === "plugin" || draft.type === "skill"
    ? true
    : draft.plugins.length + draft.skills.length + draft.workflows.length >= 1;

  const stepValid = [
    draft.type !== null,
    vName && vDesc && vVersion && vRepo && draft.category !== "",
    vDeps,
    true,
    draft.scanned,
    true,
    true,
  ][step];

  const err = (k: string, bad: boolean, msg: string) =>
    touched[k] && bad ? <span className="field-error">{msg}</span> : null;

  function toggleList(list: "plugins" | "skills" | "workflows", value: string) {
    setDraft((d) => {
      const cur = d[list];
      return { ...d, [list]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] };
    });
  }

  function runScan() {
    setScanning(true);
    setScanLines([]);
    const lines = [
      "Analyzing package contents…",
      "Checking permission manifest",
      "Verifying dependency signatures",
      "Scanning for secrets and telemetry",
      "No critical findings",
    ];
    let i = 0;
    const t = window.setInterval(() => {
      if (i < lines.length) {
        setScanLines((prev) => [...prev, lines[i]]);
        i += 1;
      } else {
        window.clearInterval(t);
        setScanning(false);
        patch({ scanned: true });
      }
    }, 380);
  }

  function buildPackage(): AnyPackage {
    const today = new Date().toISOString().slice(0, 10);
    const security: SecurityReport = {
      level: "scanned",
      scanned: true,
      network: draft.network as SecurityReport["network"],
      filesystem: draft.filesystem as SecurityReport["filesystem"],
      shell: draft.shell as SecurityReport["shell"],
      processes: "none",
      secrets: draft.secrets as SecurityReport["secrets"],
      dependencies: draft.plugins.length + draft.skills.length + draft.workflows.length + 1,
      lastScanned: today,
    };
    const base = {
      id: slug,
      slug,
      name: draft.name.trim(),
      description: draft.description.trim(),
      type: draft.type as PackageType,
      version: draft.version.trim(),
      authorId: "you",
      category: draft.category,
      tags: [...draft.plugins.slice(0, 2), ...draft.skills.slice(0, 2)],
      downloads: 0,
      rating: 0,
      reviewsCount: 0,
      verified: false,
      security,
      compatibility: "DeepSeek Harness >= 0.5.0",
      createdAt: today,
      updatedAt: today,
      growth: 0,
      longDescription: [draft.description.trim()],
    };
    if (draft.type === "agent") {
      return {
        ...base, type: "agent" as const,
        bundleId: slug + "-bundle",
        profile: draft.profile.trim() || slug,
        capabilities: [draft.category],
        examplePrompts: [],
        workflow: draft.workflows,
        components: { workflows: draft.workflows, skills: draft.skills, plugins: draft.plugins },
        reviews: [],
      };
    }
    if (draft.type === "bundle") {
      return {
        ...base, type: "bundle" as const,
        counts: { skills: draft.skills.length, plugins: draft.plugins.length, workflows: draft.workflows.length, profiles: 1 },
        contents: { skills: draft.skills, plugins: draft.plugins, workflows: draft.workflows, profile: draft.profile.trim() || slug },
        agents: [],
      };
    }
    if (draft.type === "plugin") {
      return { ...base, type: "plugin" as const, config: [], usedBy: [] };
    }
    return {
      ...base, type: "skill" as const,
      domain: draft.category,
      inputs: [], process: [], outputs: [], examplePrompts: [], usedBy: [],
    };
  }

  function doPublish() {
    setPublishing(true);
    window.setTimeout(() => {
      const pkg = buildPackage();
      publishPackage(pkg);
      setPublished(pkg);
      setPublishing(false);
    }, 1200);
  }

  return (
    <main>
      <section className="page-hero">
        <div className="forge-container">
          <span className="eyebrow">Developers</span>
          <h1>Publish a Package</h1>
          <p className="lead">
            Share an Agent, Bundle, Plugin or Skill with the DeepSeek Forge community.
            No backend required — this is the full flow.
          </p>
        </div>
      </section>

      <div className="forge-container publish-layout">
        <aside className="wiz-steps" aria-label="Publishing steps">
          {STEPS.map((s, i) => (
            <button
              key={s.n}
              className={"wiz-step" + (i === step ? " active" : "") + (i < step ? " done" : "")}
              onClick={() => { if (i < step) setStep(i); }}
              aria-current={i === step ? "step" : undefined}
            >
              <span className="n">{i < step ? <Check size={11} /> : s.n}</span>
              {s.label}
            </button>
          ))}
        </aside>

        <div className="wiz-body">
          {/* ============ STEP 1: TYPE ============ */}
          {step === 0 && (
            <div className="wiz-card">
              <h2>What are you publishing?</h2>
              <p className="hint">Agents are outcomes. Bundles, Plugins and Skills are the components that make them work.</p>
              <div className="type-radio-grid">
                {([
                  ["agent", "Agent", "A complete specialized Agent: profile, workflows, skills and plugins."],
                  ["bundle", "Bundle", "A capability stack that turns the Harness into a specialized Agent."],
                  ["plugin", "Plugin", "A capability extension: data, tools or execution backends."],
                  ["skill", "Skill", "A reusable capability with defined inputs and outputs."],
                ] as [PackageType, string, string][]).map(([t, label, desc]) => (
                  <button
                    key={t}
                    className={"type-radio" + (draft.type === t ? " selected" : "")}
                    onClick={() => patch({ type: t })}
                    aria-pressed={draft.type === t}
                  >
                    <span className="tr-head">
                      <span className={"pkg-icon" + (t === "agent" ? " pkg-icon--agent" : "")}>
                        <TypeIcon type={t} />
                      </span>
                      <span>
                        <span className="tr-type">{t.toUpperCase()}</span>
                        <br />
                        <b>{label}</b>
                      </span>
                    </span>
                    <p>{desc}</p>
                  </button>
                ))}
              </div>
              <div className="wiz-actions">
                <span />
                <button className="btn btn-primary" disabled={!stepValid} onClick={() => setStep(1)}>
                  Continue <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* ============ STEP 2: INFORMATION ============ */}
          {step === 1 && (
            <div className="wiz-card">
              <h2>Package information</h2>
              <p className="hint">This is what the community will see in search and on the package page.</p>
              <div className="field">
                <label className="field-label" htmlFor="f-name">Name <span className="req">*</span></label>
                <input id="f-name" className={"input" + (touched.name && !vName ? " invalid" : "")} value={draft.name} placeholder="e.g. Supply Chain Analyst"
                  onChange={(e) => patch({ name: e.target.value })} onBlur={() => mark("name")} />
                {err("name", !vName, "At least 3 characters.")}
                {draft.name.trim().length >= 3 && <div className="field-hint mono">slug: {slug}</div>}
              </div>
              <div className="field">
                <label className="field-label" htmlFor="f-desc">Description <span className="req">*</span></label>
                <textarea id="f-desc" className={"textarea" + (touched.description && !vDesc ? " invalid" : "")} value={draft.description}
                  placeholder="What does this package let DeepSeek do?" onChange={(e) => patch({ description: e.target.value })} onBlur={() => mark("description")} />
                {err("description", !vDesc, "At least 20 characters — one clear sentence.")}
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="field-label" htmlFor="f-cat">Category <span className="req">*</span></label>
                  <select id="f-cat" className="select" value={draft.category} onChange={(e) => patch({ category: e.target.value })}>
                    <option value="">Select…</option>
                    {categories.map((c) => <option key={c.slug} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="f-ver">Version <span className="req">*</span></label>
                  <input id="f-ver" className={"input" + (touched.version && !vVersion ? " invalid" : "")} value={draft.version}
                    placeholder="0.1.0" onChange={(e) => patch({ version: e.target.value })} onBlur={() => mark("version")} />
                  {err("version", !vVersion, "Semver required: x.y.z")}
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="field-label" htmlFor="f-repo">Repository</label>
                  <input id="f-repo" className={"input" + (touched.repository && !vRepo ? " invalid" : "")} value={draft.repository}
                    placeholder="https://github.com/you/repo" onChange={(e) => patch({ repository: e.target.value })} onBlur={() => mark("repository")} />
                  {err("repository", !vRepo, "Must be a valid URL.")}
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="f-lic">License</label>
                  <select id="f-lic" className="select" value={draft.license} onChange={(e) => patch({ license: e.target.value })}>
                    {LICENSES.map((l) => <option key={l}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div className="wiz-actions">
                <button className="btn btn-ghost" onClick={() => setStep(0)}><ArrowLeft size={14} /> Back</button>
                <button className="btn btn-primary" disabled={!stepValid} onClick={() => setStep(2)}>
                  Continue <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* ============ STEP 3: DEPENDENCIES ============ */}
          {step === 2 && (
            <div className="wiz-card">
              <h2>Dependencies</h2>
              <p className="hint">
                {draft.type === "agent" && "Select the skills, plugins and workflows your Agent will use."}
                {draft.type === "bundle" && "Select the skills, plugins and workflows that ship in the bundle."}
                {(draft.type === "plugin" || draft.type === "skill") && "Optional: select capabilities this package builds on."}
              </p>
              <PickGroup title={"Plugins (" + draft.plugins.length + ")"} options={mockPlugins.map((p) => p.name)} selected={draft.plugins} onToggle={(v) => toggleList("plugins", v)} />
              <PickGroup title={"Skills (" + draft.skills.length + ")"} options={mockSkills.map((s) => s.name)} selected={draft.skills} onToggle={(v) => toggleList("skills", v)} />
              <PickGroup title={"Workflows (" + draft.workflows.length + ")"} options={workflowCatalog} selected={draft.workflows} onToggle={(v) => toggleList("workflows", v)} />
              {(draft.type === "agent" || draft.type === "bundle") && (
                <div className="field" style={{ marginTop: 16 }}>
                  <label className="field-label" htmlFor="f-profile">Profile name</label>
                  <input id="f-profile" className="input" value={draft.profile} placeholder={slug || "profile-name"}
                    onChange={(e) => patch({ profile: e.target.value })} />
                  <div className="field-hint">The profile name used with <code className="mono">dsh --profile</code>.</div>
                </div>
              )}
              {!vDeps && <div className="field-error" style={{ marginTop: 12 }}>Select at least one dependency for an {draft.type}.</div>}
              <div className="wiz-actions">
                <button className="btn btn-ghost" onClick={() => setStep(1)}><ArrowLeft size={14} /> Back</button>
                <button className="btn btn-primary" disabled={!stepValid} onClick={() => setStep(3)}>
                  Continue <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* ============ STEP 4: PERMISSIONS ============ */}
          {step === 3 && (
            <div className="wiz-card">
              <h2>Permissions</h2>
              <p className="hint">Declare the minimum permissions your package needs. Users see this before installing.</p>
              <PermRow label="Network" desc="Outbound requests" value={draft.network} options={["none", "limited", "full"]} onChange={(v) => patch({ network: v })} />
              <PermRow label="Filesystem" desc="File read / write" value={draft.filesystem} options={["none", "read", "read-write"]} onChange={(v) => patch({ filesystem: v })} />
              <PermRow label="Shell" desc="Command execution" value={draft.shell} options={["none", "restricted", "full"]} onChange={(v) => patch({ shell: v })} />
              <PermRow label="Secrets" desc="API keys & credentials" value={draft.secrets} options={["none", "optional", "required"]} onChange={(v) => patch({ secrets: v })} />
              <div className="security-note">
                Declaring fewer permissions builds trust. DeepSeek Harness enforces these at runtime.
              </div>
              <div className="wiz-actions">
                <button className="btn btn-ghost" onClick={() => setStep(2)}><ArrowLeft size={14} /> Back</button>
                <button className="btn btn-primary" onClick={() => setStep(4)}>
                  Continue <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* ============ STEP 5: SECURITY SCAN ============ */}
          {step === 4 && (
            <div className="wiz-card">
              <h2>Security scan</h2>
              <p className="hint">Run the community scanner. Results are published on your package page.</p>
              <div className="scan-box">
                {!draft.scanned && scanLines.length === 0 && (
                  <>
                    <ShieldCheck size={22} style={{ margin: "0 auto 10px", color: "var(--muted)" }} />
                    <button className="btn btn-primary" onClick={runScan} disabled={scanning}>
                      {scanning ? "Scanning…" : "Run security scan"}
                    </button>
                  </>
                )}
                {(scanLines.length > 0 || draft.scanned) && (
                  <>
                    <div className="scan-lines" aria-live="polite">
                      {scanLines.map((l, i) => (
                        <div key={i} className={l === "No critical findings" ? "ok" : ""}>
                          {i === scanLines.length - 1 && scanning ? "▸ " : "✓ "}{l}
                        </div>
                      ))}
                      {draft.scanned && (
                        <>
                          <div className="ok">✓ Scan complete</div>
                        </>
                      )}
                    </div>
                    {draft.scanned && (
                      <div className="scan-summary">
                        <div className="side-row"><span className="k">Network</span><span className="v" style={{ textTransform: "capitalize" }}>{draft.network}</span></div>
                        <div className="side-row"><span className="k">Filesystem</span><span className="v" style={{ textTransform: "capitalize" }}>{draft.filesystem}</span></div>
                        <div className="side-row"><span className="k">Shell</span><span className="v" style={{ textTransform: "capitalize" }}>{draft.shell}</span></div>
                        <div className="side-row"><span className="k">Secrets</span><span className="v" style={{ textTransform: "capitalize" }}>{draft.secrets}</span></div>
                        <div className="side-row"><span className="k">Findings</span><span className="v" style={{ color: "var(--success)" }}>0 critical</span></div>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="wiz-actions">
                <button className="btn btn-ghost" onClick={() => setStep(3)}><ArrowLeft size={14} /> Back</button>
                <button className="btn btn-primary" disabled={!stepValid} onClick={() => setStep(5)}>
                  Continue <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* ============ STEP 6: PREVIEW ============ */}
          {step === 5 && (
            <div className="wiz-card">
              <h2>Preview</h2>
              <p className="hint">This is how your package will appear in the marketplace.</p>
              <PackageCardPreview
                type={draft.type ?? "plugin"}
                name={draft.name}
                description={draft.description}
                category={draft.category}
                version={draft.version}
                plugins={draft.plugins}
                skills={draft.skills}
                workflows={draft.workflows}
              />
              <code className="mono" style={{ display: "block", marginTop: 16, fontSize: 12, color: "var(--foreground-2)" }}>
                $ forge install {slug}
              </code>
              <div className="wiz-actions">
                <button className="btn btn-ghost" onClick={() => setStep(4)}><ArrowLeft size={14} /> Back</button>
                <button className="btn btn-primary" onClick={() => setStep(6)}>
                  Continue <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* ============ STEP 7: PUBLISH ============ */}
          {step === 6 && !published && (
            <div className="wiz-card" style={{ textAlign: "center" }}>
              <Upload size={22} style={{ margin: "0 auto 10px", color: "var(--muted)" }} />
              <h2>Publish {draft.name || "your package"}</h2>
              <p className="hint" style={{ textAlign: "center" }}>
                Publishing makes it discoverable in search and on the marketplace.
                You can update it later with <code className="mono">forge publish</code>.
              </p>
              <button className="btn btn-primary btn-lg" onClick={doPublish} disabled={publishing}>
                <PackageCheck size={16} /> {publishing ? "Publishing…" : "Publish Package"}
              </button>
              <div className="wiz-actions">
                <button className="btn btn-ghost" onClick={() => setStep(5)}><ArrowLeft size={14} /> Back</button>
                <span />
              </div>
            </div>
          )}

          {step === 6 && published && (
            <div className="wiz-card publish-success">
              <span className="big-check"><Check size={26} /></span>
              <h2>Published.</h2>
              <p className="hint" style={{ textAlign: "center", maxWidth: 380, margin: "0 auto 20px" }}>
                <b>{published.name}</b> v{published.version} is live on DeepSeek Forge.
                The community can install it with:
              </p>
              <code className="mono" style={{ display: "block", fontSize: 12.5, marginBottom: 24 }}>$ forge install {published.slug}</code>
              <div className="btn-row" style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                <button className="btn btn-primary" onClick={() => navigate("/" + (published.type === "agent" ? "agents" : published.type + "s") + "/" + published.slug)}>
                  View Package <ArrowRight size={14} />
                </button>
                <button className="btn btn-outline" onClick={() => navigate("/")}>Back to Marketplace</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function PickGroup({ title, options, selected, onToggle }: { title: string; options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="field">
      <div className="field-label">{title}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map((o) => (
          <button
            key={o}
            className={"chip" + (selected.includes(o) ? " chip--accent" : "")}
            onClick={() => onToggle(o)}
            aria-pressed={selected.includes(o)}
          >
            {selected.includes(o) && <Check size={10} style={{ marginRight: 4 }} />}
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function PermRow({ label, desc, value, options, onChange }: { label: string; desc: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="field" style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 16, alignItems: "center", borderBottom: "1px solid var(--border-soft)", paddingBottom: 14 }}>
      <div>
        <div className="field-label" style={{ marginBottom: 0 }}>{label}</div>
        <div className="field-hint" style={{ marginTop: 0 }}>{desc}</div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {options.map((o) => (
          <button
            key={o}
            className={"chip" + (value === o ? " chip--accent" : "")}
            onClick={() => onChange(o)}
            aria-pressed={value === o}
            style={{ textTransform: "capitalize" }}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
