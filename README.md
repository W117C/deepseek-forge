# AgentHub (M1)

DeepSeek Harness Agent Bundle Marketplace — 本地安装闭环原型。

> 线上展示（只读 Marketplace）：**https://agenthub-w117-c.vercel.app** —— Vercel 自动部署（Git 集成，推送 main 即上线；数据来自仓库内 manifest 快照，见 [web/](web/)）。
> 仓库：https://github.com/W117C/deepseek-agenthub ｜ CI：GitHub Actions 全量 e2e 门槛 ｜ 发布：GitHub Releases（v0.1.0）
>
> 状态：**M1–M4 验证通过（203/203）**——14 套 e2e：本地闭环 27 + 共存 20 + Registry/安全 25 + pnpm 路径 9 + 生命周期 21 + Web 24 + 开发者 14 + 鉴权 14 + 交互 5 + 组合 13 + 备份恢复 7 + 服务端组合 11 + 组合发布 9 + **模型层冒烟 4**。
> 见 [docs/m1-verification.md](docs/m1-verification.md)、[docs/m2-verification.md](docs/m2-verification.md)、[docs/m3-verification.md](docs/m3-verification.md)、[docs/registry-production.md](docs/registry-production.md)、[docs/deployment.md](docs/deployment.md)、[docs/agent-builder-design.md](docs/agent-builder-design.md)。
> 复现：`for t in test/e2e*.mjs; do node $t; done`（隔离 DSH_HOME，不触碰真实 ~/.dsh）。

把通用 DSH 一键变成专业领域 Agent：

```sh
node cli/agenthub.mjs install ./bundles/finance-analyst --yes
dsh --profile finance            # 现在它是一个 Finance Agent
```

## 目录

- `cli/agenthub.mjs` —— 零依赖 CLI（install/uninstall/rollback/list/health/permissions/security/doctor）
- `lib/` —— dsh 适配层 / 安装器 / 安全扫描 / 健康检查 / manifest 解析
- `bundles/finance-analyst/` —— 第一款 Agent：manifest + finance-core bundle + finance-analyst preset + skills
- `docs/dsh-integration.md` —— DSH 集成机制（源码级核实记录）
- `test/e2e.sh` —— 隔离 DSH_HOME 端到端验证

## 多 Agent（选职业领域）

```sh
node cli/agenthub.mjs install ./bundles/finance-analyst --yes
node cli/agenthub.mjs install ./bundles/academic-researcher --yes
dsh --profile finance     # Finance Agent
dsh --profile research    # Academic Researcher
```

## Registry（M2，安全分发）

```sh
node cli/agenthub.mjs registry ./.reg &           # 启动本地注册中心
node cli/agenthub.mjs keygen                       # 生成发布者 ed25519 密钥
node cli/agenthub.mjs publish ./bundles/finance-analyst --registry http://127.0.0.1:PORT
node cli/agenthub.mjs install finance-analyst --registry http://127.0.0.1:PORT --yes
```

远端安装前客户端强制验哈希 + 验 ed25519 签名，任何不匹配即阻断安装（防篡改，见 test/e2e-registry.mjs）。

## 设计原则

1. 不 fork、不 patch DSH：一切经由官方机制（profile/bundle/preset/skills/patch 层）。
2. 服务器零执行：第三方代码只在本机 DSH 运行时中执行。
3. 每次修改先快照：安装失败或 `rollback` 可恢复原状，用户自有配置永不删除。
4. 安全前置：安装前静态扫描（`!!js`/shell/网络/密钥模式），高危阻断、低危提示。
5. 分发可信：Registry 验签（ed25519）+ 验哈希（sha256）后才允许安装；服务端零执行第三方代码。
