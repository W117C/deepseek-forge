# Academic Researcher

把 DeepSeek Harness 一键变成学术研究 Agent。

## 安装

```sh
node ../../cli/agenthub.mjs install . --yes
dsh --profile research
```

## 组成

- **Bundle** `@agenthub/research-core`：宿主平面——web 全文抓取、论文数据 MCP seam（默认禁用）、会话级定时任务。
- **Preset** `academic-researcher`：学术研究员 persona + 全工具面 + web fetch。
- **Skills**：`literature-review`、`paper-analysis`。

## 安全声明

- 不虚构引用：硬性规则写入 persona 与 skills。
- 网络权限仅声明 `localhost:3112`（默认禁用）。
- 信任等级：official（AgentHub 自维护）。
