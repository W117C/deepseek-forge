import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { Download, Layers, ShieldCheck, Star } from "lucide-react";
import type { Bundle } from "../types";
import { useApp } from "../context/app";
import { authorOf, formatDate, formatDownloads, relatedPackages } from "../lib/registry";
import { useReady } from "../lib/hooks";
import { TypeIcon } from "../components/icons";
import { TrustBadge } from "../components/badges";
import { InstallButton } from "../components/InstallButton";
import { FlowDiagram } from "../components/FlowDiagram";
import type { DiagramRow } from "../components/FlowDiagram";
import {
  Breadcrumb, DetailTabs, InstallBand, RelatedSection, SectionBlock,
  SecuritySection, SideRail, VersionsSection,
} from "../components/DetailShared";
import { DetailSkeleton, ErrorState } from "../components/states";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "architecture", label: "Architecture" },
  { id: "components", label: "Components" },
  { id: "security", label: "Security" },
  { id: "versions", label: "Versions" },
];

export function BundleDetail() {
  const { slug } = useParams();
  const { allPackages } = useApp();
  const ready = useReady(360);

  const bundle = useMemo(
    () => allPackages.find((p): p is Bundle => p.type === "bundle" && p.slug === slug),
    [allPackages, slug]
  );

  if (!ready) return <DetailSkeleton />;

  if (!bundle) {
    return (
      <main className="forge-container" style={{ paddingTop: 48, paddingBottom: 96 }}>
        <ErrorState message={"package"} onRetry={() => window.location.reload()} />
      </main>
    );
  }

  const author = authorOf(bundle);
  const agentNames = bundle.agents
    .map((id) => allPackages.find((p) => p.type === "agent" && p.id === id))
    .filter(Boolean);
  const related = relatedPackages(bundle, allPackages, 3, "bundle").filter((p): p is Bundle => p.type === "bundle");
  const c = bundle.counts;

  const skillLinks = bundle.contents.skills.map((name) => {
    const s = allPackages.find((x) => x.type === "skill" && x.name.toLowerCase() === name.toLowerCase());
    return s ? { name, to: "/skills/" + s.slug } : { name, to: undefined as string | undefined };
  });
  const pluginLinks = bundle.contents.plugins.map((name) => {
    const p = allPackages.find((x) => x.type === "plugin" && x.name.toLowerCase() === name.toLowerCase());
    return p ? { name, to: "/plugins/" + p.slug } : { name, to: undefined as string | undefined };
  });

  const rows: DiagramRow[] = [
    { boxes: [{ id: "agent", label: "AGENT", text: agentNames[0]?.name ?? bundle.agents[0] ?? "Agent", accent: true }] },
    { boxes: [{ id: "profile", label: "PROFILE", text: bundle.contents.profile }] },
    { boxes: bundle.contents.workflows.slice(0, 3).map((w) => ({ id: "w-" + w, label: "WORKFLOW", text: w })) },
    { boxes: bundle.contents.skills.slice(0, 6).map((s) => ({ id: "s-" + s, label: "SKILL", text: s })) },
    { boxes: bundle.contents.plugins.slice(0, 6).map((p) => ({ id: "p-" + p, label: "PLUGIN", text: p })) },
    { boxes: [{ id: "bundle", label: "BUNDLE", text: bundle.name }] },
    { boxes: [], bar: { label: "RUNTIME", text: "DEEPSEEK HARNESS" } },
  ];

  return (
    <main>
      <Breadcrumb items={[{ label: "Bundles", to: "/bundles" }, { label: bundle.name }]} />

      <section className="detail-hero">
        <div className="forge-container detail-hero-inner">
          <div className="pkg-icon">
            <TypeIcon type="bundle" size={26} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="type-tag">BUNDLE · {bundle.category.toUpperCase()}</div>
            <h1 className="detail-title">{bundle.name}</h1>
            <p className="detail-desc">{bundle.description}</p>
            <div className="detail-badges">
              <TrustBadge security={bundle.security} />
              <span className="badge badge-scanned"><ShieldCheck /> Security Scanned</span>
              <span className="badge badge-community">v{bundle.version}</span>
            </div>
            <div className="detail-stats">
              <span className="stat"><Download size={13} /> {formatDownloads(bundle.downloads)} installs</span>
              <span className="stat rating"><Star size={13} /> {bundle.rating.toFixed(1)}</span>
              <span className="stat">by <span className="author-link">@{author.handle}</span></span>
              <span className="stat">updated {formatDate(bundle.updatedAt)}</span>
            </div>
          </div>
          <div className="detail-actions">
            <InstallButton pkg={bundle} size="lg" label="Install Bundle" />
          </div>
        </div>
      </section>

      <div className="forge-container" style={{ paddingTop: 24 }}>
        <div className="bundle-comps" style={{ maxWidth: 720 }}>
          <div className="bundle-comp"><b>{c.skills}</b><span>Skills</span></div>
          <div className="bundle-comp"><b>{c.plugins}</b><span>Plugins</span></div>
          <div className="bundle-comp"><b>{c.workflows}</b><span>Workflows</span></div>
          <div className="bundle-comp"><b>{c.profiles}</b><span>Profile</span></div>
        </div>
      </div>

      <DetailTabs tabs={TABS} />

      <div className="forge-container detail-main">
        <div className="detail-col">
          <SectionBlock id="overview" title="Overview" subtitle="A complete capability stack for one specialized Agent.">
            <div className="prose">
              {bundle.longDescription.map((p, i) => <p key={i}>{p}</p>)}
            </div>
            {agentNames.length > 0 && (
              <>
                <h3 className="eyebrow" style={{ marginTop: 18, marginBottom: 10 }}>Agents built on this bundle</h3>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {agentNames.map((a) => (
                    <Link key={a!.id} to={"/agents/" + a!.slug} className="chip chip--accent">{a!.name} →</Link>
                  ))}
                </div>
              </>
            )}
          </SectionBlock>

          <SectionBlock id="architecture" title="Architecture" subtitle="From components to a specialized Agent. Hover to trace connections.">
            <div className="arch-wrap" style={{ maxWidth: 860, margin: "0 auto" }}>
              <FlowDiagram rows={rows} title={bundle.name + " architecture"} />
            </div>
            <p className="mono" style={{ textAlign: "center", marginTop: 8, fontSize: 10.5, color: "var(--muted)" }}>
              SKILLS + TOOLS + PLUGINS → {bundle.name.toUpperCase()} → AGENT → DEEPSEEK HARNESS
            </p>
          </SectionBlock>

          <SectionBlock id="components" title="Components" subtitle={"What ships inside " + bundle.name + "."}>
            <h3 className="eyebrow" style={{ marginBottom: 8 }}>Skills ({skillLinks.length})</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
              {skillLinks.map((s) => s.to
                ? <Link key={s.name} to={s.to} className="chip">{s.name}</Link>
                : <span key={s.name} className="chip">{s.name}</span>
              )}
            </div>
            <h3 className="eyebrow" style={{ marginBottom: 8 }}>Plugins ({pluginLinks.length})</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
              {pluginLinks.map((p) => p.to
                ? <Link key={p.name} to={p.to} className="chip">{p.name}</Link>
                : <span key={p.name} className="chip">{p.name}</span>
              )}
            </div>
            <h3 className="eyebrow" style={{ marginBottom: 8 }}>Workflows ({bundle.contents.workflows.length})</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
              {bundle.contents.workflows.map((w) => <span key={w} className="chip chip--solid">{w}</span>)}
            </div>
            <h3 className="eyebrow" style={{ marginBottom: 8 }}>Profile</h3>
            <div className="prompt-row" style={{ maxWidth: 420 }}>
              <Layers size={13} style={{ color: "var(--muted)" }} />
              <span>{bundle.contents.profile}</span>
            </div>
          </SectionBlock>

          <SecuritySection pkg={bundle} />
          <VersionsSection pkg={bundle} />

          {related.length > 0 && (
            <RelatedSection title="Related Bundles">
              {related.map((r) => <BundleCardMini key={r.id} bundle={r} />)}
            </RelatedSection>
          )}
        </div>

        <aside className="detail-side">
          <SideRail pkg={bundle} />
        </aside>
      </div>

      <div className="forge-container">
        <InstallBand pkg={bundle} />
        <div style={{ height: 48 }} />
      </div>
    </main>
  );
}

function BundleCardMini({ bundle }: { bundle: Bundle }) {
  return (
    <Link to={"/bundles/" + bundle.slug} className="card">
      <div className="pkg-card-head">
        <div className="pkg-icon"><TypeIcon type="bundle" /></div>
        <div>
          <div className="type-tag">BUNDLE</div>
          <div className="pkg-card-name">{bundle.name}</div>
        </div>
      </div>
      <p className="pkg-card-desc">{bundle.description}</p>
      <div className="pkg-meta">
        <span>v{bundle.version}</span>
        <span className="sep">·</span>
        <span>{formatDownloads(bundle.downloads)} installs</span>
      </div>
    </Link>
  );
}
