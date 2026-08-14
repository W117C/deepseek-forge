import { api } from "./client";

export interface RegisterPublisherInput {
  publisher: string;
  publicKey: string;
  name?: string;
  slug?: string;
  website?: string;
  github?: string;
  avatar?: string;
  description?: string;
}

export interface RegisterPublisherResult {
  publisher: string;
  name: string;
  token: string | null; // 首次注册返回一次；已注册返回 null（保留既有令牌）
}

// 注册发布者：浏览器只上传公钥（私钥永远留在开发者本机 CLI）。
export function registerPublisher(input: RegisterPublisherInput): Promise<RegisterPublisherResult> {
  return api<RegisterPublisherResult>("/v1/publishers/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// 发布本身必须由 CLI 完成（本地私钥签名）。返回可直接复制执行的命令序列。
export function publishCommands(publisher: string, registryUrl: string, token: string | null): string[] {
  const base = registryUrl.replace(/\/$/, "");
  return [
    "node cli/agenthub.mjs keygen",
    "node cli/agenthub.mjs publisher-register " + publisher + " --registry " + base,
    ...(token ? [] : []),
    "node cli/agenthub.mjs publish ./your-agent --registry " + base + (token ? " --token <上方返回的令牌>" : ""),
  ];
}
