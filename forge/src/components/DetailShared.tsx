import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, Check, Download, FolderGit2, Package, ShieldCheck, Star, Terminal } from "lucide-react";
import type { AnyPackage, VersionInfo } from "../types";
import { authorOf, formatDate, formatDownloads, makeVersions, routeFor } from "../lib/registry";
import { useApp } from "../context/app";
import { TrustBadge } from "./badges";
import { Stars } from "./PackageStats";
import { InstallButton } from "./InstallButton";
import { copyText } from "../lib/hooks";
import type { Review } from "../types";

/* ============================================================
   Breadcrumb
   ============================================================ */
export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="forge-container crumb" aria-label="Breadcrumb">
      <Link to="/">Marketplace</Link>
      {items.map((it) => (
        <span key={it.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span className="sep">/</span>
          {it.to ? <Link to={it.to}>{it.label}</Link> : <span aria-current="page">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/* ============================================================
   Sticky section tabs with scroll-spy
   ============================================================ */
export function useScrollSpy(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? "");
  const key = ids.join("|");
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: "-140px 0px -55% 0px" }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return active;
}

export function DetailTabs({ tabs }: { tabs: { id: string; label: string }[] }) {
  const active = useScrollSpy(tabs.map((t) => t.id));
  return (
    <div className="detail-nav" role="tablist" aria-label="Page sections">
      <div className="forge-container">
        <div className="tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={active === t.id}
              className={"tab" + (active === t.id ? " active" : "")}
              onClick={() => document.getElementById(t.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Sections
   ============================================================ */
export function SectionBlock({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="detail-section" id={id} aria-labelledby={id + "-title"}>
      <h2 id={id + "-title"}>{title}</h2>
      {subtitle && <p className="sub" style={{ marginBottom: 16 }}>{subtitle}</p>}
      {children}
    </section>
  );
}

export function SecuritySection({ pkg }: { pkg: AnyPackage }) {
  const s = pkg.security;
  return (
    <SectionBlock id="security" title="Security" subtitle="Trust information from the community security scan.">
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <TrustBadge security={s} />
        {s.scanned && <span className="badge badge-scanned"><ShieldCheck /> Scan date {s.lastScanned}</span>}
      </div>
      <div className="perm-grid" style={{ maxWidth: 560 }}>
        <div className="perm-cell"><span className="k">Network</span><span className={"perm-value " + s.network}>{cap(s.network)}</span></div>
        <div className="perm-cell"><span className="k">Filesystem</span><span className={"perm-value " + s.filesystem}>{cap(s.filesystem)}</span></div>
        <div className="perm-cell"><span className="k">Shell</span><span className={"perm-value " + s.shell}>{cap(s.shell)}</span></div>
        <div className="perm-cell"><span className="k">Processes</span><span className={"perm-value " + s.processes}>{cap(s.processes)}</span></div>
        <div className="perm-cell"><span className="k">Secrets</span><span className={"perm-value " + s.secrets}>{cap(s.secrets)}</span></div>
        <div className="perm-cell"><span className="k">Dependencies</span><span className="perm-value">{s.dependencies} packages</span></div>
      </div>
      <div className="security-note">
        Scans are performed by the community scanner on every publish and are advisory only.
        Forge never claims absolute safety — review permissions before installing.
      </div>
    </SectionBlock>
  );
}

export function PermissionsSection({ pkg }: { pkg: AnyPackage }) {
  const s = pkg.security;
  return (
    <SectionBlock id="permissions" title="Permissions" subtitle="What this package is allowed to do.">
      <div className="perm-grid" style={{ maxWidth: 560 }}>
        <div className="perm-cell"><span className="k">Network</span><span className={"perm-value " + s.network}>{cap(s.network)}</span></div>
        <div className="perm-cell"><span className="k">Filesystem</span><span className={"perm-value " + s.filesystem}>{cap(s.filesystem)}</span></div>
        <div className="perm-cell"><span className="k">Shell</span><span className={"perm-value " + s.shell}>{cap(s.shell)}</span></div>
        <div className="perm-cell"><span className="k">Processes</span><span className={"perm-value " + s.processes}>{cap(s.processes)}</span></div>
        <div className="perm-cell"><span className="k">Secrets</span><span className={"perm-value " + s.secrets}>{cap(s.secrets)}</span></div>
        <div className="perm-cell"><span className="k">Dependencies</span><span className="perm-value">{s.dependencies} packages</span></div>
      </div>
      <div className="security-note">
        Permissions are enforced by DeepSeek Harness at runtime. They cannot be silently expanded by the package.
      </div>
    </SectionBlock>
  );
}

export function VersionsSection({ pkg }: { pkg: AnyPackage }) {
  const versions: VersionInfo[] = makeVersions(pkg);
  return (
    <SectionBlock id="versions" title="Versions" subtitle="Release history and compatibility.">
      {versions.map((v) => (
        <div key={v.version} className={"version-item" + (v.latest ? " latest" : "")}>
          <div className="version-head">
            <span className="vnum">v{v.version}</span>
            {v.latest && <span className="badge badge-verified"><Check /> Latest</span>}
            <span className="vdate">{v.date}</span>
          </div>
          <ul className="version-notes">
            {v.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
          <div className="version-compat">Compatibility: {v.compatibility}</div>
        </div>
      ))}
    </SectionBlock>
  );
}

export function ReviewsSection({ pkg, reviews }: { pkg: AnyPackage; reviews: Review[] }) {
  return (
    <SectionBlock id="reviews" title="Reviews" subtitle={pkg.reviewsCount + " community reviews."}>
      <div className="rating-summary">
        <div>
          <div className="rating-big">{pkg.rating.toFixed(1)}</div>
        </div>
        <div className="rating-detail">
          <Stars rating={pkg.rating} size={15} />
          <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
            {pkg.reviewsCount} ratings · {formatDownloads(pkg.downloads)} installs
          </div>
        </div>
      </div>
      {reviews.length === 0 && (
        <p className="sub">No written reviews yet. Be the first to review this package.</p>
      )}
      {reviews.map((r, i) => (
        <article className="review" key={i}>
          <div className="review-head">
            <Stars rating={r.rating} />
            <span className="review-author">{r.author}</span>
            <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>@{r.authorHandle}</span>
            <span className="review-date">{r.date}</span>
          </div>
          <div className="review-title">{r.title}</div>
          <p className="review-body">{r.body}</p>
        </article>
      ))}
    </SectionBlock>
  );
}

/* ============================================================
   Side rail
   ============================================================ */
export function SideRail({ pkg }: { pkg: AnyPackage }) {
  const author = authorOf(pkg);
  const { isInstalled } = useApp();
  const installed = isInstalled(pkg.id);
  return (
    <div>
      <div className="side-card">
        <h4>Install</h4>
        <InstallButton pkg={pkg} block size="md" />
        {installed && (
          <p className="mono" style={{ fontSize: 10.5, color: "var(--success)", marginTop: 10 }}>
            ✓ Installed — run it in DeepSeek Harness
          </p>
        )}
        <code className="mono" style={{ display: "block", marginTop: 10, fontSize: 11, color: "var(--foreground-2)" }}>
          $ forge install {pkg.slug}
        </code>
      </div>

      <div className="side-card">
        <h4>Package</h4>
        <div className="side-row"><span className="k"><Package size={13} /> Type</span><span className="v">{pkg.type.toUpperCase()}</span></div>
        <div className="side-row"><span className="k"><Calendar size={13} /> Updated</span><span className="v">{formatDate(pkg.updatedAt)}</span></div>
        <div className="side-row"><span className="k"><Star size={13} /> Rating</span><span className="v">{pkg.rating.toFixed(1)} / 5</span></div>
        <div className="side-row"><span className="k"><Download size={13} /> Installs</span><span className="v">{formatDownloads(pkg.downloads)}</span></div>
        <div className="side-row"><span className="k">Author</span><span className="v">{author.handle}</span></div>
        <div className="side-row"><span className="k">License</span><span className="v">MIT</span></div>
        <div className="side-row"><span className="k"><FolderGit2 size={13} /> Repository</span><span className="v" style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 130 }}>{pkg.slug}</span></div>
      </div>

      <div className="side-card">
        <h4>Compatibility</h4>
        <div className="side-row"><span className="k"><Terminal size={13} /> DeepSeek Harness</span></div>
        <code className="mono" style={{ fontSize: 11.5, color: "var(--foreground)" }}>{pkg.compatibility}</code>
      </div>
    </div>
  );
}

/* ============================================================
   Bottom install band
   ============================================================ */
export function InstallBand({ pkg }: { pkg: AnyPackage }) {
  return (
    <section className="install-band" aria-label="Install call to action">
      <h2>Ready to install {pkg.name}?</h2>
      <p>{pkg.compatibility} · Security-scanned dependencies · installs in seconds.</p>
      <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
        <InstallButton pkg={pkg} size="lg" />
        <CopyCmdButton slug={pkg.slug} />
      </div>
    </section>
  );
}

export function CopyCmdButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn btn-outline btn-lg"
      onClick={async () => {
        const ok = await copyText("forge install " + slug);
        if (ok) { setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
      }}
    >
      {copied ? <><Check size={15} /> Copied</> : <>forge install {slug}</>}
    </button>
  );
}

/* ============================================================
   Related packages
   ============================================================ */
export function RelatedSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="detail-section" id="related" aria-labelledby="related-title">
      <h2 id="related-title">{title}</h2>
      <div className="grid-cards" style={{ marginTop: 16 }}>
        {children}
      </div>
    </section>
  );
}

export function cap(s: string): string {
  return s === "none" ? "None"
    : s === "limited" ? "Limited"
    : s === "full" ? "Full"
    : s === "read" ? "Read"
    : s === "read-write" ? "Read-write"
    : s === "restricted" ? "Restricted"
    : s === "optional" ? "Optional"
    : s === "required" ? "Required"
    : s;
}

/* Keep refs used by external pages */
export { routeFor };
