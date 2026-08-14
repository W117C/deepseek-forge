# AgentHub v0.1.0

DeepSeek Harness Agent Bundle Marketplace — M1-M4 验证通过（203/203 e2e）。

## 交付物

- **零依赖 CLI**（`cli/agenthub.mjs`）：install / uninstall / rollback / list / health / permissions / security / doctor / registry / publish / keygen / compose
- **两款领域 Agent**：
  - `finance-analyst` — 金融研究与决策支持（财务分析、公司研究技能）
  - `academic-researcher` — 学术研究（文献综述、论文分析技能）
- **Registry 服务**（`lib/registry-server.mjs`）：发布鉴权 + 运营鉴权 + 服务端扫描 + 审核队列 + 制品限速
- **Web UI**（`lib/webui.mjs`）：Marketplace / 详情 / 评分 / Agent Builder 组合页
- **安全链**：安装前静态扫描；远端安装强制 sha256 验哈希 + ed25519 验签；每次修改先快照、失败可回滚
- **CI**：GitHub Actions 全量 14 套 e2e 门槛（Node 22 + dsh@0.1.0-rc.6 + pnpm）
- **Vercel 只读展示页**：`web/`（manifest 快照驱动，与 Registry 数据源同步）

## 快速开始

```sh
git clone https://github.com/W117C/deepseek-forge
cd agenthub
node cli/agenthub.mjs install ./bundles/finance-analyst --yes
dsh --profile finance
```

## 兼容性

- DeepSeek Harness `@deepseek-ai/dsh@0.1.0-rc.6`（基线；适配层集中升级）
- Node `>=22`，pnpm（Profile 依赖安装）
- 平台：macOS / Linux

## 已知边界

- 公测部署需先上 HTTPS（签名体系在明文 HTTP 下无意义），见 `docs/deployment.md`
- 制品签名 URL（防盗链）、备份演练、真实 DEEPSEEK_API_KEY 全链路冒烟 —— 上线前待办
