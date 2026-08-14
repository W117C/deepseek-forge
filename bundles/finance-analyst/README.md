# Finance Analyst

把 DeepSeek Harness 一键变成金融研究与决策支持 Agent。

## 安装

```sh
node ../../cli/agenthub.mjs install . --yes
dsh --profile finance
```

## 组成

- **Bundle** `@agenthub/finance-core`：宿主平面——开启 web 全文抓取、市场数据 MCP seam（默认禁用）、会话级定时任务。
- **Preset** `finance-analyst`：会话平面——金融分析师 persona、全工具面 + web fetch、与官方 standard 预设仅两处差异。
- **Skills**：`financial-analysis`、`company-research`（含多分析师协作流程）。
- **Profile patch 骨架**：数据源启用模板。

## 安全声明

- 不提供下单/交易/转账能力；输出为研究与决策支持，不构成投资建议。
- 网络权限仅声明 `localhost:3111`（默认禁用），可被上层 patch 覆盖。
- 信任等级：official（AgentHub 自维护）。
