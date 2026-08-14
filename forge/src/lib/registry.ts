import type { AnyPackage, Filters, PackageType, SortKey, TrustLevel, VersionInfo } from "../types";
import { authors, packages } from "../data/mock";

/* ============================================================
   Formatting helpers
   ============================================================ */
export function formatDownloads(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

export function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function authorOf(pkg: AnyPackage) {
  return authors[pkg.authorId] ?? { slug: pkg.authorId, name: pkg.authorId, handle: pkg.authorId, verified: false, packages: 1 };
}

export function trustLabel(level: TrustLevel): string {
  switch (level) {
    case "verified": return "Verified";
    case "scanned": return "Security Scanned";
    case "community": return "Community";
    case "unverified": return "Unverified";
  }
}

export function routeFor(pkg: AnyPackage): string {
  const base = pkg.type === "agent" ? "agents" : pkg.type === "bundle" ? "bundles" : pkg.type === "plugin" ? "plugins" : "skills";
  return "/" + base + "/" + pkg.slug;
}

export function typeLabel(t: PackageType): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/* ============================================================
   Search
   ============================================================ */
export function searchPackages(query: string, pool: AnyPackage[] = packages): AnyPackage[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/);
  const scored: { pkg: AnyPackage; score: number }[] = [];

  for (const pkg of pool) {
    let score = 0;
    const name = pkg.name.toLowerCase();
    const desc = pkg.description.toLowerCase();
    const cat = pkg.category.toLowerCase();
    const author = authorOf(pkg).name.toLowerCase();

    for (const t of terms) {
      if (name === t) score += 50;
      else if (name.startsWith(t)) score += 30;
      else if (name.includes(t)) score += 20;
      if (desc.includes(t)) score += 8;
      if (pkg.tags.some((tag) => tag.toLowerCase().includes(t))) score += 12;
      if (cat.includes(t)) score += 6;
      if (author.includes(t)) score += 3;
    }
    if (score > 0) scored.push({ pkg, score });
  }

  return scored.sort((a, b) => b.score - a.score || b.pkg.downloads - a.pkg.downloads).map((s) => s.pkg);
}

export function highlightMatches(text: string, query: string): { pre: string; match: string; post: string }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [{ pre: text, match: "", post: "" }];
  const terms = q.split(/\s+/).filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp("\\b(" + terms.join("|") + ")", "gi");
  const parts: { pre: string; match: string; post: string }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    parts.push({ pre: text.slice(last, m.index), match: m[0], post: "" });
    last = m.index + m[0].length;
    if (m.index === regex.lastIndex) regex.lastIndex += 1;
  }
  if (parts.length === 0) return [{ pre: text, match: "", post: "" }];
  parts[parts.length - 1] = { ...parts[parts.length - 1], post: text.slice(last) };
  return parts;
}

/* ============================================================
   Filter & sort
   ============================================================ */
export function applyFilters(pool: AnyPackage[], f: Filters): AnyPackage[] {
  const out = pool.filter((pkg) => {
    if (f.types.length > 0 && !f.types.includes(pkg.type)) return false;
    if (f.categories.length > 0 && !f.categories.map((c) => c.toLowerCase()).includes(pkg.category.toLowerCase())) return false;
    if (f.trust.length > 0 && !f.trust.includes(pkg.security.level)) return false;
    return true;
  });
  return sortPackages(out, f.sort);
}

export function sortPackages(pool: AnyPackage[], sort: SortKey): AnyPackage[] {
  const arr = [...pool];
  switch (sort) {
    case "trending":
      return arr.sort((a, b) => b.growth * Math.log10(b.downloads + 10) - a.growth * Math.log10(a.downloads + 10));
    case "popular":
      return arr.sort((a, b) => b.downloads - a.downloads);
    case "newest":
      return arr.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
    case "top-rated":
      return arr.sort((a, b) => b.rating - a.rating || b.reviewsCount - a.reviewsCount);
    case "updated":
      return arr.sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
  }
}

/** Deterministic version history derived from a package's current version. */
export function makeVersions(pkg: AnyPackage, count = 4): VersionInfo[] {
  const m = pkg.version.match(/^(\d+)\.(\d+)\.(\d+)/);
  let [ma, mi, pa] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [1, 0, 0];
  const start = new Date(pkg.updatedAt + "T00:00:00");
  const out: VersionInfo[] = [];

  for (let i = 0; i < count; i++) {
    const version = ma + "." + mi + "." + pa;
    const date = new Date(start.getTime() - i * 28 * 86400000);
    const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    out.push({
      version,
      date: dateStr,
      compatibility: pkg.compatibility,
      latest: i === 0,
      notes: i === 0
        ? ["Current release.", "Compatibility with " + pkg.compatibility + ".", pkg.tags[0] ? "Improvements to " + pkg.tags[0].toLowerCase() + "." : "", "Security scan refreshed."].filter(Boolean)
        : ["Performance and stability fixes.", "Dependency updates.", "Documentation refresh."],
    });
    if (pa > 0) pa -= 1;
    else if (mi > 0) { mi -= 1; pa = 0; }
    else { ma = Math.max(0, ma - 1); mi = 9; pa = 0; }
  }
  return out;
}

export function relatedPackages(pkg: AnyPackage, pool: AnyPackage[] = packages, n = 3, type?: PackageType): AnyPackage[] {
  const matches = pool
    .filter((p) => p.id !== pkg.id && (!type || p.type === type) && (p.category === pkg.category || p.tags.some((t) => pkg.tags.includes(t))))
    .sort((a, b) => b.downloads - a.downloads)
    .slice(0, n);
  if (matches.length >= n || !type) return matches;
  // Fill up with other popular packages of the same type.
  const fill = pool
    .filter((p) => p.id !== pkg.id && p.type === type && !matches.some((m) => m.id === p.id))
    .sort((a, b) => b.downloads - a.downloads)
    .slice(0, n - matches.length);
  return [...matches, ...fill];
}
