import { listVersions } from "./versions";
import type { ApiScan } from "./types";

// 安全信息以最新版本的服务端扫描为准（扫描在 Registry publish 时对制品实体执行）。
export async function getSecurity(slug: string): Promise<ApiScan | null> {
  const versions = await listVersions(slug);
  if (versions.length === 0) return null;
  return versions[0].scan ?? null;
}
