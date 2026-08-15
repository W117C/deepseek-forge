# DeepSeek Forge 全面审计与优化方案（2026-08-15）

> 审计目标：围绕核心产品目标——**一键安装插件，把通用 Agent 变成专业 Agent**——对项目做全面体检，
> 输出问题清单（含优先级）与分阶段优化方案。
> 审计方式：全量文档对账 + 关键源码逐行核实（Rust 核心 / CLI / Node 桥 / bundles / curated-registry / 桌面端），未臆测。

## 0. 一句话结论

**「一键变专业」的完整能力链路（agent bundle 十步管线：compatibility → 安全扫描 → 快照 → profile → bundles → presets → skills → patch → state → 健康检查 → 自动回滚）在 CLI 侧已真实存在且被 245 项 e2e 背书；但该管线只对 2 个 legacy schema 官方包成立，curated-registry 的 52 个包（全是 `forge.package.v1`，零 agent 类型）走的是单插件/导入路径，装完不会让通用 Agent 变成专业 Agent——核心目标目前只有 2/54 的覆盖面。其次，preset 装完不自动激活、官方包核心数据源默认关闭，导致「一键」之后用户仍要手工操作才真正「变专业」。**

## 1. 项目现状（核实）

### 1.1 两个目录是同一项目的两个版本

| 目录 | 版本 | 状态 |
|---|---|---|
| `agenthub/` | v0.2.0（`cb368c8`，docs: v0.2.0 release notes） | 旧仓库，已冻结，无未提交改动 |
| `deepseek-forge/` | v0.3+（HEAD `3309bbe`，git remote `W117C/deepseek-forge`） | **当前活跃项目**，工作树有大量未提交改动（v0.3.0 + 桌面版全量） |

### 1.2 当前架构

```
desktop/（Tauri 桌面端，local-first）        cli/agenthub.mjs（零依赖 CLI，bin: agenthub）
   │  ipc.ts（类型化 IPC）                        │
   ▼                                             ▼
crates/forge-core/（Rust 核心引擎：installer / security / snapshot / registry / manifest / state / runtime）
   ▲
   │ runForgeCoreJson（Node 委托桥 lib/forge-core-bin.mjs + lib/installer.mjs）
   │
forge/（Web Marketplace，React18 SPA，真实 Registry API）   bundles/（2 官方 Agent 包）
landing/（落地页）                                          curated-registry/（52 个社区包）
test/（18 套 e2e / 245 项）   docs/   .github/workflows/ci.yml
```

### 1.3 一键安装完整链路（已逐行核实）

- **agent bundle 路径（十步管线）**：`cli install <dir>` → `lib/installer.mjs` 桥 → `forge-core install`（`crates/forge-core/src/installer.rs` `install()` L437）：
  1. compatibility（只查 Node 主版本）→ 2. 安全扫描（7 规则字符串级）→ 3. 快照 → 4. profile 初始化 →
  5. bundles（pnpm/dsh plugin 官方路径，`link:`；无 pnpm 时复制兜底）→ 6. presets（拷贝到 `$DSH_HOME/.agent-presets/<id>/`）→
  7. skills（拷贝到 `$DSH_HOME/skills/<name>/`）→ 8. patch 合并（profile.patch.yml 托管段）→ 9. state 写入 → 10. 健康检查；任一步失败自动 `restore_snapshot`。
- **单插件路径**：`catalog-plugin`（`install_catalog_plugin` L806）→ 快照 → `ensure_profile` → `dsh plugin add <source>` → state 写 `kind: plugin`（无 preset/skills/bundles）。
- **桌面端路径**：Marketplace → `InstallDialog` → `installPackage(id)`（IPC）→ Rust；`InstallProgress` 的管线是 `resolving→cloning→scanning→registering→installed`（GitHub 导入/收录式，**非十步管线**）。

## 2. 问题清单（按「一键从通用变专业」目标对账）

| # | 问题 | 严重度 | 证据 |
|---|---|---|---|
| 1 | **两条安装路径分裂，核心目标只对 2 个官方包成立**：十步管线只接受 legacy `agenthub.dev/agent/v1` schema（`manifest.rs load_legacy_agent_dir_strict`）；curated-registry 52 个包全是 `forge.package.v1`（41 plugin / 5 tool / 5 skill / 1 mcp，**零 agent 类型**），走 `catalog-plugin`（单插件）或 registry import（收录式），**装完只是多一个工具，Agent 不会变专业** | P0 | curated-registry 类型分布实测；`install_catalog_plugin` 只写 `kind: plugin` |
| 2 | **preset 装完不自动激活**：`.agent-presets/<id>/` 落盘即结束，CLI 提示「在会话里选择预设 'finance-analyst'」——用户必须手动选一次 preset 才「变专业」 | P0 | cli/agenthub.mjs L218；installer.rs L599-618 |
| 3 | **官方包核心能力默认关闭**：finance/research 的 `profile.patch.yml` 是空 `[]`（仅注释）；MCP 数据源 seam `disabled: true`（finance-core/cordis.patch.yml L16-23）——「一键」装完 health PASS 但市场数据/论文检索能力并未启用 | P0 | bundles/*/profile.patch.yml；bundle/*/cordis.patch.yml |
| 4 | **健康检查不校验「专业能力是否真可用」**：`expect-rows` 只查 dump-config 配置行存在（含 disabled 行），不验证 preset 已挂载、skill 被发现、MCP server 可连 | P1 | installer.rs L672-676 `run_health` |
| 5 | **兼容性检查过弱**：`check_compatibility` 只解析 Node 主版本（`>=22` 的 `22`），`compatibility.platform: [darwin, linux]`、`dsh.min/tested` 完全未检查——Windows 上也会装 darwin/linux 包 | P1 | installer.rs L713-733 |
| 6 | **桌面端「安装」与 CLI agent 安装是两套**：桌面 `InstallProgress` 管线为 `resolving→cloning→scanning→registering→installed`（GitHub 导入/收录式），缺快照/回滚/健康检查等十步安全网；bundle（recipe）安装靠 `forceDone` 报告完成，无 `installed` 事件 | P1 | desktop/src/components/InstallProgress.tsx PHASE_ORDER |
| 7 | state.json 非原子写（Rust `fs::write` 直接覆盖目标文件）、无锁；桌面多进程下有损坏风险 | P2 | crates/forge-core/src/state.rs `save_state` |
| 8 | 工作树大量未提交（v0.3.0 + 桌面版全量在本地）、CLI bin 仍叫 `agenthub`（产品名 forge）、CI 标题仍写「14 套 / 203 项」（实际 18 套 / 245 项）、`agenthub/` 旧目录造成困惑 | P2 | git status；audit v0.3 §8；current-state.md §4 |

### 2.1 文档与实现不一致（次要）

- `docs/architecture/current-state.md` 基线为 `cb368c8` + v0.3 未提交工作树（当时的 16 modified / 19 untracked），现已大幅演进（Rust 核心、desktop、curated-registry、GitHub 导入管线均已实现），该文档的「Stub / 必须重构」章节已过时。
- `docs/v0.3-audit.md` 结论（forge 前端 mock、无 Rust/Tauri）已被 v0.3.0 全量推翻；README 已更新但 audit 文档未标注「历史审计」。
- CLI `search` 命令已实现（cli L269），current-state.md §5 仍写「CLI 无 search 命令」。
- CLI 直连 fetch 的 10 处已收敛为 lib/registry-client.mjs + 桥（current-state.md §6 部分过时）。

## 3. 优化方案（P0 → P2）

### P0-A 统一「一键变专业」路径

1. curated-registry 支持 `type: agent`（manifest 含 preset/skills/profile 组件，schema `forge.package.v1` 扩展），注册表 import 与前端筛选支持 agent 类型。
2. 桌面端与 CLI 对 **agent 类型包统一走十步管线**（复用 `InstallRequest`/`install()`），catalog-plugin 仅保留给单插件。
3. 「插件 → 专业 Agent 化」包装器：为单插件自动生成 profile + preset 包装（复用 `lib/scaffold.mjs` compose 合并内核），用户装插件时可选择「仅装工具」或「生成专业 Agent 预设」。

### P0-B 装后即专业

1. preset 自动激活：安装时把 preset 写入 profile 默认（而非仅落盘 `.agent-presets/`），使 `dsh --profile finance` 直接以 Finance Agent 身份启动，无需手工选择。
2. 官方包核心数据源默认可用：安装时交互选择 provider（Tushare/AkShare/自建 MCP）并写入 profile.patch.yml，替代「默认 disabled + 用户手工编辑」。

### P1-C 健康检查与兼容性升级

1. `run_health` 增加：preset 挂载验证（`ctx.agentPresets list` 或 dump-config 中 agent-plane 行）、skill 目录存在、MCP server 连接冒烟（非 disabled）。
2. `check_compatibility` 补 platform（Windows 拒绝 darwin/linux 包）与 `dsh.min/tested` 版本矩阵；错误码 `INCOMPATIBLE_VERSION` 保留并扩展。

### P2-D 工程收尾（本批已实施）

1. 写本文档（问题清单 + 方案落盘）。
2. state.json 原子写（临时文件 + rename）。
3. CLI bin 别名 `forge`（保留 `agenthub` 兼容）。
4. 文档同步（CI 标题、README 状态、audit 标注历史）。
5. 评估 `agenthub/` 旧目录（清理或标注说明）。
6. 提交未提交工作树 + 本文档。

## 4. 建议执行顺序

1. **P2-D**（低风险，先收尾工程债，本批完成）
2. **P1-C**（Rust installer 内改动，e2e 回归覆盖）
3. **P0-B**（installer + 两个官方 bundle，改完即时见效）
4. **P0-A**（跨模块最大项：manifest schema + registry + 前端 + 桌面 IPC，需拆 phase）

## 5. 验证基线

- e2e：`for t in test/e2e*.mjs; do node "$t"; done`（18 套 / 245 项，隔离 DSH_HOME）。
- Rust：`cd crates/forge-core && cargo check`。
- 前端：`cd forge && npm run build`（typecheck + vite）。
