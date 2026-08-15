// forge/src/api/client.ts —— API 客户端基座（页面不得直拼 fetch，统一走本层）。
// Registry 地址：构建时 VITE_REGISTRY_URL 或运行时 ?registry= 查询参数，缺省同源。
const FALLBACK = import.meta.env.VITE_REGISTRY_URL ?? "";

// P1-6：Registry 地址白名单 —— 仅允许 http/https、拒绝含用户信息的 URL（防凭证注入 / 异常 scheme）
function sanitizeRegistry(url: string): string {
  if (!url) return "";
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "";
  if (u.username || u.password) return "";
  return u.toString().replace(/\/$/, "");
}

export function registryBase(): string {
  if (typeof window === "undefined") return sanitizeRegistry(FALLBACK);
  const q = new URLSearchParams(window.location.search).get("registry");
  if (q) return sanitizeRegistry(q);
  return sanitizeRegistry(FALLBACK);
}

export class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super("API " + status + ": " + body.slice(0, 200));
    this.status = status;
    this.body = body;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = registryBase();
  const res = await fetch(base + path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, text);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}
