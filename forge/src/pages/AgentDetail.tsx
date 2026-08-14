import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { ArrowRight, Check, Copy, Download, Star, Terminal } from "lucide-react";
import type { Agent } from "../types";
import { useApp } from "../context/app";
import { authorOf, formatDate, formatDownloads, relatedPackages } from "../lib/registry";
import { useReady } from "../lib/hooks";
import { copyText } from "../lib/hooks";
import { TypeIcon } from "../components/icons";
import { TrustBadge } from "../components/badges";
import { InstallButton } from "../components/InstallButton";
import { AgentCard } from "../components/cards/AgentCard";
import { DependencyTree } from "../components/DependencyTree";
import { FlowDiagram } from "../components/FlowDiagram";
import type { DiagramRow } from "../components/FlowDiagram";
import {
  Breadcrumb, DetailTabs, InstallBand, RelatedSection, ReviewsSection,
  SectionBlock, SecuritySection, SideRail, VersionsSection,
} from "../components/DetailShared";
import { DetailSkeleton, ErrorState } from "../components/states";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "capabilities", label: "Capabilities" },
  { id: "components", label: "Components" },
  { id: "architecture", label: "Architecture" },
  { id: "versions", label: "Versions" },
  { id: "security", label: "Security" },
  { id: "reviews", label: "Reviews" },
];

export function AgentDetail() {
  const { slug } = useParams();
  const { allPackages } = useApp();
  const ready = useReady(360);

  const agent = useMemo(
    () => allPackages.find((p): p is Agent => p.type === "agent" && p.slug === slug),
    [allPackages, slug]
  );

  if (!ready) return <DetailSkeleton />;

  if (!agent) {
    return (
      <main className="forge-container" style={{ paddingTop: 48, paddingBottom: 96 }}>
        <ErrorState message={"package"} onRetry={() => window.location.reload()} />
      </main>
    );
  }

  const author = authorOf(agent);
  const related = relatedPackages(agent, allPackages, 3, "agent").filter((p): p is Agent => p.type === "agent");

  const rows: DiagramRow[] = [
    { boxes: [{ id: "agent", label: "AGENT", text: agent.name, accent: true }] },
    { boxes: [{ id: "profile", label: "PROFILE", text: agent.profile }] },
    { boxes: agent.components.workflows.map((w) => ({ id: "w-" + w, label: "WORKFLOW", text: w })) },
    { boxes: agent.components.skills.map((s) => ({ id: "s-" + s, label: "SKILL", text: s })) },
    { boxes: agent.components.plugins.map((p) => ({ id: "p-" + p, label: "PLUGIN", text: p })) },
    { boxes: [], bar: { label: "RUNTIME", text: "DEEPSEEK HARNESS" } },
  ];

  return (
    <main>
      <Breadcrumb items={[{ label: "Agents", to: "/agents" }, { label: agent.name }]} />

      {/* ================= Hero ================= */}
      <section className="detail-hero">
        <div className="forge-container detail-hero-inner">
          <div className="pkg-icon pkg-icon--agent">
            <TypeIcon type="agent" size={26} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="type-tag">AGENT · {agent.category.toUpperCase()}</div>
            <h1 className="detail-title">{agent.name}</h1>
            <p className="detail-desc">{agent.description}</p>
            <div className="detail-badges">
              <TrustBadge security={agent.security} />
              <span className="badge badge-community">v{agent.version}</span>
              <span className="badge badge-community">{agent.compatibility}</span>
            </div>
            <div className="detail-stats">
              <span className="stat"><Download size={13} /> {formatDownloads(agent.downloads)} installs</span>
              <span className="stat rating"><Star size={13} /> {agent.rating.toFixed(1)}</span>
              <span className="stat">by <span className="author-link">@{author.handle}</span></span>
              <span className="stat">updated {formatDate(agent.updatedAt)}</span>
            </div>
          </div>
          <div className="detail-actions">
            <InstallButton pkg={agent} size="lg" />
            <a className="btn btn-outline btn-sm" href="https://github.com/W117C/deepseek-forge" target="_blank" rel="noopener noreferrer">
              <Terminal size={13} /> forge install {agent.slug}
            </a>
          </div>
        </div>
      </section>

      <DetailTabs tabs={TABS} />

      {/* ================= Main ================= */}
      <div className="forge-container detail-main">
        <div className="detail-col">
          <SectionBlock id="overview" title="What this Agent does" subtitle="A specialized Agent for DeepSeek Harness.">
            <div className="prose">
              {agent.longDescription.map((p, i) => <p key={i}>{p}</p>)}
            </div>
            <h3 style={{ fontSize: 14, margin: "18px 0 10px" }} className="eyebrow">Expected workflow</h3>
            <div className="flow-steps" aria-label="Expected workflow">
              {agent.workflow.map((step, i) => (
                <span key={step} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span className="flow-step">{step}</span>
                  {i < agent.workflow.length - 1 && <span className="flow-arrow">↓</span>}
                </span>
              ))}
            </div>
          </SectionBlock>

          <SectionBlock id="capabilities" title="Key capabilities" subtitle="What this Agent is built to do.">
            <ul style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {agent.capabilities.length === 0 && (
                <li style={{ fontSize: 13.5, color: "var(--muted)" }}>No capabilities published yet.</li>
              )}
              {agent.capabilities.map((c) => (
                <li key={c} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "var(--foreground-2)" }}>
                  <Check size={13} style={{ color: "var(--accent)" }} />
                  {c}
                </li>
              ))}
            </ul>

            <h3 className="eyebrow" style={{ marginTop: 28, marginBottom: 10 }}>Example prompts</h3>
            <div className="prompt-list">
              {agent.examplePrompts.length === 0 && (
                <p className="sub">No example prompts published yet.</p>
              )}
              {agent.examplePrompts.map((p) => (
                <div key={p} className="prompt-row">
                  <span className="prompt-ico"><ArrowRight size={13} /></span>
                  <span>“{p}”</span>
                  <button
                    aria-label="Copy prompt"
                    onClick={async () => { await copyText(p); }}
                  >
                    <Copy size={13} />
                  </button>
                </div>
              ))}
            </div>
          </SectionBlock>

          <SectionBlock id="components" title="Components" subtitle={"Everything bundled into " + agent.name + "."}>
            <DependencyTree agent={agent} />
            <p className="mono" style={{ marginTop: 10, fontSize: 10.5, color: "var(--muted)" }}>
              {agent.components.plugins.length} plugins · {agent.components.skills.length} skills · {agent.components.workflows.length} workflows · 1 profile
            </p>
          </SectionBlock>

          <SectionBlock id="architecture" title="Architecture" subtitle="Hover a component to highlight its connections.">
            <div className="arch-wrap" style={{ maxWidth: 820, margin: "0 auto" }}>
              <FlowDiagram rows={rows} title={agent.name + " architecture"} />
            </div>
          </SectionBlock>

          <VersionsSection pkg={agent} />
          <SecuritySection pkg={agent} />
          <ReviewsSection pkg={agent} reviews={agent.reviews} />

          {related.length > 0 && (
            <RelatedSection title="Related Agents">
              {related.map((r) => <AgentCard key={r.id} agent={r} />)}
            </RelatedSection>
          )}
        </div>

        <aside className="detail-side">
          <SideRail pkg={agent} />
        </aside>
      </div>

      <div className="forge-container">
        <InstallBand pkg={agent} />
        <div style={{ height: 48 }} />
      </div>
    </main>
  );
}
