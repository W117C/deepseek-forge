import type { Category, PackageType, SortKey } from "../types";

export const popularSearches = ["Finance", "Quant", "Research", "Coding", "Web Intelligence"];

export const cliCommands = [
  { cmd: "node cli/agenthub.mjs install finance-analyst --registry <URL> --yes", hint: "一键安装领域 Agent" },
  { cmd: "dsh --profile finance", hint: "启动 Finance Agent" },
  { cmd: "node cli/agenthub.mjs keygen", hint: "生成发布者密钥" },
  { cmd: "node cli/agenthub.mjs publish ./your-agent --registry <URL>", hint: "发布你的 Agent" },
];

export const workflowCatalog = ["company-research", "earnings-analysis", "portfolio-review", "literature-review", "paper-analysis"];

export const sortOptions: { key: SortKey; label: string }[] = [
  { key: "trending", label: "Trending" },
  { key: "popular", label: "Most installed" },
  { key: "top-rated", label: "Top rated" },
  { key: "newest", label: "Newest" },
  { key: "updated", label: "Recently updated" },
];

export const typeLabels: Record<PackageType, string> = {
  agent: "Agent",
  bundle: "Bundle",
  plugin: "Plugin",
  skill: "Skill",
};

// 领域分类（静态展示；实际包分类来自 Registry 数据 category 字段）
export const categories: Category[] = [
  { slug: "finance", name: "Finance", description: "市场数据、研究与组合分析", count: 0, icon: "chart" },
  { slug: "research", name: "Research", description: "文献、论文与知识工作", count: 0, icon: "book" },
  { slug: "coding", name: "Coding", description: "工程与开发工作流", count: 0, icon: "code" },
  { slug: "intelligence", name: "Intelligence", description: "联网情报与调研", count: 0, icon: "radar" },
];
