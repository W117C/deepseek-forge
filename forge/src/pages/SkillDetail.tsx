import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Copy, Download, Star } from "lucide-react";
import type { Skill } from "../types";
import { useApp } from "../context/app";
import { authorOf, formatDate, formatDownloads, relatedPackages } from "../lib/registry";
import { useReady, copyText } from "../lib/hooks";
import { TypeIcon } from "../components/icons";
import { TrustBadge } from "../components/badges";
import { InstallButton } from "../components/InstallButton";
import { SkillCard } from "../components/cards/SkillCard";
import {
  Breadcrumb, DetailTabs, InstallBand, RelatedSection, SectionBlock,
  SecuritySection, SideRail, VersionsSection,
} from "../components/DetailShared";
import { DetailSkeleton, ErrorState } from "../components/states";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "how-it-works", label: "How it works" },
  { id: "examples", label: "Examples" },
  { id: "security", label: "Security" },
  { id: "versions", label: "Versions" },
];

export function SkillDetail() {
  const { slug } = useParams();
  const { allPackages } = useApp();
  const ready = useReady(360);

  const skill = useMemo(
    () => allPackages.find((p): p is Skill => p.type === "skill" && p.slug === slug),
    [allPackages, slug]
  );

  if (!ready) return <DetailSkeleton />;

  if (!skill) {
    return (
      <main className="forge-container" style={{ paddingTop: 48, paddingBottom: 96 }}>
        <ErrorState message={"package"} onRetry={() => window.location.reload()} />
      </main>
    );
  }

  const author = authorOf(skill);
  const related = relatedPackages(skill, allPackages, 3, "skill").filter((p): p is Skill => p.type === "skill");

  return (
    <main>
      <Breadcrumb items={[{ label: "Skills", to: "/skills" }, { label: skill.name }]} />

      <section className="detail-hero">
        <div className="forge-container detail-hero-inner">
          <div className="pkg-icon">
            <TypeIcon type="skill" size={26} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="type-tag">SKILL · {skill.domain.toUpperCase()}</div>
            <h1 className="detail-title">{skill.name}</h1>
            <p className="detail-desc">{skill.description}</p>
            <div className="detail-badges">
              <TrustBadge security={skill.security} />
              <span className="badge badge-community">v{skill.version}</span>
              <span className="badge badge-community">{skill.compatibility}</span>
            </div>
            <div className="detail-stats">
              <span className="stat"><Download size={13} /> {formatDownloads(skill.downloads)} installs</span>
              <span className="stat rating"><Star size={13} /> {skill.rating.toFixed(1)}</span>
              <span className="stat">by <span className="author-link">@{author.handle}</span></span>
              <span className="stat">updated {formatDate(skill.updatedAt)}</span>
            </div>
          </div>
          <div className="detail-actions">
            <InstallButton pkg={skill} size="lg" label="Install Skill" />
          </div>
        </div>
      </section>

      <DetailTabs tabs={TABS} />

      <div className="forge-container detail-main">
        <div className="detail-col">
          <SectionBlock id="overview" title="Overview" subtitle="A reusable capability for your Agents.">
            <div className="prose">
              {skill.longDescription.map((p, i) => <p key={i}>{p}</p>)}
            </div>
            <div className="install-grid" style={{ maxWidth: 560, marginTop: 16 }}>
              <div className="install-cell"><div className="k">Domain</div><div className="v">{skill.domain}</div></div>
              <div className="install-cell"><div className="k">Category</div><div className="v">{skill.category}</div></div>
              <div className="install-cell"><div className="k">Compatibility</div><div className="v">{skill.compatibility}</div></div>
              <div className="install-cell"><div className="k">Author</div><div className="v">@{author.handle}</div></div>
            </div>
            {skill.usedBy.length > 0 && (
              <>
                <h3 className="eyebrow" style={{ marginTop: 18, marginBottom: 10 }}>Used by</h3>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {skill.usedBy.map((n) => {
                    const a = allPackages.find((p) => p.type === "agent" && p.name === n);
                    return a
                      ? <Link key={n} to={"/agents/" + a.slug} className="chip chip--accent">{n} →</Link>
                      : <span key={n} className="chip">{n}</span>;
                  })}
                </div>
              </>
            )}
          </SectionBlock>

          <SectionBlock id="how-it-works" title="How it works" subtitle="Inputs, process and outputs.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <StepCol title="Inputs" items={skill.inputs} />
              <StepCol title="Process" items={skill.process} />
              <StepCol title="Outputs" items={skill.outputs} />
            </div>
          </SectionBlock>

          <SectionBlock id="examples" title="Example prompts" subtitle="Try these in DeepSeek Harness with this skill loaded.">
            <div className="prompt-list">
              {skill.examplePrompts.map((p) => (
                <div key={p} className="prompt-row">
                  <span className="prompt-ico"><ArrowRight size={13} /></span>
                  <span>“{p}”</span>
                  <button aria-label="Copy prompt" onClick={async () => { await copyText(p); }}>
                    <Copy size={13} />
                  </button>
                </div>
              ))}
            </div>
          </SectionBlock>

          <SecuritySection pkg={skill} />
          <VersionsSection pkg={skill} />

          {related.length > 0 && (
            <RelatedSection title="Related Skills">
              {related.map((r) => <SkillCard key={r.id} skill={r} />)}
            </RelatedSection>
          )}
        </div>

        <aside className="detail-side">
          <SideRail pkg={skill} />
        </aside>
      </div>

      <div className="forge-container">
        <InstallBand pkg={skill} />
        <div style={{ height: 48 }} />
      </div>
    </main>
  );
}

function StepCol({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="side-card" style={{ marginBottom: 0 }}>
      <h4>{title}</h4>
      <ol style={{ paddingLeft: 18 }}>
        {items.map((it, i) => (
          <li key={it} style={{ fontSize: 12.5, color: "var(--foreground-2)", lineHeight: 1.55, marginBottom: 6, listStyle: "decimal" }}>
            {it}
            <span className="mono" style={{ display: "block", fontSize: 9.5, color: "var(--muted)", marginTop: 1 }}>
              STEP {String(i + 1).padStart(2, "0")}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
