# DeepSeek Forge Desktop — Migration Plan（增量迁移计划）

> 原则：**Existing Code → Reuse → Normalize → Integrate → Test → Productize**。用最少的代码变更把现有 Forge 演进为 Desktop-first；绝不一次性删除旧架构再重建（§36）；不重写已有能力（§35）。
> 配套：`current-state.md`（现状）→ 本计划（路径）→ `target-state.md`（目标）。
> 执行模式（用户指定）：**Pro 规划 → Flash 实现 → Review/Fix 循环**；每一轮只做一个 Phase；每 Phase 一个独立 commit（§42），commit 前必须全量测试通过。

---

## 0. 迁移总策略（为什么这样走）

1. **先模型后壳**：Phase 1 先立 Rust Core 的 Package 模型/Manifest/Registry/errors/events —— 它们只读、不碰现有行为、风险最低，同时定下全系统唯一的数据语言。
2. **parity 桥接，不双轨**：现有 Node 实现（installer/security/signing/registry-client）在 Rust 实现通过 parity 测试后，**模块 API 保持不变、内部改为委托 forge-core**。既有的 18 套 e2e 直接导入这些模块 —— 委托后断言一行不改仍全绿；工作树里永远只有一套真实逻辑（Rust），满足 §39“禁止两套 Installer”。
3. **UI 复用不重写**：desktop/ 直接复用 forge 组件与 tokens（路径别名），只剥离浏览器耦合（localStorage/matchMedia/伪安装）。
4. **服务器退役但不删**：registry-server + SQLite 保留为兼容后端（旧 e2e 与过渡期使用）；Desktop 生产路径 = Local Registry 目录，不依赖任何常驻服务。
5. **每阶段 Gate 相同**（见 §9）：cargo test / 18 套 e2e 全绿 / 前端构建 / secrets+生产 mock 扫描 / 独立 commit。

## 1. 阶段总览

| Phase | 目标 | 关键产出 | Commit 建议 |
| --- | --- | --- | --- |
| 0 | 审计三文档（本阶段已完成） | docs/architecture/{current-state,target-state,migration-plan}.md | `docs(architecture): current state, target state, migration plan` |
| 1 | Forge Core：Package 模型 + Manifest + Registry 读取 + errors/events | crates/forge-core/ + schemas/forge-package.schema.json | `feat(core): unify package model` |
| 2 | Tauri 壳 + Rust IPC + 基础导航 | desktop/（src-tauri + React 壳，复用 forge 组件） | `feat(desktop): add tauri shell` |
| 3 | Package Management：install/uninstall/update/rollback/inspect 全走 Core | installer/security/signing Rust parity + Node 模块委托化 | `feat(installer): rust install engine with node parity bridge` |
| 4 | GitHub Import：URL→分析（license/依赖/入口/能力/安全） | core::import + Import UI | `feat(import): add github repository analyzer` |
| 5 | Adapter Generator：AI 提案→人工确认→生成→validate→test | core::adapter + adapters/ 布局 | `feat(adapter): ai adapter generator with human gate` |
| 6 | Composer：Agent/Skill/Bundle Builder + 依赖图 + 冲突检测 | core::composer + Composer UI | `feat(composer): add agent composer` |
| 7 | Runtime：Harness 集成（session/process/logs/tool calls） | core::runtime + Runtime UI | `feat(runtime): integrate harness` |
| 8 | Polish：更新系统/安全 UI/设置/快捷键/错误空态/onboarding | 全量收尾 | `feat(ui): polish + onboarding` |

## 2. Phase 0（本阶段 — 完成）

产出三文档（本文件 + current-state.md + target-state.md）。**不修改任何生产代码。** 待办：用户确认计划后，建议先把 v0.3 未提交工作树独立成 commit（`release: v0.3.0` + tag），再开始 Phase 1（避免混提交）。

## 3. Phase 1 — Forge Core（模型先行）

**为什么**：全系统统一 Package 语言是后续所有阶段的地基；只读新增，零破坏风险。
**修改哪些文件**（只新增）：

```
crates/forge-core/Cargo.toml            # serde/serde_json/serde_yaml/sha2/ed25519-dalek/thiserror/semver
crates/forge-core/src/lib.rs            # 模块导出
crates/forge-core/src/model.rs          # Package 12 字段 + 7 类型枚举（§5 target-state）
crates/forge-core/src/manifest.rs       # forge.package.v1 解析/校验 + agenthub.dev/agent/v1 归一化
crates/forge-core/src/registry.rs       # trait RegistryProvider + LocalRegistry（目录）+ GitRegistry（仓库目录）
crates/forge-core/src/errors.rs         # typed error：code/human/technical/recovery（§21 target-state）
crates/forge-core/src/events.rs         # 事件枚举 + 内存总线（§20 target-state）
crates/forge-core/src/bin/forge-core.rs # 子命令：registry list/info、package validate/inspect（只读）
crates/forge-core/tests/*.rs            # manifest 解析、legacy 归一化（用 bundles/ 两个官方包做夹具）、registry 读取
schemas/forge-package.schema.json       # 权威 JSON Schema
.github/workflows/ci.yml                # + cargo test job（rust stable toolchain）
```

**风险**：低（纯新增）。**影响**：无（不碰 Node/cli/forge）。**验收**：cargo test 通过；18 套 e2e 保持全绿（未动）；legacy 归一化测试证明两个官方包可无损转换。

## 4. Phase 2 — Desktop Shell

**为什么**：壳先行验证 IPC/打包链路，避免后面带病铺页面。
**修改哪些文件**：

```
desktop/                                # Tauri 2 脚手架（npm create tauri-app 风格，接入现有 UI）
desktop/src-tauri/Cargo.toml            # 依赖 crates/forge-core（workspace 成员）
desktop/src-tauri/src/main.rs, lib.rs   # 注册 typed IPC command（registry.list/packages 只读面 + events 桥）
desktop/src-tauri/tauri.conf.json       # 最小 capability：只开 core 所需（§48 原则，逐项说明 Why/Scope/Risk）
desktop/src/                            # React：sidebar/navigation/theme/Dashboard 空态页
desktop/vite.config.ts                  # 路径别名复用 forge/src 组件与 tokens.css
```

**风险**：中（打包/平台差异，macOS 优先）。**影响**：无（新增目录）。**验收**：`cargo build` + `npm run build` 通过；桌面窗口可启动、侧栏可导航、IPC 只读命令可返回 Local Registry 数据；18 套 e2e 不受影响。

## 5. Phase 3 — Package Management（最大的一步，parity 切换）

**为什么**：让“安装”真正走 Rust Core，且满足“Desktop 与 CLI 只有一套 Installer”。
**修改哪些文件**：

```
crates/forge-core/src/installer.rs      # Resolve→Download→Verify→Signature→Security→Dependency→Snapshot→Install→Health→Activate
crates/forge-core/src/security.rs       # 现有 7 规则 + §11 扩展面（命令/secret/license 检测）
crates/forge-core/src/signing.rs        # sha256 + ed25519（与 lib/signing.mjs 语义逐字节对齐）
crates/forge-core/src/snapshot.rs       # 快照/恢复（对齐 lib/installer.mjs 的 snapshot/restoreSnapshot 布局）
lib/installer.mjs                       # API 不变，内部改为 spawn forge-core（parity 桥）
lib/signing.mjs / lib/security.mjs      # 同上：模块签名不变，委托 Rust
lib/registry-client.mjs                 # fetchAgent 语义迁移进 Core（HTTP 后端过渡期保留旧路径开关）
cli/agenthub.mjs                        # install/update/rollback/uninstall/security 命令改为经 Core（输出格式不变）
desktop/                                # My Packages 页：Install/Uninstall/Update/Rollback/Inspect（走 IPC）
lib/webui.mjs                           # SSR 市场退役（删除页面路由，API 路由保留）
```

**parity 桥细节**：切换分三步——① Rust 实现 + 专用 parity 测试（同一输入，新旧实现结果逐项对比：快照内容/落盘文件/state.json/健康结论）；② parity 全绿后把 Node 模块换成委托（e2e 不改一行仍绿，因为它只断言行为）；③ 观察一个阶段后删除 Node 旧实现（git 历史保留）。**禁止**：Rust 与 Node 长期并存作为两条活跃路径。
**风险**：高（DSH 集成细节：profile/preset/skills/patch 合并、pnpm/dsh plugin 路径、node_modules 解引用快照必须逐项对齐）。**影响**：install/update/rollback 行为不变（契约）。**验收**：18 套 e2e 全绿 + 新增 cargo parity 测试 + 桌面 Install UI 跑通真实安装（含失败回滚）。

## 6. Phase 4 — GitHub Import

**为什么**：产品差异化核心（Discover→Analyze→Adapter）。
**修改哪些文件**：

```
crates/forge-core/src/import.rs         # URL 解析→元数据→语言→包管理器→入口→README/LICENSE→依赖→可执行文件
                                        # →安装脚本→网络/文件系统/env/secret→危险命令→MCP/Agent/Skill/Tool 探测→类型判定
crates/forge-core/src/import/analyze.rs # Repository Analysis 输出（§8 形态：Language/License/EntryPoint/Type/Capabilities/Dependencies/Security/ForgeCompatibility）
desktop/src/pages/Import.tsx            # 粘贴 URL → 逐项 ✓ → Package Proposal{Type/Risk/Capabilities} → [Create Adapter]
cli/agenthub.mjs                        # + import 子命令（分析输出 JSON）
```

License 检测：SPDX 关键词 + LICENSE 文件识别 + package.json license 字段；**无许可证 → LICENSE_MISSING 阻断导入**（§39-9）。**风险**：中（检测误报 → 结果分级 + 人工确认制）。**验收**：fixture 仓库（file:// 本地 git）自动化测试全链路；GitHub 限流通过本地缓存 + 按需请求缓解。

## 7. Phase 5 — Adapter Generator（AI + 人工门禁）

**修改哪些文件**：

```
crates/forge-core/src/adapter.rs        # adapter 布局（manifest/install/configure/healthcheck/uninstall/runtime）
crates/forge-core/src/adapter/gen.rs    # AI 提案接口（模型供应商可插拔；默认无 key 时提供规则型生成器，不伪造 AI）
desktop/src/pages/Adapter.tsx           # 提案审阅：diff 式展示 → 人工确认 → 生成 → validate → test
cli/agenthub.mjs                        # + adapter 子命令
```

**红线**：AI 只生成 manifest/adapter/wrapper/config/install 说明/健康检查/能力声明文本；**任何高风险代码执行都必须 Analyze→Propose→Validate→User Approve→Execute**。无 API Key 环境用规则型生成器并明示“非 AI 生成”，禁止 fake AI。

## 8. Phase 6 — Composer

**修改哪些文件**：

```
crates/forge-core/src/composer.rs       # 组合语义（复用现有 compose 合并核心）+ 依赖图解析 + 冲突检测（§20）
desktop/src/pages/Composer.tsx          # 左 Available（Skills/Tools/Plugins/MCP/Workflows）右 Composition；Add/Remove/Configure/Reorder/Enable/Disable
cli/agenthub.mjs                        # compose 命令改经 Core（行为不变）
```

**验收**：冲突用例（版本重叠/循环依赖）提前报错；组合产物走完整 Install→Health 链路。

## 9. Phase 7 — Runtime（复用 Harness，不重写 Runtime）

**修改哪些文件**：

```
crates/forge-core/src/runtime.rs        # session/process/logs/health/status/stop/restart；进程表记录 PID/启动时间/package/session
desktop/src/pages/Runtime*.tsx          # Sessions/Processes/Logs + Runtime UI（§29：Agent ● Running/Task/Model/Context/Tools/Processes/Duration + Logs/Events/Tool Calls）
cli/agenthub.mjs                        # + run / logs 子命令
```

Model/Context 等展示字段以真实来源为准（dsh 版本、会话文件、进程信息），拿不到就空态，**禁止 fake runtime 冒充已连接**（§39-14）。

## 10. Phase 8 — Polish

更新系统（check/update/update-all 走 Core）、Security Center（真实 scan/findings/严重度）、Sources 管理页（Local/Git registry + Doctor）、Settings（只放有 backend 支撑的项）、键盘快捷键、Loading/Error/Empty 三态全覆盖、Onboarding（首次启动：dsh 检测→registry 初始化→示例导入）。

## 11. 每阶段统一 Gate（commit 前必须全过）

```
1. cargo test（Phase 1 起）            —— 全部通过
2. for t in test/e2e*.mjs; do node "$t" || exit 1; done   —— 18 套 245 项全绿（只增不减）
3. cd forge && npm run build；cd desktop && npm run build（Phase 2 起）
4. secrets 扫描（grep 密钥/令牌模式）+ 生产 mock 扫描（mock|fixture|fake 零命中）
5. git diff 人工审阅 → 独立 commit（§42 命名）；不提交 secrets/local config/cache/user data/node_modules/target
```

## 12. 决策点（实施到对应阶段时需拍板）

| # | 决策 | 建议 | 时点 |
| --- | --- | --- | --- |
| D1 | CLI 的 forge-core 二进制分发（npm 包 vs GitHub Release 下载器） | Phase 3 前定：CI 构建三平台二进制，npm optionalDependencies + 回退提示 | Phase 3 |
| D2 | 旧状态迁移（~/.dsh/.agenthub → ~/.deepseek-forge）复制还是软链 | 复制 + 保留旧文件，state 单向升级 | Phase 3 |
| D3 | AI Adapter 的模型供应商接口（DSH 内置 / 用户自带 key / 规则型） | 可插拔 trait，默认规则型且明示 | Phase 5 |
| D4 | license 检测库（自研关键词 vs 现成 crate） | 自研关键词 + SPDX 表（零依赖，够用） | Phase 4 |
| D5 | desktop UI 组件来源（forge 路径别名 vs 抽 packages/ui） | 先用路径别名，组件数超阈值再抽 | Phase 2 |

## 13. 风险与回退

| 风险 | 回退 |
| --- | --- |
| Phase 3 Rust parity 不达（DSH 集成细节） | parity 测试先全绿才切；未切前 Node 仍是唯一活跃路径（合法过渡态，不是双轨）；失败即暂停切换，Node 版本继续可用 |
| 桌面打包平台问题 | macOS 优先；Windows/Linux 排期后移，不影响 CLI/核心 |
| GitHub 限流/不可用 | 本地缓存 + fixture 测试；Import 属按需操作非后台依赖 |
| 阶段间回归 | 每阶段 Gate 全量 e2e；commit 可独立 revert |
