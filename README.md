# AgentHub / DeepSeek Forge

DeepSeek Harness Agent Bundle Marketplace —— 把通用 DeepSeek Harness 一键变成专业领域 Agent。

## 线上站点

| 站点 | 地址 | 说明 |
| --- | --- | --- |
| 🛍️ Marketplace | **https://deepseek-forge-marketplace.vercel.app** | 完整交互前端（Agent/Bundle/Plugin/Skill 发现、搜索、安装引导、发布向导），见 [forge/](forge/) |
| 🌐 官网/落地页 | **https://deepseek-forge.vercel.app** | 产品介绍落地页，见 [landing/](landing/) |

两者均：Vercel 托管、Git 集成（推送 main 自动部署）、GitHub Actions 构建门槛（typecheck + 生产构建）。

> 仓库：https://github.com/W117C/deepseek-forge ｜ CI：GitHub Actions（e2e 21 套 344 项 + 前端双构建）｜ 发布：GitHub Releases
>
> 状态：**v0.3.0 REAL MARKETPLACE（21 套 e2e 344/344 全绿）**——mock 依赖清零，Marketplace 前端走真实 Registry API；SQLite 数据层（schema/迁移/事务）+ Package/Version/Artifact 模型 + 统一状态机 + Publisher 模型 + forge/src/api 客户端层全部落地。
> 见 [docs/v0.3-audit.md](docs/v0.3-audit.md)、[docs/v0.3-phase-a.md](docs/v0.3-phase-a.md)、[docs/v0.3-phase-b.md](docs/v0.3-phase-b.md)、[docs/v0.3-phase-c.md](docs/v0.3-phase-c.md)、[docs/v0.3-phase-d.md](docs/v0.3-phase-d.md)、[docs/release-notes-v0.3.0.md](docs/release-notes-v0.3.0.md)。
> 复现：`for t in test/e2e*.mjs; do node $t; done`（隔离 DSH_HOME，不触碰真实 ~/.dsh）。

## 目录结构

- `cli/agenthub.mjs` —— CLI（install/uninstall/rollback/list/health/permissions/security/doctor/registry/publish/keygen/compose），重活委托 `crates/forge-core` Rust 引擎
- `crates/forge-core/` —— Rust 核心引擎（签名/哈希、静态安全扫描、安装器/快照回滚、本地 Registry、组合），跨三平台预构建二进制分发
- `lib/` —— Node 委托桥（forge-core-bin）+ dsh 适配层 / Registry HTTP 服务 / Web UI / manifest 解析
- `bundles/` —— 领域 Agent：`finance-analyst`、`academic-researcher`（manifest + bundle + preset + skills）
- `forge/` —— **Marketplace 前端**（React 18 + TS + Vite，React Router，走真实 Registry API）
- `landing/` —— **产品落地页**（React 18 + TS + Vite）
- `desktop/` —— **Tauri 桌面端**（Rust + 前端；local-first Registry + 组合/配置/运行时管理）
- `test/` —— 21 套隔离 e2e（`test/e2e*.mjs`，344 项）
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
# 本地开发（显式 allow-insecure；生产必须配置鉴权开关，见下）
node cli/agenthub.mjs registry ./.reg --allow-insecure &
node cli/agenthub.mjs keygen                       # 生成发布者 ed25519 密钥
node cli/agenthub.mjs publish ./bundles/finance-analyst --registry http://127.0.0.1:PORT
node cli/agenthub.mjs install finance-analyst --registry http://127.0.0.1:PORT --yes
```

> **安全门禁**：Registry 启动必须至少提供一项安全配置（`--require-publisher-auth` / `--operator-token` / `--artifact-secret`）或显式 `--allow-insecure`，否则拒绝启动。未配置鉴权时，发布/审核/状态管理端点默认拒绝（503）；生产公网部署请三项全配。

远端安装前客户端强制验哈希 + 验 ed25519 签名，任何不匹配即阻断安装（防篡改，见 test/e2e-registry.mjs）。

## Marketplace 前端接通 Registry（v0.3）

- `forge/` 前端已完全切换到真实 Registry API（`forge/src/api/` 13 模块；mock.ts 已删除）。
- Registry 地址配置优先级：构建时 `VITE_REGISTRY_URL` → 访问时 `?registry=https://…` → 同源 `/v1`。
- 发布为真实流程：CLI 本地私钥签名 → Registry 验签/扫描/审核 → 上架后出现在市场。

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
