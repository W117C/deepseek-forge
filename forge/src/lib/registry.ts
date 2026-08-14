import type { AnyPackage, Author, Filters, PackageType, SortKey, TrustLevel, VersionInfo, Agent, Bundle, Plugin, Skill } from "../types";
import type { ApiPackage, ApiScan } from "../api/types";

/* ============================================================
   Display helpers（纯函数，运行在 API 映射后的展示模型上）
   ============================================================ */

export function formatDownloads(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function authorOf(pkg: AnyPackage): Author {
  const profile = (pkg as { publisherProfile?: { name?: string; slug?: string; verified?: boolean } }).publisherProfile;
  const id = pkg.authorId;
  return {
    slug: profile?.slug ?? id,
    name: profile?.name ?? id,
    handle: profile?.slug ?? id,
    verified: profile?.verified ?? false,
    packages: 1,
  };
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
   API → 展示模型映射（服务端权威数据）
   ============================================================ */

function mapTrust(trust: string): TrustLevel {
  if (trust === "official" || trust === "verified") return "verified";
  if (trust === "community") return "community";
  if (trust === "blocked") return "unverified";
  return "scanned";
}

function mapSecurity(scan: ApiScan | null, manifest: Record<string, unknown>, trust: string): AnyPackage["security"] {
  const perms = (manifest.permissions ?? {}) as { network?: string[]; env?: string[] };
  return {
    level: mapTrust(trust),
    scanned: !!scan,
    network: (perms.network?.length ?? 0) > 0 ? "limited" : "none",
    filesystem: "none",
    shell: "none",
    processes: "none",
    secrets: (perms.env?.length ?? 0) > 0 ? "optional" : "none",
    dependencies: ((manifest.components as { bundles?: unknown[] })?.bundles?.length ?? 0),
    lastScanned: "",
  };
}

function versionsView(pkg: ApiPackage): VersionInfo[] {
  return pkg.versions.map((v, i) => ({
    version: v,
    date: pkg.updatedAt ?? pkg.createdAt ?? "",
    compatibility: "DSH >= 0.1.0-rc.6",
    notes: [],
    latest: i === 0,
  }));
}

function baseMeta(pkg: ApiPackage): {
  id: string; slug: string; name: string; description: string; version: string; authorId: string;
  category: string; tags: string[]; downloads: number; rating: number; reviewsCount: number;
  verified: boolean; security: AnyPackage["security"]; compatibility: string; createdAt: string; updatedAt: string;
  growth: number; longDescription: string[]; publisherProfile: ApiPackage["publisherProfile"];
} {
  return {
    id: pkg.id, slug: pkg.slug, name: pkg.name, description: pkg.description,
    version: pkg.latest ?? "", authorId: pkg.publisher,
    category: pkg.category, tags: pkg.tags, downloads: pkg.installs,
    rating: pkg.ratings.average ?? 0, reviewsCount: pkg.ratings.count,
    verified: pkg.publisherProfile?.verified ?? false,
    security: mapSecurity(null, {}, pkg.trust),
    compatibility: "DSH >= 0.1.0-rc.6",
    createdAt: pkg.createdAt ?? "", updatedAt: pkg.updatedAt ?? "",
    growth: 0, longDescription: [pkg.description], publisherProfile: pkg.publisherProfile,
  };
}

export function mapApiPackage(pkg: ApiPackage): AnyPackage {
  const m = baseMeta(pkg);
  const manifest = (pkg as unknown as { manifest?: Record<string, unknown> }).manifest ?? {};
  const components = (manifest.components ?? {}) as { bundles?: { package: string }[]; skills?: string[] };
  if (pkg.type === "agent") {
    const a: Agent = {
      ...m, type: "agent",
      bundleId: components.bundles?.[0]?.package ?? "",
      profile: ((manifest.profile as { name?: string })?.name) ?? pkg.slug,
      capabilities: components.skills ?? [],
      examplePrompts: [], workflow: [],
      components: { workflows: [], skills: components.skills ?? [], plugins: (components.bundles ?? []).map((b) => b.package) },
      reviews: [], versions: versionsView(pkg),
    };
    return a;
  }
  if (pkg.type === "bundle") {
    const b: Bundle = {
      ...m, type: "bundle",
      counts: { skills: 0, plugins: 0, workflows: 0, profiles: 1 },
      contents: { skills: [], plugins: [], workflows: [], profile: "" },
      agents: [], versions: versionsView(pkg),
    };
    return b;
  }
  if (pkg.type === "plugin") {
    const p: Plugin = { ...m, type: "plugin", config: [], usedBy: [], versions: versionsView(pkg) };
    return p;
  }
  const s: Skill = { ...m, type: "skill", domain: pkg.category, inputs: [], process: [], outputs: [], examplePrompts: [], usedBy: [], versions: versionsView(pkg) };
  return s;
}

/* ============================================================
   Search / Filter / Sort（纯函数，输入为展示模型）
   ============================================================ */

export function searchPackages(query: string, pool: AnyPackage[]): AnyPackage[] {
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

/** 真实版本历史：来自 Registry 的 versions（映射层填充）；无数据时退回当前版本。 */
export function makeVersions(pkg: AnyPackage, count = 4): VersionInfo[] {
  if (pkg.versions && pkg.versions.length > 0) return pkg.versions.slice(0, count);
  return [{
    version: pkg.version || "0.1.0",
    date: pkg.updatedAt || pkg.createdAt || "",
    compatibility: pkg.compatibility,
    latest: true,
    notes: ["Current release."],
  }];
}

export function relatedPackages(pkg: AnyPackage, pool: AnyPackage[], n = 3, type?: PackageType): AnyPackage[] {
  const matches = pool
    .filter((p) => p.id !== pkg.id && (!type || p.type === type) && (p.category === pkg.category || p.tags.some((t) => pkg.tags.includes(t))))
    .sort((a, b) => b.downloads - a.downloads)
    .slice(0, n);
  if (matches.length >= n || !type) return matches;
  const fill = pool
    .filter((p) => p.id !== pkg.id && p.type === type && !matches.some((m) => m.id === p.id))
    .sort((a, b) => b.downloads - a.downloads)
    .slice(0, n - matches.length);
  return [...matches, ...fill];
}

export function applyFilters(pool: AnyPackage[], f: Filters): AnyPackage[] {
  const out = pool.filter((pkg) => {
    if (f.types.length > 0 && !f.types.includes(pkg.type)) return false;
    if (f.categories.length > 0 && !f.categories.map((c) => c.toLowerCase()).includes(pkg.category.toLowerCase())) return false;
    if (f.trust.length > 0 && !f.trust.includes(pkg.security.level)) return false;
    if (f.compat.length > 0 && !f.compat.some((c) => pkg.compatibility.includes(c))) return false;
    return true;
  });
  return sortPackages(out, f.sort);
}

export function sortPackages(pool: AnyPackage[], sort: SortKey): AnyPackage[] {
  const arr = [...pool];
  switch (sort) {
    case "popular": arr.sort((a, b) => b.downloads - a.downloads); break;
    case "top-rated": arr.sort((a, b) => b.rating - a.rating || b.reviewsCount - a.reviewsCount); break;
    case "newest": arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); break;
    case "updated": arr.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); break;
    default: arr.sort((a, b) => b.downloads + b.rating * 20 - (a.downloads + a.rating * 20)); break;
  }
  return arr;
}
