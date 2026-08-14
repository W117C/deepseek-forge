import { api } from "./client";
import type { ApiVersion } from "./types";

export function listVersions(slug: string): Promise<ApiVersion[]> {
  return api<ApiVersion[]>("/v1/packages/" + encodeURIComponent(slug) + "/versions");
}

export function artifactUrl(slug: string, version: string): string {
  // 签名 URL 由 Registry 在 versions 响应中给出；此处仅给出兜底相对路径
  return "/v1/packages/" + encodeURIComponent(slug) + "/" + encodeURIComponent(version) + "/artifact";
}
