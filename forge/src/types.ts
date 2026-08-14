/* ============================================================
   DeepSeek Forge — Data Model
   ============================================================ */

export type PackageType = "agent" | "bundle" | "plugin" | "skill";
export type TrustLevel = "verified" | "scanned" | "community" | "unverified";

export interface Author {
  slug: string;
  name: string;
  handle: string;
  verified: boolean;
  packages: number;
  bio?: string;
}

export interface SecurityReport {
  level: TrustLevel;
  scanned: boolean;
  network: "none" | "limited" | "full";
  filesystem: "none" | "read" | "read-write";
  shell: "none" | "restricted" | "full";
  processes: "none" | "limited" | "full";
  secrets: "none" | "optional" | "required";
  dependencies: number;
  lastScanned: string;
}

export interface VersionInfo {
  version: string;
  date: string;
  compatibility: string;
  notes: string[];
  latest?: boolean;
}

export interface Review {
  author: string;
  authorHandle: string;
  rating: number;
  date: string;
  title: string;
  body: string;
}

export interface PackageMeta {
  id: string;
  slug: string;
  name: string;
  description: string;
  type: PackageType;
  version: string;
  authorId: string;
  category: string;
  tags: string[];
  downloads: number;
  rating: number;
  reviewsCount: number;
  verified: boolean;
  security: SecurityReport;
  compatibility: string;
  createdAt: string;
  updatedAt: string;
  growth: number; // weekly install growth, percent
  longDescription: string[];
  versions?: VersionInfo[]; // v0.3：真实 Registry 版本列表（映射层填充）
  publisherProfile?: { name?: string; slug?: string; verified?: boolean } | null;
}

export interface Agent extends PackageMeta {
  type: "agent";
  bundleId: string;
  profile: string;
  capabilities: string[];
  examplePrompts: string[];
  workflow: string[];
  components: {
    workflows: string[];
    skills: string[];
    plugins: string[];
  };
  reviews: Review[];
}

export interface Bundle extends PackageMeta {
  type: "bundle";
  counts: { skills: number; plugins: number; workflows: number; profiles: number };
  contents: {
    skills: string[];
    plugins: string[];
    workflows: string[];
    profile: string;
  };
  agents: string[];
}

export interface Plugin extends PackageMeta {
  type: "plugin";
  config: { key: string; kind: "string" | "number" | "boolean"; defaultValue: string; description: string }[];
  usedBy: string[];
}

export interface Skill extends PackageMeta {
  type: "skill";
  domain: string;
  inputs: string[];
  process: string[];
  outputs: string[];
  examplePrompts: string[];
  usedBy: string[];
}

export type AnyPackage = Agent | Bundle | Plugin | Skill;

export interface Category {
  slug: string;
  name: string;
  description: string;
  count: number;
  icon: string;
}

export type SortKey = "trending" | "popular" | "newest" | "top-rated" | "updated";

export interface Filters {
  types: PackageType[];
  categories: string[];
  trust: TrustLevel[];
  compat: string[];
  sort: SortKey;
}
