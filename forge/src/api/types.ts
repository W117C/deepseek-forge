// forge/src/api/types.ts —— 与 Registry /v1 端点对应的 API 类型（服务端权威模型）。
export interface ApiScan {
  score: number | null;
  verdict: "pass" | "warn" | "block" | null;
  high: number;
  medium: number;
  low: number;
  files: number;
  findings?: { rule: string; level: string; label: string; count: number; file: string }[];
}

export interface ApiPublisherProfile {
  name: string;
  slug?: string;
  website?: string;
  github?: string;
  avatar?: string;
  description?: string;
  verified?: boolean;
}

export interface ApiVersion {
  version: string;
  sha256: string;
  signature: string;
  manifest: Record<string, unknown>;
  publishedAt: string | null;
  scan: ApiScan;
  artifactUrl: string;
  installs?: number;
}

export interface ApiPackage {
  id: string;
  slug: string;
  name: string;
  type: "agent" | "bundle" | "plugin" | "skill";
  description: string;
  publisher: string;
  publisherProfile: ApiPublisherProfile | null;
  category: string;
  tags: string[];
  status: "draft" | "submitted" | "scanning" | "review" | "published" | "deprecated" | "yanked" | "blocked";
  trust: string;
  score: number | null;
  installs: number;
  ratings: { average: number | null; count: number };
  latest: string | null;
  versions: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ApiSearchHit {
  kind: "agent" | "plugin";
  id: string;
  name: string;
  source?: string;
  trust: string;
  score: number | null;
  description: string;
}
