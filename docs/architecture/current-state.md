# DeepSeek Forge — Repository Audit: Current State

> 依据新规范（Desktop-first / Local-first / Open Source First）§2 执行。**只读审计，未修改任何生产代码。**
> 基线：git HEAD `cb368c8`（docs: v0.2.0 release notes）+ 未提交的 v0.3.0 工作树（16 modified / 1 deleted / 19 untracked）；远程 `https://github.com/W117C/deepseek-forge.git`。
> 审计证据（本会话实测，见 §12）：全量 e2e 18 套 / 245 项 exit 0；`cd forge && npm run build` exit 0；`W117C/deepseek-forge-registry` 不存在（GitHub API 404）。
> 结论先行：当前仓库是「Node ESM 零依赖核心 + 单文件 CLI + React Web 市场」的 Web/CLI 形态；**没有 Rust、没有 Tauri、没有 Package 七类型模型、没有 GitHub 导入管线、没有 Runtime**。新规范要求的 Forge Kernel（Rust）与 Import 管线为全新工作面；Installer/Security/Snapshot/Rollback/签名哈希/健康检查是现成且被 245 项 e2e 背书的资产，可作为 Rust Kernel 的行为契约与过渡期执行体。

---

## 1. 当前架构

```
                        DeepSeek Forge（W117C/deepseek-forge）
   ┌──────────────┬──────────────┬──────────────────────┬───────────────────┐
   ▼              ▼              ▼                      ▼                   ▼
forge/        landing/      cli/agenthub.mjs        lib/（Node ESM 零依赖） bundles/
Web 市场      落地页          (bin: agenthub/forge)    dsh.mjs installer.mjs  官方包×2
React18 SPA   React18 静态    20 命令                 signing.mjs security.mjs （finance-analyst、
(Vercel)      (Vercel)       │10 处直连 fetch         registry-server.mjs    academic-researcher）
   │                          │                       registry-client.mjs    test-fixtures/mock-llm
   │HTTP /v1/*                ▼                       db/sqlite.mjs semver.mjs
   │               ┌────────────────────┐             health.mjs state.mjs
   └──────────────▶│ Registry Server     │◀─────────── webui.mjs scaffold.mjs
                   │ node:http + SQLite  │             yamllite.mjs manifest.mjs
                   │ + artifacts/*.tgz   │
                   └────────────────────┘
                              │
                              ▼
                    DeepSeek Harness（profile/bundle/preset/skills）
```

| 组件 | 文件 | 行数 | 角色 |
| --- | --- | --- | --- |
| CLI | `cli/agenthub.mjs` | 502 | 唯一入口，20 命令（doctor/install/update/info/ingest/uninstall/rollback/list/health/permissions/security/keygen/publish/registry/publisher-register/review/rate/compose/create/compose-server） |
| DSH 适配层 | `lib/dsh.mjs` | 119 | 唯一接触 dsh 的薄层（locate/run/initProfile/路径） |
| 安装器 | `lib/installer.mjs` | 353 | 十步管线 + 快照/自动回滚 |
| 安全扫描 | `lib/security.mjs` | 65 | 7 条字符串规则 → score/verdict |
| 签名/哈希 | `lib/signing.mjs` | 31 | ed25519 + sha256 + canonical payload |
| Registry 服务 | `lib/registry-server.mjs` | 460 | node:http：发布/审核/制品/搜索/评分/安装计数 |
| 数据层 | `lib/db/sqlite.mjs` + `checkpoint.mjs` | 253 | `node:sqlite`：schema v1 十表、WAL、事务、旧 JSON 迁移 |
| 其它 lib | semver(49)/health(55)/state(15)/manifest(23)/yamllite(82)/scaffold(243)/webui(80)/registry-client(60) | — | 版本/健康/状态/清单/脚手架/SSR 市场 |
| Web 市场 | `forge/src/` | ~4.7k | React18+TS+Vite SPA，唯一 fetch 点 `api/client.ts` |
| 测试 | `test/e2e*.mjs` × 18 | ~1.7k | 零依赖隔离 e2e |
| CI | `.github/workflows/ci.yml` | — | e2e 全量 + landing/forge 构建 |

## 2. 已实现功能（完全实现、有 e2e 背书）

| 功能 | 实现 | 测试 |
| --- | --- | --- |
| 安装十步管线 | 兼容→安全扫描→快照→profile→bundles(pnpm/dsh plugin 优先，复制兜底)→presets→skills→patch 合并→state→健康检查 | e2e 27 |
| 快照/回滚 | `$DSH_HOME/.agenthub/snapshots/<id>/<ts>/`；失败自动 restore + 手动 rollback/uninstall | e2e 27 / multi 20 |
| 签名+哈希 | ed25519 生成/签名/验签；sha256；payload=JSON(manifest)+'
'+sha256 | e2e-registry 25 |
| 静态安全扫描 | 7 规则（!!js/shell/eval/外网 URL/文件写/硬编码密钥/env）→ score/verdict(pass/warn/block) + trust 门禁 | 多套 |
| 信任与阻断 | 服务端 assignTrust（不信任自报）；blocked/yanked 客户端阻断；HMAC 签名 URL + 下载限速 | e2e-auth 14 |
| Registry 服务 | /v1/* 全量路由（发布/审核队列/制品/搜索/目录/评分/安装计数/状态机/令牌轮换）+ SQLite 十表 WAL + audit_logs | registry/lifecycle/web/auth/phase-* |
| 发布管线 | keygen→publisher-register→tar→sha256→签名→publish（base64 内联）→验签/哈希/SemVer→扫描→官方直发或审核 | compose-publish 9 |
| SemVer | 校验/比较/排序/latest | phase-b 11 |
| 多 Agent 共存 / 组合 / 脚手架 / 备份恢复 | 多 profile；compose（本地+服务端）；create；backup/restore 脚本 | multi/compose/compose-server/dev/backup |
| Web 市场（真实数据） | forge/ 全 API 驱动，生产 mock 依赖为零（grep 证据 §12） | forge-api 10 / web 24 |
| 官方包 | finance-analyst、academic-researcher（manifest+bundle+preset+skills） | e2e 27 |

## 3. 部分实现功能

| 功能 | 现状 | 缺口（对新规范） |
| --- | --- | --- |
| Package 模型 | SQLite packages/package_versions/artifacts 三表 + /v1/packages 端点；但实际流转只有 agent/plugin | 规范 §5 的 7 类型（Agent/Skill/Tool/MCP/Plugin/Workflow/Bundle）中 Tool/MCP/Workflow 无模型；bundle/skill 无真实包记录 |
| Security | 字符串级扫描（非 AST/沙箱）；无 license 检测 | 规范 Principle 5 要求 license 检测/依赖分析/能力检测/危险命令/网络与文件系统访问/secret 检测/安装脚本检查 —— 当前仅覆盖约 3/7 |
| Compatibility | manifest.compatibility 声明 dsh min/tested + node + platform；安装端只检查 node 主版本 | 无 OS/arch/forge version 校验矩阵；无 INCOMPATIBLE_VERSION 错误码 |
| 来源/上游归属 | 完全没有 upstream url / license / author / adapter version 字段 | 规范 Principle 4（Never Pretend to Own Upstream Code）需要全新建模 |
| Import 管线 | 无 GitHub 发现/导入/分析/适配流程（CLI `ingest` 只收录社区插件目录元数据） | 规范核心链路 Discover→Import→Analyze→Adapter→Package 全新 |
| Runtime | `lib/health.mjs` 仅 dump-config + boot 冒烟 | 无进程/会话/日志管理；无 start/stop/restart/status |
| Registry | 单进程自建 HTTP + SQLite | 无 Local Registry（目录式）；无 GitHub 来源；依赖自建服务器（Local-first 下应改为本地目录/缓存） |
| Trust | official/verified/community/blocked 四档流转；前端 mapTrust 映射 | 规范五档 UNVERIFIED/SCANNED/VERIFIED/OFFICIAL/BLOCKED 未统一 |
| Composer | compose（本地目录/服务端解包合并） | 无 Agent/Skill/Tool/MCP 级组合 UI；服务端组合依赖服务器 |
| Marketplace 安全面板 | trust 徽章真实；scan 未接通（显示层 scanned:false 恒真）；兼容性硬编码 `DSH >= 0.1.0-rc.6`；License 硬编码 MIT | 必须改为只显示真实数据，缺失即 Empty State |
| 安装动作（Web） | forge “Install” 是伪安装（localStorage 标记 + 匿名上报） | 桌面版必须接真实 InstallService（经 Rust Kernel IPC） |

## 4. Stub

- **Desktop/Rust 完全空白**：无 `Cargo.toml`、无 `src-tauri`、无任何 .rs 文件（grep 证据 §12）—— Forge Kernel 为 greenfield。
- `docs/agent-builder-design.md` 是设计稿：Agent Builder 仅有服务端组合雏形，无图形化实现。
- `docs/deployment.md` 的 Caddy 公网拓扑未落地（Registry 未公网部署）。
- CI 任务标题仍写“14 套 / 203 项”（实际 18/245）。
- `forge/src/pages/NotFound.tsx`、`components/states.tsx`（Skeleton/Error/Empty 组件）已存在可直接复用。

## 5. TODO（代码内明确的未完成项）

- `docs/deployment.md`：“CLI registry 命令需加对应 flag 透传（requirePublisherAuth/operatorToken）——待补”。
- `docs/registry-production.md` 清单未勾选：备份演练、真实 DEEPSEEK_API_KEY 冒烟、客户端身份去重、TLS 与域名。
- `forge/src/lib/registry.ts`：安全面板 scan 未接通、License 硬编码、兼容性硬编码、版本日期用包级 updatedAt 近似、tags 恒空。
- `lib/state.mjs` 状态记录无安装来源 `{registry, package, version}`（影响 doctor/update/rollback）。
- `lib/security.mjs` 自述：“字符串模式级扫描，不是 AST/沙箱级分析；完整版在 M2+ 发布流水线中实现”——完整版仍未实现。
- CLI 无 `search` 命令；无 `registry list/add/remove/default/doctor` 管理命令。

## 6. 技术债

| 债务 | 说明 | 影响 |
| --- | --- | --- |
| CLI 直连传输 | 10 处 `fetch(base + '/v1/...')` 在 CLI 内，绕过统一客户端层 | 换后端/加 Provider 时改动面大 |
| 三份重复业务逻辑 | rankScore（server+webui）、搜索（/v1/search vs 前端 searchPackages）、trust 映射（server assignTrust vs 前端 mapTrust）、版本解析（server sortVersions vs 前端 versions[0]） | 行为漂移风险 |
| 双市场 UI | forge/（SPA）与 webui.mjs（SSR，内嵌 server）并存 | 维护成本；Web 不再是核心后需退役 |
| 发布内联 base64 | /v1/publish 用 artifactBase64 内联 JSON | 大制品不可行；未来走本地/Release 资产 |
| 同步阻塞 | `runDsh`/tar/pnpm 为 spawnSync（install 最长 300s） | 桌面 UI 会卡死；Rust Kernel 中应为异步任务 |
| 系统依赖 | 安装/发布依赖系统 `tar` 与 pnpm | Windows 跨平台风险 |
| node:sqlite experimental | Node 22 内置 SQLite 实验特性（已固定封装在 db/sqlite.mjs） | 仅影响 Local/兼容后端 |
| 无统一错误码 | 全部 ad-hoc 字符串（'registry: 404 ...'） | 桌面 IPC 需要类型化错误 |
| 无单元测试分层 | 只有 e2e（.mjs 直跑），无单元/集成/IPC 测试 | 新模块测试体系需建立 |
| DSH 预发布耦合 | dsh 0.1.0-rc.6 无兼容承诺 | 已由 lib/dsh.mjs 适配层隔离，延续 |
| 未提交工作树 | v0.3.0 全部改动在本地未 commit | 需先落 commit/tag 再开始新轨道 |

## 7. 可以直接复用的代码

| 资产 | 复用方式（对新目标） |
| --- | --- |
| `lib/installer.mjs`（十步管线+快照+回滚） | **Rust Kernel 的行为契约**：移植 InstallService 时逐步骤对齐；过渡期继续作为 Node 执行体 |
| `lib/signing.mjs` / `lib/security.mjs` | 验签/哈希/扫描规则的规格来源（canonical payload、7 规则权重、verdict 语义） |
| `lib/semver.mjs` / `lib/manifest.mjs` / `lib/yamllite.mjs` | 版本与清单解析语义 |
| `lib/dsh.mjs` | Harness 适配层（Rust Kernel 调用 dsh 的 CLI 面与此对齐） |
| 18 套 e2e / 245 项 | **新旧实现的共同验收基线**；Rust Kernel 达到 parity 的判断标准 |
| `forge/` UI 资产 | 组件库/tokens.css/globals.css（暗色开发者风格）/DetailShared/states.tsx/CommandPalette/路由结构 —— 桌面 React UI 直接复用 |
| `bundles/` 两个官方包 | 首批 Forge-native Package 样本（manifest 结构已含 compatibility/permissions/health） |
| `lib/scaffold.mjs` | Adapter/模板生成的起点 |
| `lib/registry-server.mjs` + db/ | 过渡期与 Local 开发兼容后端；其 /v1/* 语义可作未来 IPC/本地协议的参考 |

## 8. 必须重构的代码

1. **传输层**：CLI 10 处直连 fetch + registry-client 收敛为统一服务层（Node 过渡期先做，Rust Kernel 时期由 Kernel 接管）。
2. **Forge Kernel（最大项）**：新规范要求 filesystem/process/package manager/registry/security/signature/hashing/installation/rollback/runtime/IPC/event 都在 **Rust Core**。现有全部核心是 Node —— 需按“行为契约（§7）+ e2e 共同验收”方式增量移植，期间 Node 实现保持可用。
3. **Package Model**：按规范 §5 重建（identity/metadata/type/version/source/artifact/dependencies/capabilities/compatibility/security/entrypoint/runtime；7 种 type；upstream 归属字段），SQLite 三表与 /v1/packages 是雏形，需扩展而非重写。
4. **Security 面扩展**：license 检测、依赖分析、能力检测、危险命令、网络/文件系统访问、secret 检测、安装脚本检查（现有 7 规则仅部分覆盖）。
5. **forge 伪安装** → 真实 InstallService（桌面 IPC；CLI 同源）。
6. **三份重复逻辑**（rank/搜索/trust/版本）→ 单一 Core。
7. **webui.mjs SSR 市场** → 退役或仅 Local 开发模式（Web 不再是产品核心）。
8. **硬编码展示数据**（兼容性/License/安全面板）→ 接真实数据或空态。

## 9. 可以删除的代码（候选，仅标记，删除由后续阶段 commit 决定）

- `lib/webui.mjs` + registry-server 的页面路由（`/`、`/agents/:id`、`/compose`）——SSR 市场退役；**API 路由保留**。
- `landing/` —— 独立落地页，与 Desktop-first 定位重复（可留到 Desktop 发布后评估）。
- `docs/deployment.md` / `docs/registry-production.md` 的公网托管章节（Caddy/PostgreSQL/S3/Redis）——与 Local-first 冲突，改写为“未来可选”。
- 评分/安装计数端点（ratings/installations）——Local-first 下无采集源；保留代码、桌面端不依赖。
- 原则：**任何测试都不删**；删除只在对应 Phase 的独立 commit 内执行并说明理由。

## 10. 风险

| 风险 | 等级 | 对策 |
| --- | --- | --- |
| Rust Kernel 与 Node 核心双轨并行的行为漂移 | 高 | 以 18 套 e2e（245 项）作为双方共同验收；parity 清单逐项核对 |
| Rust 移植工作量大（installer/security/registry） | 高 | 增量移植：先 Registry/Package 读取面，再 Installer/安全，最后发布；每步保持 e2e 绿 |
| DSH 预发布无兼容承诺（0.1.0-rc.6） | 高 | lib/dsh.mjs 适配层隔离策略延续；compatibility 声明 |
| GitHub 导入的许可证/安全误报 | 中 | 检测结果分级展示，用户确认制（不自动阻断合法项目）；检测规则可解释 |
| 上游仓库变动/删除 | 中 | Package 记录 pin commit/tag + 制品本地缓存（Local-first 天然缓解） |
| GitHub 限流 | 中 | 导入按需 + 本地缓存 + 去重；不建公网聚合服务 |
| tar/pnpm 跨平台（Windows） | 中 | macOS 优先；OS-specific 能力集中封装 |
| secrets（GITHUB_TOKEN/私钥） | 高（红线） | 仅 Rust 侧/keyring；日志脱敏；发布前 secrets 扫描 |
| 范围膨胀 | 高 | Scope Guard：每个改动必须服务 Desktop/Package/Import/Security/Runtime 之一 |

## 11. 与目标架构的差距对照（新规范 §3/§4/§5）

| 目标 | 现状 | 差距 |
| --- | --- | --- |
| UI Layer（React/TS，页面/交互/状态展示） | forge/ 组件库成熟 | 可复用；需剥离浏览器耦合 + 新增 Composer/Runtime 页 |
| Rust Core（Forge Kernel） | 无 | **全新**（最大工作量） |
| Package Model（7 类型 + 规范字段） | agent/plugin 部分模型 | 扩展 + upstream/license/capabilities 建模 |
| Import 管线（Discover→Import→Analyze→Adapter→Package） | 无 | **全新** |
| Composer | 雏形（本地/服务端 compose） | 升级为 7 类型组合 UI + 依赖解析 |
| Runtime（进程/会话/日志） | 仅健康检查 | **全新** |
| Local Registry / Cache | 自建 HTTP 服务 | 改为本地目录 + 制品缓存 |
| IPC / Event | 无 | **全新**（类型化命令 + 统一错误码） |

## 12. 审计证据（命令 / 结果 / exit code）

- `git status --porcelain -b` → v0.3 工作树未提交（见报告头）；origin=W117C/deepseek-forge。
- `for t in test/e2e*.mjs; do node "$t" || exit 1; done` → `ALL E2E PASS`，**exit 0**（18 套 / 245 项）。
- `cd forge && npm run build` → tsc + vite 通过，**exit 0**。
- `curl -o /dev/null -w "%{http_code}" https://api.github.com/repos/W117C/deepseek-forge-registry` → **404**（不存在）；同法 deepseek-forge → 200。
- grep 全仓源码（lib/cli/forge/src/landing/src）：`mock|fixture|fake|placeholder` 生产零命中（仅 input placeholder 属性）；`api.github.com` 零命中；`fetch(` forge/src 仅 1 处（api/client.ts:24）、lib 6 处、cli 10 处；`VITE_` 仅 1 处（api/client.ts:3）；`Cargo.toml|src-tauri|tauri|electron` 零命中。
- `wc -l`：cli 502；lib ~1.9k；forge/src ~4.7k；test ~1.7k（详见 §1 表）。

---

## 13. §44 审计十七问速答

1. **当前有哪些模块？** cli/（单文件 20 命令）、lib/（15 个 Node ESM 模块：dsh/installer/signing/security/registry-server/registry-client/db×2/semver/health/state/manifest/yamllite/scaffold/webui）、forge/（React18 SPA 市场）、landing/（落地页）、bundles/（2 官方包 + mock-llm 夹具）、test/（18 套 e2e）、docs/、scripts/（backup/restore）、.github/workflows/ci.yml。
2. **哪些已经实现？** §2 表全部：安装十步管线、快照/回滚、sha256+ed25519、7 规则扫描、审核队列 Registry、发布管线、SemVer、多 Agent、组合、脚手架、备份恢复、Web 市场真实 API、2 个官方包。
3. **哪些只是 UI？** forge/src 全部页面/组件（Home/Listing/SearchPage/四个 Detail/Publish 等）、webui.mjs 的 SSR 页面、landing/ 全部；特别地：forge 的“Install”按钮是**伪安装**（localStorage 标记 + 匿名上报，不落盘）。
4. **哪些是真正 backend/core？** lib/installer.mjs（管线+快照+回滚）、lib/signing.mjs、lib/security.mjs、lib/registry-server.mjs + db/、lib/registry-client.mjs、lib/dsh.mjs、lib/semver.mjs、lib/health.mjs、lib/state.mjs、lib/scaffold.mjs。
5. **当前 Registry 如何工作？** node:http 单进程 + SQLite 十表(WAL) + artifacts/*.tgz；/v1/* 路由（发布验签/审核队列/制品 HMAC 签名 URL/评分/安装计数/状态机/令牌轮换）；CLI 与 forge 经 HTTP 消费；必须自建服务器进程 —— Local-first 下改为目录式 Local Registry。
6. **当前 Installer 如何工作？** install()：兼容→安全扫描→快照→profile 初始化→bundles（pnpm/dsh plugin 优先、复制兜底）→presets→skills→patch 合并→state→健康检查；任一步失败自动 restoreSnapshot。
7. **当前 Security 如何工作？** 7 规则字符串扫描→score/verdict→trust 门禁；sha256+ed25519（canonical payload）；blocked/yanked 阻断；token 哈希存储；HMAC 签名 URL+限速；audit_logs。
8. **当前 Bundle 如何工作？** bundles/<id>/ = agenthub.yaml（schema agenthub.dev/agent/v1：id/name/version/components(bundles/presets/skills)/profile/permissions/health/trust）+ bundle/<pkg>/ + preset/<id>/（agent.cordis.yml+preset.yml+skills）+ profile.patch.yml；安装器把其翻译为 DSH profile/bundle/preset/skills。
9. **当前 CLI 如何工作？** 单文件 502 行；flags() 解析；20 命令；install 经 registry-client.fetchAgent（验哈希/验签/解包）；其余 10 处直连 fetch；confirm() 交互；publish 本地 tar+签名+POST。
10. **当前 Web Marketplace 如何工作？** forge SPA：AppProvider→listPackages()→api/client.ts（唯一 fetch；VITE_REGISTRY_URL/?registry= 解析）→/v1/packages→mapApiPackage→展示模型→页面；生产 mock 为零；发布页只上传公钥。
11. **哪些可以直接复用？** §7 表：installer/signing/security 作为 Rust Kernel 的行为契约；18 套 e2e 作为新旧共同验收；forge 组件库/tokens/暗色设计；2 官方包作为 Package 样本；scaffold 作为 Adapter 起点；registry-server 作为过渡/Local 兼容后端。
12. **哪些重复实现？** rankScore（server+webui+forge 排序三份）；搜索（/v1/search vs forge searchPackages）；trust 映射（server assignTrust vs forge mapTrust）；版本解析（server sortVersions vs forge versions[0]）；SSR 与 SPA 两个市场。
13. **哪些技术债？** §6 表：CLI 10 处直连 fetch、base64 内联发布、spawnSync 阻塞、tar/pnpm 系统依赖、无统一错误码、无单元测试分层、CI 标题过期（14/203）、v0.3 工作树未提交。
14. **最危险的架构问题？** ① 特权操作全部在 Node/CLI 内同步执行、无 Rust Kernel —— 桌面化必然卡死 UI 且无最小权限边界；② UI 安全面板硬编码/未接真实 scan（scanned:false 恒真、License 硬编码 MIT）—— 用户会被误导信任；③ 无统一错误码 —— 桌面 IPC 无法给出可理解错误与恢复建议。
15. **如何迁移到 Desktop-first？** 最小路径见 migration-plan.md：Phase 1 Rust Core（Package 模型/manifest/registry/errors/events）→ Phase 2 Tauri 壳 → Phase 3 安装/回滚 parity 切换（Node 模块变薄代理，e2e 断言不改）→ Phase 4 GitHub Import → 5 Adapter → 6 Composer → 7 Runtime → 8 Polish；webui SSR 退役；forge UI 复用；CLI 逐步变薄。
16. **哪些绝对不能删除？** lib/installer/signing/security/dsh/health/state 及其行为；18 套 e2e；2 个官方 bundle；registry-server+db（过渡/Local 兼容后端）；CLI 现有全部命令行为；快照/回滚/签名链。
17. **Phase 1 应该具体修改哪些文件？** 只新增：crates/forge-core/（Cargo.toml、src/{model,manifest,registry,errors,events}、bin/forge-core.rs、tests/）、schemas/forge-package.schema.json、CI 增 cargo 任务；**不修改**任何现有 Node lib/cli/forge 行为。
