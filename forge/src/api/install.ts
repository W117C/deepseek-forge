import { api } from "./client";

// 匿名安装上报（eventId 幂等，Registry 24h 去重）。
export function reportInstallation(id: string, version: string, eventId: string): Promise<{ id: string; installs: number; duplicate?: boolean }> {
  return api("/v1/installations", {
    method: "POST",
    body: JSON.stringify({ id, version, eventId }),
  });
}
