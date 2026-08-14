import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { Download, Star } from "lucide-react";
import type { Plugin } from "../types";
import { useApp } from "../context/app";
import { authorOf, formatDate, formatDownloads, relatedPackages } from "../lib/registry";
import { useReady } from "../lib/hooks";
import { TypeIcon } from "../components/icons";
import { TrustBadge } from "../components/badges";
import { InstallButton } from "../components/InstallButton";
import { PluginCard } from "../components/cards/PluginCard";
import {
  Breadcrumb, DetailTabs, InstallBand, PermissionsSection, RelatedSection,
  SectionBlock, SecuritySection, SideRail, VersionsSection,
} from "../components/DetailShared";
import { DetailSkeleton, ErrorState } from "../components/states";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "configuration", label: "Configuration" },
  { id: "dependencies", label: "Dependencies" },
  { id: "permissions", label: "Permissions" },
  { id: "versions", label: "Versions" },
  { id: "security", label: "Security" },
];

const RUNTIME_DEPS: Record<string, { name: string; version: string }[]> = {
  "market-data": [{ name: "@forge/http", version: "^2.1.0" }, { name: "@forge/schema", version: "^1.4.0" }, { name: "@forge/cache", version: "^0.9.2" }],
  default: [{ name: "@forge/http", version: "^2.1.0" }, { name: "@forge/schema", version: "^1.4.0" }],
};

export function PluginDetail() {
  const { slug } = useParams();
  const { allPackages } = useApp();
  const ready = useReady(360);

  const plugin = useMemo(
    () => allPackages.find((p): p is Plugin => p.type === "plugin" && p.slug === slug),
    [allPackages, slug]
  );

  if (!ready) return <DetailSkeleton />;

  if (!plugin) {
    return (
      <main className="forge-container" style={{ paddingTop: 48, paddingBottom: 96 }}>
        <ErrorState message={"package"} onRetry={() => window.location.reload()} />
      </main>
    );
  }

  const author = authorOf(plugin);
  const related = relatedPackages(plugin, allPackages, 3, "plugin").filter((p): p is Plugin => p.type === "plugin");
  const usedByAgents = plugin.usedBy
    .map((n) => allPackages.find((p) => p.type === "agent" && p.name === n))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const deps = RUNTIME_DEPS[plugin.slug] ?? RUNTIME_DEPS.default;

  return (
    <main>
      <Breadcrumb items={[{ label: "Plugins", to: "/plugins" }, { label: plugin.name }]} />

      <section className="detail-hero">
        <div className="forge-container detail-hero-inner">
          <div className="pkg-icon">
            <TypeIcon type="plugin" size={26} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="type-tag">PLUGIN · {plugin.category.toUpperCase()}</div>
            <h1 className="detail-title">{plugin.name}</h1>
            <p className="detail-desc">{plugin.description}</p>
            <div className="detail-badges">
              <TrustBadge security={plugin.security} />
              <span className="badge badge-community">v{plugin.version}</span>
              <span className="badge badge-community">{plugin.compatibility}</span>
            </div>
            <div className="detail-stats">
              <span className="stat"><Download size={13} /> {formatDownloads(plugin.downloads)} installs</span>
              <span className="stat rating"><Star size={13} /> {plugin.rating.toFixed(1)}</span>
              <span className="stat">by <span className="author-link">@{author.handle}</span></span>
              <span className="stat">updated {formatDate(plugin.updatedAt)}</span>
            </div>
          </div>
          <div className="detail-actions">
            <InstallButton pkg={plugin} size="lg" label="Install Plugin" />
          </div>
        </div>
      </section>

      <DetailTabs tabs={TABS} />

      <div className="forge-container detail-main">
        <div className="detail-col">
          <SectionBlock id="overview" title="Overview" subtitle="A capability extension for DeepSeek Harness.">
            <div className="prose">
              {plugin.longDescription.map((p, i) => <p key={i}>{p}</p>)}
            </div>
            {usedByAgents.length > 0 && (
              <>
                <h3 className="eyebrow" style={{ marginTop: 18, marginBottom: 10 }}>Used by</h3>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {usedByAgents.map((a) => (
                    <Link key={a.id} to={"/agents/" + a.slug} className="chip chip--accent">{a.name} →</Link>
                  ))}
                </div>
              </>
            )}
          </SectionBlock>

          <SectionBlock id="configuration" title="Configuration" subtitle="Settings available to Agents that use this plugin.">
            {plugin.config.length === 0 ? (
              <p className="sub">No configuration required.</p>
            ) : (
              <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-l)", overflow: "hidden" }}>
                {plugin.config.map((c, i) => (
                  <div key={c.key} style={{ display: "grid", gridTemplateColumns: "160px 90px 1fr", gap: 12, padding: "12px 14px", borderBottom: i < plugin.config.length - 1 ? "1px solid var(--border-soft)" : "none", background: i % 2 === 0 ? "var(--background)" : "var(--background-2)" }}>
                    <code className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{c.key}</code>
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)", textTransform: "uppercase" }}>{c.kind}</span>
                    <span style={{ fontSize: 12.5, color: "var(--foreground-2)" }}>
                      {c.description}
                      <span className="mono" style={{ display: "block", fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>
                        default: {c.defaultValue === "" ? "—" : c.defaultValue}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionBlock>

          <SectionBlock id="dependencies" title="Dependencies" subtitle="Resolved by the registry at install time.">
            <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-l)", overflow: "hidden", maxWidth: 520 }}>
              {deps.map((d, i) => (
                <div key={d.name} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderBottom: i < deps.length - 1 ? "1px solid var(--border-soft)" : "none", background: i % 2 === 0 ? "var(--background)" : "var(--background-2)" }}>
                  <code className="mono" style={{ fontSize: 12 }}>{d.name}</code>
                  <code className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{d.version}</code>
                </div>
              ))}
            </div>
            <p className="mono" style={{ marginTop: 8, fontSize: 10.5, color: "var(--muted)" }}>
              {plugin.security.dependencies} total dependencies · security-scanned on publish
            </p>
          </SectionBlock>

          <PermissionsSection pkg={plugin} />
          <VersionsSection pkg={plugin} />
          <SecuritySection pkg={plugin} />

          {related.length > 0 && (
            <RelatedSection title="Related Plugins">
              {related.map((r) => <PluginCard key={r.id} plugin={r} />)}
            </RelatedSection>
          )}
        </div>

        <aside className="detail-side">
          <SideRail pkg={plugin} />
        </aside>
      </div>

      <div className="forge-container">
        <InstallBand pkg={plugin} />
        <div style={{ height: 48 }} />
      </div>
    </main>
  );
}
