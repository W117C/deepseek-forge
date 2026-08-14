# AgentHub / DeepSeek Forge

DeepSeek Harness Agent Bundle Marketplace —— 把通用 DeepSeek Harness 一键变成专业领域 Agent。

## 线上站点

| 站点 | 地址 | 说明 |
| --- | --- | --- |
| 🛍️ Marketplace | **https://deepseek-forge-marketplace.vercel.app** | 完整交互前端（Agent/Bundle/Plugin/Skill 发现、搜索、安装引导、发布向导），见 [forge/](forge/) |
| 🌐 官网/落地页 | **https://deepseek-forge.vercel.app** | 产品介绍落地页，见 [landing/](landing/) |

两者均：Vercel 托管、Git 集成（推送 main 自动部署）、GitHub Actions 构建门槛（typecheck + 生产构建）。

> 仓库：https://github.com/W117C/deepseek-forge ｜ CI：GitHub Actions（e2e 203 项 + 前端双构建）｜ 发布：GitHub Releases（[v0.1.0](https://github.com/W117C/deepseek-forge/releases/tag/v0.1.0)）
>
> 状态：**M1–M4 验证通过（203/203）**——14 套 e2e：本地闭环 27 + 共存 20 + Registry/安全 25 + pnpm 路径 9 + 生命周期 21 + Web 24 + 开发者 14 + 鉴权 14 + 交互 5 + 组合 13 + 备份恢复 7 + 服务端组合 11 + 组合发布 9 + **模型层冒烟 4**。
> 复现：`for t in test/e2e*.mjs; do node $t; done`（隔离 DSH_HOME，不触碰真实 ~/.dsh）。

## 目录结构

- `cli/agenthub.mjs` —— 零依赖 CLI（install/uninstall/rollback/list/health/permissions/security/doctor/registry/publish/keygen/compose）
- `lib/` —— dsh 适配层 / 安装器 / 安全扫描 / 健康检查 / manifest 解析 / Registry / Web UI
- `bundles/` —— 领域 Agent：`finance-analyst`、`academic-researcher`（manifest + bundle + preset + skills）
- `forge/` —— **Marketplace 前端**（React 18 + TS + Vite，React Router，无后端原型）
- `landing/` —— **产品落地页**（React 18 + TS + Vite）
- `test/` —— 14 套隔离 e2e（`test/e2e*.mjs`）
- `docs/` —— 设计/验证/部署文档（含 [npm 发布 runbook](docs/npm-publish-runbook.md)）

## 快速开始（本地闭环）

```sh
node cli/agenthub.mjs install ./bundles/finance-analyst --yes
dsh --profile finance            # 现在它是一个 Finance Agent
```

## 多 Agent（选职业领域）

```sh
node cli/agenthub.mjs install ./bundles/finance-analyst --yes
node cli/agenthub.mjs install ./bundles/academic-researcher --yes
dsh --profile finance     # Finance Agent
dsh --profile research    # Academic Researcher
```

## Registry（安全分发）

```sh
node cli/agenthub.mjs registry ./.reg &           # 启动本地注册中心
node cli/agenthub.mjs keygen                       # 生成发布者 ed25519 密钥
node cli/agenthub.mjs publish ./bundles/finance-analyst --registry http://127.0.0.1:PORT
node cli/agenthub.mjs install finance-analyst --registry http://127.0.0.1:PORT --yes
```

远端安装前客户端强制验哈希 + 验 ed25519 签名，任何不匹配即阻断安装（防篡改，见 test/e2e-registry.mjs）。

## 前端开发

```sh
# Marketplace（forge/）
cd forge && npm install && npm run dev      # http://localhost:5173

# 落地页（landing/）
cd landing && npm install && npm run dev    # http://localhost:5173（端口冲突时另开）
```

## 部署与发布

- **部署**：两个 Vercel 项目（Git 集成，推送 main 自动上线）；配置见各目录 `vercel.json`。生产 Registry 拓扑见 [docs/deployment.md](docs/deployment.md)。
- **CI**：`.github/workflows/ci.yml` —— e2e 全量门槛 + landing/forge 构建/类型检查。
- **发布**：打 tag → GitHub Releases（源码 tarball 自动附带）；CLI 上 npm 见 [docs/npm-publish-runbook.md](docs/npm-publish-runbook.md)。

## 设计原则

1. 不 fork、不 patch DSH：一切经由官方机制（profile/bundle/preset/skills/patch 层）。
2. 服务器零执行：第三方代码只在本机 DSH 运行时中执行。
3. 每次修改先快照：安装失败或 `rollback` 可恢复原状，用户自有配置永不删除。
4. 安全前置：安装前静态扫描（`!!js`/shell/网络/密钥模式），高危阻断、低危提示。
5. 分发可信：Registry 验签（ed25519）+ 验哈希（sha256）后才允许安装；服务端零执行第三方代码。
