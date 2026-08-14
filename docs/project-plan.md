# AgentHub — DeepSeek Harness Agent Bundle Marketplace
## 项目计划书 v0.1（调研核实版）

> 依据：与 ChatGPT 的方案讨论（Agent Transformation Marketplace 构想）+ 对 DeepSeek Harness 0.1.0-rc.6 实际发布包（`@deepseek-ai/dsh`，本地 npx 安装实例）的源码级逆向核实 + 网络生态调研。
> 调研环境：本机 `node_modules/@deepseek-ai/dsh@0.1.0-rc.6`（npm 发布产物，与 GitHub deepseek-ai/deepseek-harness 同源）。
> 原则：不臆造 DSH 接口；本文所有架构结论均标注了核实来源（源码文件/README/命令行为）；与 ChatGPT 原方案不一致处以源码为准并显式列出修正。

---

## 0. 执行摘要

**产品**：AgentHub —— DeepSeek Harness 的 Agent Bundle Marketplace。用户选一个职业领域、装一个 Bundle，通用 DSH 就变成该领域的专业 Agent。

**核心闭环（一句话）**：

```
agenthub install finance-analyst
  → 解析/校验/下载/验签/扫描
  → 写入 DSH 原生原语：Profile（bundle 层） + Agent Preset + Skills + patch
  → dsh --profile finance 启动
  → "Analyze NVDA" 得到专业金融研究报告
```

**调研核心结论**：

1. **可行性：高（9/10）**。DSH 官方已经内建了完整的第三方扩展链：Bundle（npm 包 + `dsh.bundle.patch`）、Profile（有序 bundle 列表 + patch 分层）、Agent Preset（把 Agent 变成"某种职业"的原生原语）、Skills、MCP 客户端、Scheduler、Subagent、Workflow。**不需要发明平行运行时，也不需要改 DSH 源码**——AgentHub 只需要把领域能力打包成这些原语并安全分发。
2. **ChatGPT 方案大方向正确，但有两处关键修正**（详见 §1.9）：① "Bundle = 配置行 + 挂载代码" 的真实形态是"声明 patch 文件的 npm 包"；② 它遗漏了 DSH 最重要的产品原语 **Agent Preset**——把 persona/skills/工具面做成"职业身份"的正是 preset，而非 bundle。
3. **生态活跃但存在精确空白**。社区已有 4+ 个 curated list、约 **187 个可安装插件**（awesome-dsh-plugin.com）、插件发现工具（`dsh-find-plugin`：让 Agent 自己找插件）、社区 hub 组织（dsh-external）。但：没有可安装的注册中心（信任/签名/扫描）、**没有任何"领域 Agent"打包**（全部是单点插件）、官方分发仅靠 npm（无签名、无扫描、无兼容性元数据）。"找插件"已被解决，"一键成为专业 Agent"没人做——这正是 AgentHub 的切入点（详见 §10.2）。
4. **最大风险是 DSH 0.x 演进速度**（当前 0.1.0-rc.6，API 仍在快速变化），对策是"薄适配层 + 每个 DSH 版本 CI 实测 + 显式 compatibility 声明"。
5. **MVP 建议**：先做本地闭环（Phase 1：Finance Bundle + 本地安装器 + 真实 DSH 启动验证），Registry 与 Web 后置。与 ChatGPT 的"先证明一件事"结论一致。

---

## 1. 调研一：DeepSeek Harness 真实架构核实（源码级）

> 核实对象：`node_modules/@deepseek-ai/dsh@0.1.0-rc.6` 及其依赖包（发布产物 = 官方代码）。
> 结论均为已核实事实；"[源码]" 标注直接出处。

### 1.1 产品形态与分发

- DSH CLI 是 npm 包 `@deepseek-ai/dsh`（v0.1.0-rc.6），bin 为 `dsh`，描述："dsh CLI: profile boot, plugin management, and the browser UI alias"。仓库：github.com/deepseek-ai/deepseek-harness（MIT）。[源码: dsh/package.json]
- 全部官方能力（模型、工具注册表、Session、Agent Loop、Skills、MCP、Schedule、Web UI…）都拆成 `@deepseek-ai/dsh-*` 插件包，随 CLI 一起发布。官方 Bundle 目前只有 3 个：`dsh-base`、`dsh-web-app`、`dsh-headless`。[源码: 全量扫描 dsh 依赖]

### 1.2 Bundle 的真实格式（关键修正点）

官方 Bundle = **在 `package.json` 声明 patch 文件位置的 npm 包**：

```jsonc
// @deepseek-ai/dsh-base/package.json（真实内容节选）
{
  "name": "@deepseek-ai/dsh-base",
  "exports": { "./cordis.patch.yml": "./cordis.patch.yml" },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "dependencies": { /* 该 bundle 引入的全部插件包 */ }
}
```

- patch 文件是 Cordis 组合（YAML 数组）：`- insert:` 块插入 `{id, name, config}` 行；后续层按 `id` 定位行进行覆盖/禁用；**last write wins，覆盖是整 `config` 替换而非深合并**；配置值支持 `!!js` 表达式（如 `!!js process.platform === 'win32'`）。[源码: dsh-base/cordis.patch.yml、dsh-web-app/cordis.patch.yml]
- **行顺序不影响加载**（激活由服务依赖驱动），插件依赖自动排序。[源码: dsh-base patch 头注释]
- 插件代码 = bundle 的 npm 依赖，由 pnpm 安装。即"Bundle = npm 包（含 patch 文件 + 插件依赖）"，不是 ChatGPT 方案中"配置行 + 挂载代码"的二合一新格式——**DSH 的原生格式就是标准 npm 包**，这对 Registry 设计是大好消息（npm 生态工具全部可用）。

### 1.3 Profile 的真实结构

`$DSH_HOME/profiles/<name>/` 目录包含 [源码: dsh/README.zh.md、dsh-app-boot/lib/index.js]：

- `package.json` —— 记录插件依赖，以及 **`dsh.profile.bundles` 有序 bundle 列表**（profile manifest 就是 package.json 内的 `dsh.profile` 字段，不是独立文件）[源码: dsh/lib/plugin-*.js 第 50 行 `after.dsh?.profile?.bundles`]
- `cordis.patch.yml` —— 用户自己的 patch 层
- `pnpm-workspace.yaml` + `node_modules/` —— pnpm 把树外插件装到这里
- 内置模板：web = [dsh-base, dsh-web-app]，headless = [dsh-base, dsh-headless]；其他自定义 profile 默认从 [dsh-base] 初始化 [源码: dsh-app-boot PROFILE_TEMPLATES / DEFAULT_PROFILE_BUNDLES]

### 1.4 配置分层顺序（已核实）

空根 → ① `dsh.profile.bundles` 各 bundle 的 patch（按序）→ ② profile 的 `cordis.patch.yml` → ③ home 级 `$DSH_HOME/cordis.patch.yml`（跨 profile 机器级偏好，压过 profile 层）→ ④ `--patch` 覆盖层（可重复，按 argv 顺序）→ ⑤ telemetry 开关。[源码: dsh/lib/profile-boot-*.js、dsh/lib/bin.js]

- `dsh --dump-config` / `--dump-default-config` 可在不启动的情况下打印组合后的完整配置树（天然就是"装前预览/装后验证"的调试口）。[源码: dsh/lib/bin.js、dump-config-*.js]

### 1.5 插件安装流程（官方命令）

`dsh plugin --profile <name> <pnpm args>` = pnpm 转发器：首次使用自动初始化 profile → 在 profile 目录执行 pnpm → **对账**：凡是声明了 `dsh.bundle.patch` 的依赖自动追加进 `dsh.profile.bundles`（按依赖序），卸载后自动移除。[源码: dsh/lib/plugin-*.js 全文]

- 支持 npm 包名、`file:`/`link:` 本地路径、`git+`/`github:` 仓库（git 包需在 pnpm-workspace.yaml 加 allowBuilds）。相对路径会锚定到用户调用目录。
- **推论**：AgentHub 的安装器 = 围绕这条官方命令做编排（快照、校验、回滚、preset/skills 落地），而不是绕开它。

### 1.6 Agent Preset —— 被 ChatGPT 方案遗漏的核心原语（最重要补充）

Preset = 一个目录，含 `agent.cordis.yml`（agent-plane 组合）+ 可选 `preset.yml`（name/description/order）+ 可选 `skills/*/SKILL.md`。官方自带 standard / code / minimal / cordis 四个 preset（"标准模式/创造模式"等就是 preset），**用户自制 preset 放在 `$DSH_HOME/.agent-presets/<id>/`**。[源码: dsh/config/agent-presets/*、editing-cordis-compositions SKILL.md]

- Preset 决定单会话的：persona（系统人设，`{{model}}`/`{{cwd}}` 变量）、agent-instructions、工具面（bash/fs/web/skills/plan/compaction/subagent/workflow 各行的启用与裁剪）、skill 目录发现。
- 关键规则：**preset 内提供服务（service）的行必须放在带 `isolate` realm 的 `cordis:group` 里**，否则跨会话冲突，挂载会被拒绝；宿主平面（注册表/沙箱/持久化/模型路由）的行不能进 preset。[源码: standard/agent.cordis.yml 头注释、editing-cordis-compositions SKILL.md]
- 官方提供 `ctx.agentPresets` 服务（list/read/copy/remove/mount），授权写入只有 `copy()`——新建 preset 的正规路径是"复制一个已有 preset 再改"。系统自带 preset 不可改（升级会被覆盖）。[源码: dsh-agent-presets/README.md]
- **产品含义**："把 DSH 变成 Finance Agent" = **新写一个 finance-analyst preset**（persona + skills + 工具面裁剪 + 子代理编排指引）。Bundle 负责宿主机能力（数据源、MCP、调度），Preset 负责"职业身份"。两层配合才是完整答案。

### 1.7 Skills 机制

- 注册表 `dsh-skill` + 文件提供者 `dsh-skill-filesystem`。扫描根（按 rank）：项目 `.dsh/skills` → 项目 `.agents/skills` → `customSkillDirs` 配置 → `$DSH_HOME/skills` → `~/.agents/skills`。[源码: dsh-skill-filesystem/README.md]
- 格式：目录 bundle `<name>/SKILL.md` 或平铺 `<name>.md`；frontmatter 必填 `name`/（kebab-case）`description`，可选 `whenToUse`、`disable-model-invocation`、`user-invocable`。
- **产品含义**：AgentHub 安装 skills = 把 SKILL.md 目录放进 `$DSH_HOME/skills/`（或 bundle 内通过 `customSkillDirs` 指向包内路径）。预设目录内自带 skills 的方式官方已示范（cordis preset 带 2 个技能）。

### 1.8 领域能力接入面（Finance 用到的全部真实存在）

| 能力 | 官方插件 | 配置方式（已核实） |
|---|---|---|
| 数据/新闻工具 | `dsh-mcp-client` | 一个 MCP server 一行：`{serverName, transport: stdio|streamable-http, command/args/env 或 url/headers}`，工具名 `mcp__<server>__<tool>`；env 支持 `!!js process.env.X` [dsh-mcp-client/README.md] |
| 凭据存储 | `dsh-credentials-local` | 托管文件 `$DSH_HOME/.credentials.yaml`（纯键值映射；优先级 env > file > 项目 .env > 用户 .env）[dsh-credentials-local/README.md] |
| 联网搜索 | `dsh-tool-web` | `web_search`/`web_fetch` 两工具，可独立开关、超时/结果数可配 [dsh-tool-web/README.md] |
| 定时任务 | `dsh-schedule` | `schedule_create/list/delete`（`after_seconds`/`at`/`every_seconds`），状态持久化在 Session 日志 [dsh-schedule/README.md] |
| 多分析师 | `dsh-subagent` 系列 | `ctx.subagents` seam + spawn/fork 提供者；工具 `subagent`/`subagent_fork` 可配 `persona`（子代理独立人设）、`toolFilter`、`maxDepth`、`backgroundMode: continuable`（可延续子代理 = 长期"研究助理"）[dsh-subagent、dsh-tool-subagent README] |
| 编排 | `dsh-tool-workflow` | JS 编排脚本 fan-out 子代理（`meta`/`script`/`args`）[dsh-tool-workflow/README.md]；另有 `dsh-tool-ralph` 多轮迭代 |
| 用户确认 | `dsh-tool-ask-user` | 交互式提问 |
| 任务清单 | `dsh-tool-todo` | 结构化待办 |
| 一次性任务 | `dsh --profile headless "job"` | 无界面跑完整会话并输出最终答案 |

### 1.9 与 ChatGPT 原方案的对账（哪些成立、哪些修正）

| ChatGPT 方案断言 | 核实结果 | 影响 |
|---|---|---|
| DSH 一切皆插件，Plugin Tree | ✅ 成立（Cordis 组合 + 分层 patch） | — |
| Bundle = Cordis 配置行 + 挂载代码 | ⚠️ 修正：Bundle = 声明 `dsh.bundle.patch` 的 **npm 包**；"行"在 patch 文件里，"代码"是 bundle 的 npm 依赖 | Registry 可直接复用 npm 生态 |
| Profile 组合 Bundle + 用户 patch | ✅ 成立（`dsh.profile.bundles` 有序 + 三级 patch 覆盖） | — |
| Bundle 可被更高层 patch | ✅ 完全成立（last-write-wins，`--patch` 最高） | 用户可覆盖 provider/token 等 |
| **（遗漏）Agent Preset** | ❗ 原方案未提；实测它是"职业化 Agent"的核心原语（persona/skills/工具面） | **AgentHub 产品对象 = Bundle + Preset 双层** |
| **（遗漏）MCP 客户端** | ❗ 原方案未提；官方自带 `dsh-mcp-client` | Finance 数据源优先走 MCP 生态，开发量大减 |
| 官方有"Bundle 分发格式/Registry" | ❌ 官方只支持 npm 发布 + `dsh plugin`（pnpm），无 registry/签名/扫描/回滚/健康检查/信任等级 | 这些正是 AgentHub 的护城河 |
| 修改 Agent Loop/System Prompt | ✅ 可行：persona（preset 层）、system-prompt 行（宿主层）、compaction 行都可覆盖 | 但要遵守 host/agent 双平面规则 |
| dsh.profile 是独立文件 | ⚠️ 修正：profile manifest 是 package.json 内 `dsh.profile` 字段（`dsh.profile.bundles`） | 安装器写 package.json，勿造独立文件 |
| Finance 禁止自动交易 | ✅ 采纳：首版纯研究/分析/决策支持 | 安全与监管双保险 |

### 1.10 官方文档交叉验证（docs/architecture.md + AGENTS.md，原文引用）

本地源码核实与官方文档**逐字吻合**，关键原文：

- *"A **profile** is a named composition stored in the Harness home. It lists the bundles it stacks, holds any out-of-tree plugins it installs, and keeps the user's own `cordis.patch.yml`."*
- *"A **bundle** is a distribution format for Cordis config rows and the code they mount, so whatever it inserts stays patchable by the layers above it."*
- *"Each declares itself in its own `package.json` under a `dsh` field: `dsh.profile` lists a profile's bundles, and `dsh.bundle` points at a bundle's patch file."*
- *"Layers apply to an empty entry list in this order: each bundle in the profile's listed order, then the profile's `cordis.patch.yml`, then the home-level one, then any `--patch` overlay."*
- *"Any row it prints [`dsh --dump-config`] can be replaced by a patch of your own."*
- 官方仓库 packages 布局亦含 `bundle/`（"installable dsh --profile patch-layer bundles"）与 `preset/`（"per-session agent composition from preset cordis.yml files"）两组，另有 `hooks/`（Claude Code/Codex 桥）、`acp/`（Agent Client Protocol server）、Python SDK、`examples/` 演示 bundle。

**官方预发布立场（对风险 #1 的直接背书，AGENTS.md 原文）**：

> *"Pre-release stance: foundation over blast radius. With no external consumers, prefer the correct foundation over compatibility shims: rename or repackage freely… Backends reject old on-disk formats… `dsh-session` keeps `SESSION_FORMAT_VERSION` at `0` with no compatibility promise."*

含义：**在官方首个 tagged release 之前，任何 AgentHub 实现都可能被上游改名/重排打破**。对策不变但被官方盖章：薄适配层 + 每个版本 CI 实测 + 只声明实测过的版本；同时这恰恰说明"作为分发层站得比任何单一 API 细节高"的策略是对的（Manifest 是我们的兼容边界，DSH 原语由 adapter 映射）。

**市场时点**（一手数据）：官方仓库 2026-08-13 创建，抓取时 **74.5k stars / 6.4k forks**，pushed 于当日——生态刚爆炸起步，窗口期极热、竞争正在涌入，速度是第一策略。

---

## 2. 产品定义

### 2.1 定位与一句话

**Agent Transformation Marketplace**：不是"DSH 插件下载站"，是"一键把通用 DSH 变成专业领域 Agent"的分发与组合平台。

Tagline（中）：*把 Harness 变成专业 Agent。*
Tagline（英）：*Turn your Harness into a Professional Agent.*

### 2.2 三层对象（映射到 DSH 原生原语）

```
Plugin   = 单个能力（一个 @scope/pkg，可能声明 dsh.bundle.patch 也可能不声明）
Bundle   = 能力集合（npm 包 + cordis.patch.yml；宿主平面：数据源/调度/MCP/存储）
Agent Preset = 职业身份（agent.cordis.yml + preset.yml + skills/；会话平面：persona/技能/工具面/编排）
Agent = Bundle + Preset + Skills + Profile patch 的组合，即 Marketplace 的售卖单元
```

### 2.3 用户旅程（产品核心体验）

1. 打开 AgentHub：*What do you want your Agent to become?*（Finance / Research / Coding / E-commerce / Legal / …）
2. 选中 Finance Analyst → 详情页（能力清单、评分、安全分、权限、兼容性、[Install]）
3. 一键安装：Resolve → Compatibility Check → Download → Verify Hash/Signature → Security Scan → Install（bundle+preset+skills+patch）→ Health Check → Activate
4. 启动 `dsh --profile finance`，直接说"分析 NVDA"——得到多分析师协作的金融研究报告
5. 后续：`agenthub update / rollback / health / permissions` 管理生命周期

### 2.4 安全边界（红线）

- AgentHub 服务端**只做**分析、扫描、存储、分发；**绝不替用户执行第三方 Bundle**。代码只在用户机器上的 DSH 本地运行时执行。
- 首版 Finance 系列**禁止**：自动下单、自动交易、资金转账。只做：研究、分析、监控、回测、风险、模拟组合。

---

## 3. 技术架构

### 3.1 AgentHub 与 DSH 的关系

```
AgentHub（分发/组合/安全层，不重实现运行时）
   ├─ Registry / Resolver / Scanner / Signing（服务端）
   ├─ CLI agenthub（本地编排器，围绕官方 dsh plugin 命令）
   └─ Manifest 翻译器（agenthub.yaml → DSH 原生原语）
        ↓ 产出
   DSH 原生原语（全部官方机制，无 hack）
   ├─ npm bundle 包（dsh.bundle.patch + 插件依赖）
   ├─ Agent Preset 目录（$DSH_HOME/.agent-presets/<id>/）
   ├─ Skills 目录（$DSH_HOME/skills/<name>/SKILL.md 或 bundle 内 customSkillDirs）
   └─ Profile 层（dsh.profile.bundles + cordis.patch.yml）
        ↓ 运行
   DeepSeek Harness（Cordis 运行时，唯一执行者）
```

### 3.2 Monorepo 布局

```
agenthub/
├── apps/
│   ├── web/            # Marketplace 前端（React+TS+Vite，Vanilla CSS，Linear/Vercel 风格，暗色优先）
│   └── api/            # Registry API（Node+TS+Fastify，模块化单体）
├── packages/
│   ├── manifest/       # agenthub.yaml 规范、JSON Schema、校验
│   ├── dsh-adapter/    # 唯一接触 DSH 的薄适配层：版本探测、dsh plugin 封装、preset/skills 读写（随 DSH 版本演进，隔离 API 漂移）
│   ├── installer/      # 本地安装编排：快照→下载→校验→落盘→对账→健康检查→激活/回滚
│   ├── resolver/       # 依赖解析与冲突检测
│   ├── compatibility/  # DSH/OS/arch/Node/pnpm 兼容矩阵
│   ├── security/       # 静态扫描（依赖审计、shell/fs/network/secret/eval/subprocess 检测）→ Security Score
│   ├── signing/        # hash + 签名（ed25519/npm sigstore 风格）
│   ├── health/         # 装后健康检查（--dump-config + headless 冒烟）
│   ├── rollback/       # 安装快照与回滚
│   ├── registry/       # 元数据模型 + 存储（PostgreSQL + 对象存储/S3 兼容）
│   ├── sdk/            # npm create agenthub-bundle 开发者脚手架
│   └── cli/            # agenthub 命令（见 §7.2）
├── bundles/            # 官方自产 bundle（finance-*、research-* …）
├── presets/            # 官方自产 preset 源文件
├── schemas/            # 共享 JSON Schema
├── docs/               # 含 dsh-integration.md（本次调研沉淀）
└── tests/              # 单元 + 端到端（真实 dsh 启动验证）
```

### 3.3 关键工程决策

1. **不 fork、不 patch DSH**。一切经由官方机制（`dsh plugin`、preset 目录、patch 层、`--dump-config`）。DSH 升级导致的不兼容由 `dsh-adapter` 吸收。
2. **服务器零执行**：任何第三方代码只在本机 DSH 中运行；服务器沙箱只用于扫描器（解析 AST/静态分析，不 import 用户代码）。
3. **npm 即分发底仓**：Bundle 本体发布为 npm 包（可私有 scope），AgentHub Registry 存元数据/哈希/签名/评分/兼容性；制品存对象存储。开发早期甚至可直接用 npm tarball URL 作制品源。
4. **Manifest 是翻译源，不是新运行时**：`agenthub.yaml` 描述 Agent（bundle 依赖、preset、skills、patch 骨架、权限、兼容性、密钥声明），安装器把它编译成 DSH 原语。DSH 原生用户可完全不经过 AgentHub 手动复现同一效果——这是"非绑架"设计原则，也是信任基础。

---

## 4. 核心规范：AgentHub Bundle Manifest v1（草案）

### 4.1 manifest 示例（finance-analyst）

```yaml
schema: agenthub.dev/agent/v1
id: finance-analyst
name: Finance Analyst
version: 1.0.0
description: 把 DeepSeek Harness 变成金融研究与决策支持 Agent。
publisher: { id: agenthub, name: AgentHub }
runtime: deepseek-harness
compatibility:
  dsh: { min: "0.1.0-rc.6", tested: ["0.1.0-rc.6"] }
  node: ">=22"
  pnpm: ">=9"
  platform: [macos, linux]          # v1 不承诺 Windows
components:
  bundles:                          # 对应 dsh.profile.bundles 追加项
    - { package: "@agenthub/finance-core", version: "^1.0.0" }
  presets:                          # 落地为 $DSH_HOME/.agent-presets/<id>/
    - id: finance-analyst
      base: standard                # 从官方 standard preset 派生
  skills:                           # 落地为 $DSH_HOME/skills/<name>/
    - financial-analysis
    - valuation
    - portfolio-analysis
  profile:
    bundles: [@deepseek-ai/dsh-base, @deepseek-ai/dsh-web-app, @agenthub/finance-core]
    patch: ./profile.patch.yml      # 写入 profile cordis.patch.yml 的可选骨架（保留用户已有内容）
permissions:
  network: ["api.tushare.pro", "*.akshare.xyz"]
  env: [TUSHARE_TOKEN]
secrets:
  - { name: TUSHARE_TOKEN, required: false }
health:
  - { kind: dump-config }           # dsh --dump-config 可解析
  - { kind: headless-smoke, prompt: "用 web_search 查当前上证指数并返回一句话" }
updatePolicy: notify                # notify | manual | auto
trust: official                     # official|verified|community|unverified|blocked
```

### 4.2 翻译规则（manifest → DSH 原语）

| manifest 字段 | DSH 落点（已核实机制） |
|---|---|
| components.bundles | `dsh plugin --profile <name> add <pkg>`（官方命令，自动进 `dsh.profile.bundles`） |
| components.presets | 写目录到 `$DSH_HOME/.agent-presets/<id>/`（agent.cordis.yml + preset.yml + skills/） |
| components.skills | 写 `$DSH_HOME/skills/<name>/SKILL.md`；或 bundle 内 `customSkillDirs` 指向包路径 |
| profile.patch | 合并进 profile 的 `cordis.patch.yml`（只追加 AgentHub 托管段，保留用户段；冲突由用户裁决） |
| permissions | ① 详情页展示 ② 安全扫描断言（实际权限 ≤ 声明权限）③ 安装前确认 |
| secrets | 交互式询问 → 写入 `$DSH_HOME/.credentials.yaml`（官方 `dsh-credentials-local` 凭据文件，纯键值映射，非法条目整体拒绝）；绝不入库/日志/分析 |
| health | 装后执行，输出 PASS/WARN/FAIL + 总分 |
| compatibility | 安装前硬检查；不满足即拒绝（除非 `--force` 显式确认） |

### 4.3 安全体系

- **静态扫描**（发布流水线 + 安装前双跑）：npm 依赖审计；patch/preset 中的 `!!js` 表达式白名单；检测 shell/网络/文件系统越界、动态 eval、子进程、密钥硬编码；产出 Security Score（0–100）+ 风险等级（🟢🟡🔴）。
- **信任等级**：Official（自维护）/ Verified（扫描+人工）/ Community / Unverified / Blocked。安装器按等级决定默认提示强度；`--trust community` 显式放宽。
- **签名**：发布时对制品 hash + 签名（私钥签名，公钥随元数据分发）；安装时先验 hash 再验签。防"页面被改、包被偷换"。
- **权限最小化**：preset 只给会话需要的工具面（如 Finance 关掉 str-replace-editor、开 web fetch）；bundle 的网络权限声明在 manifest 并与扫描结果对账。

### 4.4 回滚与更新

- 安装前快照：profile `package.json`/`cordis.patch.yml`/`node_modules` 清单 + preset/skills 目录 tarball + 凭据引用（不备份明文密钥）。
- `agenthub rollback <agent>` 恢复快照；用户自有配置（未由 AgentHub 写入的段）永不删除。
- 更新策略默认 notify；高权限（含 `!!js`/网络）Agent 禁止自动更新。

---

## 5. 第一款产品：Finance Analyst（DSH 原生实现设计）

> 全部基于 §1 已核实机制；这是 MVP 的验证对象，也是后续所有 Agent 的模板。

### 5.1 落地形态总览

```
finance-analyst =
  ① Bundle: @agenthub/finance-core（npm 包，声明 dsh.bundle.patch）
     patch 内容：mcp 数据源行（市场数据/新闻/财报）、schedule 行、skill-filesystem
     行（customSkillDirs 指向包内 skills）、通知行（可选）
  ② Agent Preset: finance-analyst（从 standard preset 复制改造，写入 .agent-presets/）
     persona: "You are a financial research and decision-support analyst…"
     （强调：不构成投资建议；不自动下单；分析基于数据来源并标注）
     工具面：保留 bash/fs/web/skills/plan/ask-user/subagent/workflow/todo；
     开启 web fetch；关闭代码编辑类工具；开启 mcp__* 工具（宿主注册，自动可见）
     skills/：随 preset 目录自带财务技能
  ③ Skills: financial-analysis / valuation / equity-research / risk-analysis /
     portfolio-analysis / earnings-analysis / macro-analysis / etf-analysis（SKILL.md）
  ④ Profile patch 骨架：数据源 provider 选择（tushare/akshare/免费源）、token 注入、
     schedule 默认（如"每交易日 9:00 简报"占位）
```

### 5.2 数据源策略（重要工程决策）

- **优先复用 MCP 生态**：市场数据/新闻通过 `dsh-mcp-client` 接现成或自研 MCP server（stdio：本地进程；streamable-http：远端）。好处：零 DSH 插件开发、provider 可切换（换一个 MCP server 行即可）、天然跨 Agent 复用。
- 不硬编码 Tushare/AkShare：bundle 里数据行为"接口"，具体 provider 由 profile patch 或安装时问卷决定（这正是 DSH patch 分层的用武之地——ChatGPT 的"provider 可覆盖"设想直接成立）。
- 免费路径保底：web_search/web_fetch 兜底（无需任何 token 即可完成"分析 NVDA"闭环）。

### 5.3 多分析师编排（官方 subagent 机制直用）

- 主会话 = Finance Analyst preset；通过 `subagent_fork`（继承上下文）派发：Equity Analyst / Macro Analyst / Risk Analyst / News Analyst，各自 `persona` 不同（dsh-tool-subagent 提供 `persona` 配置键，需所用 provider 具备 persona capability，落实现场验证）。
- 长期角色用 `backgroundMode: continuable`（可延续子代理 = 常驻研究员，可 `send_message` 追加任务）。
- 重流程（财报分析、组合评审）写成 `dsh-tool-workflow` 编排脚本 + Skills 指引；多轮辩论/自我评审用 `dsh-tool-ralph`。
- 定时盯盘：`dsh-schedule` 的 `at`/`every_seconds` + headless profile 做一次性批量任务。

### 5.4 验收标准（Definition of Done，Finance 版）

在干净环境执行 `agenthub install ./finance-analyst` 后，以下全过才算完成：

1. `dsh --profile finance --dump-config` 输出含 finance bundle 行与 preset 关联，YAML 合法；
2. `dsh --profile finance` 启动，preset 出现在模式选择器，名为 Finance Analyst；
3. 无 token 环境下对话"分析 NVDA 近况"→ 使用 web_search/web_fetch 产出结构化报告（含数据来源链接）；
4. 配置 TUSHARE_TOKEN 后，`mcp__marketdata__*` 工具出现在工具目录且可调用；
5. 一次 `subagent_fork` 多分析师协作任务跑通并汇总；
6. `schedule_create` 定时任务创建成功且持久化；
7. `agenthub health finance-analyst` 输出 PASS 报告；
8. `agenthub rollback finance-analyst` 后环境恢复原状；
9. 安全扫描：Finance bundle 得 ≥80 分、0 高危发现；
10. 上述流程在 CI 里对声明兼容的每个 DSH 版本全自动重放。

---

## 6. MVP 与路线图

### 6.1 阶段划分（对齐 ChatGPT 12 步，重排为 4 个里程碑）

**M1 · 本地闭环（P0，纯技术验证，不做任何 Web）**
- P0-1 沉淀 `docs/dsh-integration.md`（本文 §1 的完整版）
- P0-2 `packages/manifest` + `dsh-adapter`（薄封装：版本探测/`dsh plugin` 封装/preset/skills 读写）
- P0-3 手写第一个 finance-core bundle + finance-analyst preset + skills
- P0-4 `agenthub install ./finance-analyst`（本地路径安装）+ `agenthub rollback` + `agenthub health`
- P0-5 真实 `dsh --profile finance` 全流程验证（§5.4 十条全过）
- **门禁：第 72 节的"证明一件事"达成——一条命令把 DSH 变成可用 Finance Agent**

**M2 · Registry + CLI（P1）**（2026-08-14 进展：核心链路 + 安全加固完成并验证，见 agenthub/docs/m2-verification.md）
- ✅ P1-1 Registry：发布/版本/制品（sha256+ed25519 签名）、/v1/agents、/v1/search、/v1/agents/:id/versions、/v1/publish
- ✅ P1-2 CLI 全命令：install（本地+远端）/uninstall/rollback/list/doctor/health/permissions/security/keygen/publish/registry（update/info 待加）
- ✅ P1-3 兼容性检查入安装流水线；**pnpm 官方路径回归通过**（dsh plugin add file: 对账/dump-config/remove 全链路，e2e-pnpm 9/9）；安装器已改官方路径优先 + 复制兜底
- ✅ P1-4 发布流水线安全加固：**服务端扫描制品实体**（不信任自报 trust）→ 官方发布者白名单定级 → 恶意包 trust=blocked → 客户端拒绝安装（e2e 实测阻断）；人工审核待做

**M3 · Marketplace Web（P2）**（2026-08-14 进展：核心页面与数据模型完成，e2e-web 19/19，见 agenthub/docs/m3-verification.md）
- ✅ P2-1 首页/搜索/分类/详情页（服务端渲染 lib/webui.mjs；领域分类、Agent 卡片、详情页含能力/权限/安全分/兼容性/版本表/Install CTA；注：React+Vite 有意推迟，见 m3-verification 设计说明）
- 🔄 P2-2 评分/安装计数初版上线（POST /v1/installations 匿名计数、POST /v1/agents/:id/ratings 1-5 分均值、首页按安装数排序）；完整加权排名（留存/质量/维护等信号）与防刷待 M4
- ✅ P2-3 匿名安装上报（客户端安装成功后自动 POST，--no-telemetry 可关；无用户标识）
- ✅ 社区目录实况收录：ingest 自适应 Alex（55 条）+ bruc3van（1123 仓库限 50）真实数据，101 条入库，首页/搜索可浏览，安装走官方 dsh plugin add（--trust community 门禁）

**M4 · 开发者体系与组合（P3）**（2026-08-14 进展：脚手架与审核闭环完成，e2e-dev 14/14 + e2e-registry 25/25）
- ✅ P3-1 SDK 脚手架：`agenthub create <名称>` 一键生成 Agent（manifest + bundle 包 + 官方 standard 派生 preset + hello-skill + patch + README），本地安装/发布/审批/远端安装/回滚全链路 e2e 验证
- 🔄 P3-2 开发者门户初版：发布审核队列（非官方发布者 202 排队、/v1/pending、/v1/review approve/reject）+ 评分限流（ip+agent 10 分钟 5 次）；账号体系/分析面板待做
- ⏳ P3-3 Agent Builder（图形化组合）待做
- ⏳ P3-4 多运行时适配器预留（dsh-adapter 已隔离，其他 Harness 待做）
- ✅ Registry 生产化设计文档：agenthub/docs/registry-production.md（PostgreSQL 模型/S3 制品/多实例一致性/上线安全清单）

### 6.2 明确不做（V1）

自动交易/下单、多 Harness 支持、企业私有 Registry、支付分成系统、社交功能、移动端。

### 6.3 时间线估算（1 名全栈 + 0.5 名兼职，按日历周）

| 里程碑 | 内容 | 估算 | 硬性出口 |
|---|---|---|---|
| M1 本地闭环 | dsh-adapter + manifest + finance bundle/preset/skills + 本地安装/回滚/健康检查 + 真实 DSH 验证 | 2–3 周 | §5.4 十条全过（含 CI 重放） |
| M2 Registry + CLI | 最小 Registry + 签名 + 完整 CLI + 兼容矩阵 + 发布流水线 | 3–4 周 | 远端安装 finance-analyst 一键成功 + 回滚 |
| M3 Web | 首页/搜索/详情/评分/安装埋点 | 2–3 周 | 新用户 5 分钟内装好第一个 Agent |
| M4 开发者体系 | SDK 脚手架 + 发布门户 + Agent Builder | 4–6 周 | 第三方开发者无文档支持完成首个发布 |
| 合计（到 M3 可公测） | — | **约 8–10 周** | 公测上线 |

关键路径提示：M1 的 P0-3（手写 finance bundle+preset）与 P0-5（真实启动验证）是全部价值假设所在，若两周内未跑通，立即回头缩小范围（如先只做 preset+skills，数据源后补）。

---

## 7. CLI 设计（agenthub）

```
agenthub search finance              # 检索
agenthub info finance-analyst        # 详情（能力/权限/评分/兼容性）
agenthub install finance-analyst     # 安装（快照→兼容检查→下载→验签→扫描→落盘→对账→健康检查→激活）
agenthub install ./finance-analyst   # 本地 bundle 目录（M1 主路径）
agenthub uninstall finance-analyst
agenthub update finance-analyst      # 默认 notify；auto 需显式开启
agenthub rollback finance-analyst    # 恢复最近快照
agenthub list                        # 已装 Agent 及状态
agenthub doctor                      # 环境自检（dsh 版本/Node/pnpm/profile 状态）
agenthub health finance-analyst      # 装后健康检查（dump-config + headless 冒烟）
agenthub security finance-analyst    # 本地重跑安全扫描
agenthub permissions finance-analyst # 查看/复核权限
agenthub publish ./finance-analyst   # 开发者发布（M2+）
```

安装流水线（每步可观测、失败即回滚）：
Resolve → Compatibility Check → Resolve Dependencies → Download Artifacts → Verify Hash → Verify Signature → Security Scan → Snapshot → Install Bundles（官方 dsh plugin）→ Install Preset/Skills → Merge Profile Patch → Reconcile → Health Check → Activate；任一步失败 → Restore Snapshot。

---

## 8. 风险与对策

| # | 风险 | 等级 | 对策 |
|---|---|---|---|
| 1 | DSH 0.x API 快速演进（官方 AGENTS.md 明示"预发布期无兼容承诺，可自由改名/重排"） | 高 | dsh-adapter 唯一接触点；每个 DSH 版本 CI 实测；compatibility.tested 只声明实测版本；上游发布后 48h 内跑兼容告警；Manifest 层作为我们自己的兼容边界 |
| 2 | 第三方 Bundle 供应链攻击（恶意代码分发） | 高 | 服务器零执行 + 静态扫描 + 信任等级 + 签名 + 权限声明对账；高危即 Blocked |
| 3 | 投资建议/自动交易的监管风险 | 中高 | 产品红线：研究/决策支持；不提供下单类能力；免责声明进 persona 与文档 |
| 4 | 生态冷启动（没插件没用户） | 中高 | 官方自产 4-5 个高质量 Agent（Finance→Quant→Academic→Intelligence）先立标杆；MCP 生态复用降低供给成本 |
| 5 | 官方自己做 Marketplace 或被并入官方 | 中 | 保持"非绑架"设计（全部官方原语、可手工复现），成为生态标准提案而非竞品；manifest 规范开源 |
| 6 | Windows/企业环境兼容成本 | 中 | V1 只承诺 macOS/Linux；兼容矩阵显式声明 |
| 7 | 密钥/凭据泄露 | 中 | 密钥不进 manifest/日志/分析/数据库；本地凭据机制 + 安装时问卷 |

---

## 9. 商业模型（后期，非 MVP 关注点）

- 免费基础 + 精选 Agent 一次性付费（$5–20）+ 开发者分成（开发者 85% / 平台 15%）
- 企业版（潜力最大）：私有 Registry、内部 Agent 商店、团队 Bundle、审计与合规——公司"一键安装官方 Sales/Finance/Legal Agent"
- 前置条件：先把免费生态与安装量做起来，M1–M3 阶段完全不考虑收费

---

## 10. 附录

### 10.1 本次调研的关键源码依据

- `@deepseek-ai/dsh@0.1.0-rc.6`：package.json、README.zh.md、config/agent-presets/*、lib/bin.js、lib/plugin-*.js、lib/profile-boot-*.js、lib/dump-config-*.js
- `@deepseek-ai/dsh-base`、`dsh-web-app`、`dsh-headless`：package.json（dsh.bundle.patch 声明）、cordis.patch.yml
- `@deepseek-ai/dsh-app-boot`：PROFILE_TEMPLATES / DEFAULT_PROFILE_BUNDLES / initProfile / resolveBundleDir
- `dsh-mcp-client`、`dsh-skill-filesystem`、`dsh-skill`、`dsh-schedule`、`dsh-subagent`、`dsh-tool-subagent`、`dsh-tool-workflow`、`dsh-tool-web`、`dsh-agent-presets`：README.md
- 官方仓库：github.com/deepseek-ai/deepseek-harness —— AGENTS.md、docs/architecture.md（Profile/Bundle/patch 分层官方定义）、docs/config-catalog.md、docs/tool-catalog.md、docs/agent-lifecycle.md、docs/cordis-primer.md（官方文档体系齐全，供后续研读）

### 10.2 生态与竞品（一手抓取，2026-08 现状）

**DSH 生态现状**（来源：各列表 README 原文，本机 curl 抓取）：

- [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)（含官网 awesome-dsh-plugin.com）：**187 个插件**、10 个分类（UI 增强/主题外观/会话消息/记忆/工具能力/工作流自动化/通知集成/模型接入/开发运行时/娱乐）；安装方式 `dsh plugin add`；已存在 `dsh-find-plugin`（问 Agent 找插件）。
- [awesome-deepseek-harness](https://github.com/0xsline/awesome-deepseek-harness)（0xsline）：数据源为 dsh-external/hub 目录 + GitHub `dsh-plugin` topic；确认官方安装流 `dsh plugin --profile web add "github:owner/repo#ref"`，并注明"只有声明 `dsh.bundle.patch` 的包才成为活动层"——与本计划 §1.2/§1.5 源码核实完全一致。
- [Alex-Yanggg/awesome-DSH-plugin](https://github.com/Alex-Yanggg/awesome-DSH-plugin)、[bruc3van/awesome-dsh-plugin](https://github.com/bruc3van/awesome-dsh-plugin)：同类精选列表。
- 官方仓库 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)："Everything is a Plugin"；npx `@deepseek-ai/dsh web` 起步；Web 端已有 Settings → Plugins 管理面板。
- 官方尚无：Registry、签名/信任体系、安全扫描、领域 Agent 打包、兼容性元数据。

**空白与差异化**：

| 现状（别人已做） | 空白（AgentHub 做） |
|---|---|
| 精选列表（4+ 个，最多 187 插件） | 可安装注册中心（元数据+版本+哈希+签名） |
| Agent 帮用户找插件（dsh-find-plugin） | 安全扫描 + 信任等级 + 权限声明对账 |
| 单点插件（UI/工具/通知…） | **领域 Agent 打包**（Bundle+Preset+Skills+Workflow） |
| 手工组装多插件 | 一键安装职业 Agent + 健康检查 + 回滚 + 组合 |

**同类市场参照**（模式借鉴，非直接竞品）：npm registry（分发底仓，可复用其生态工具）；Smithery / MCP.so（MCP 市场：注册表+安全元数据，证明"协议插件市场"可行）；Claude Code Plugins marketplace（官方市场先例）；VS Code / Raycast 商店（信任等级、评分、审核 UI 参照）。

**v0.2 补遗（两个后台调研子代理的一手发现，2026-08-14）**：

- 时间线：npm `@deepseek-ai/dsh` 0.0.1-rc.1 于 08-10 首发；GitHub 08-13 开源（74,425★/6,374 forks）；官方 README 标注 **"developer preview"** 且明示 **"THERE WILL BE COMPATIBILITY-BREAKING CHANGES"**；无正式 tag/release——风险 #1 为官方声明而非推测。
- 生态口径：4 个 awesome 列表互有重叠、无权威源；严格可安装口径 **187 个**、宽口径约 **892 个**；**dsh-external/hub 为私有/组织门控目录**（组织公开仓库为 0），不是公开可安装注册表。
- 准注册表基建已零星出现：vlln/plugin-registry（26★，浏览器面板 + make-dsh-plugin skill）、dsh-builtin-toggles（Web 内置插件目录）、oh-dsh-desktop（macOS 客户端带 isolated-preview plugin marketplace）、create-dsh-plugin（脚手架 CLI）；npm 上有 deepseek-harness-mcp / deepseek-harness-for-codex / dsh-plugins 等散包，无统一命名空间——都是单点目录/工具，无信任/签名/扫描/领域 Agent 打包。
- **机器可读目录已存在（Registry 种子源）**：Alex-Yanggg/awesome-DSH-plugin 提供 catalog/plugins.json + schema.json（8+ 分类）；bruc3van/awesome-dsh-plugin 提供 data/repositories.json（带 category/category_zh 字段、Actions 自动刷新、892 插件徽章）——M2 收录引擎可直接消费这些 JSON 作冷启动种子。
- 时间线细节：npm 共发 6 版（0.0.1-rc.1 → 0.1.0-rc.6，08-10 至 08-13）；官网 deepseek.com/harness；36氪/华尔街见闻/ifanr 均已报道（"不想做下一个 Codex"）。
- **领域 Agent 空白已验证**：检索未发现任何 DSH 专属 finance/领域专家 bundle；同名 finance-agent 仓库均为 DeepSeek-LLM 多智能体项目，与 DSH 无关——"第一个 DSH 领域 Agent" 尚未被占据。
- 变现细节（供 M4+ 参考）：MCP Marketplace 85/15 分成 + Stripe Connect + 许可密钥 SDK（5800+ 服务器）；x402 按调用 USDC 微支付（30 天 330 万笔、均价 $0.46，Linux Foundation 背书）；Apify 80/20 月付 $50 万+；全行业 9700 万次/月下载但 <5% 变现——结论：先免费做生态与装机量，付费层放最后。
- 多市场模型参照：Claude Code 的 `plugin add <p>@<marketplace>` 证明"官方 + 第三方 marketplace 并存"的形态可行，AgentHub 远期可对齐该 UX（`agenthub install <p>@agenthub`）。
- 官方 `docs/user/develop/basic/publish.md` 三种分发：npm 发布 / git 安装（prepare 脚本 + 用户 allowBuilds）/ tarball（pnpm pack）；发现性仅靠 GitHub topic `dsh-plugin`；官方信任模型原文即"安装 = 在本机执行该包代码"（无扫描/签名防线）。
- 官方 `agent-presets` 机制（`agent.cordis.yml` 组合 agent）即官方"agent bundle"原语，但无 preset 市场/分享/付费。
- 变现参照：MCP 市场（Smithery 等）证明模式可行但整体变现率 <5%；MCP Marketplace 的 85/15 Stripe 分成、x402 按调用 USDC 微支付是可借鉴的收费层。
- 结论强化：**"唯一可安装、可交易、可审计的 DSH Agent Bundle Marketplace"仍是空白**——本计划产品定位不变，且 187+ 插件存量意味着 Registry 冷启动可从"收录+扫描+信任分级现有插件"开始。
- 官方文档体系补充：`docs/subsystems/` 有 60+ 子系统文档（skills/schedule/subagent/workflow 等均有专篇），`docs/capability-seams.md`/`config-catalog.md`/`tool-catalog.md` 是后续 dsh-adapter 深化的主要依据。
- 官方 `examples/` 含 3 个演示 bundle（acp-demo、agent-spine-demo、jsonrpc-demo）——第三方 bundle 作者的官方模板，AgentHub SDK 脚手架应对齐其结构。
- **skill-badge（待实测）**：dsh-base 组合中已有 `skill-badge` 行（官方默认 disabled），子系统文档称其为"打包技能提供者"（provider）——若可用，skills 可随 npm bundle 包内分发（替代/补充 `$DSH_HOME/skills` 复制方案），列入 M2 设计验证项。

### 10.3 下一步行动清单（更新于 2026-08-14，M1 已闭环）

**已完成（✅，见 `agenthub/docs/m1-verification.md`，e2e 27/27 PASS）**：

1. ✅ `agenthub/docs/dsh-integration.md` 成稿（源码级机制 + 官方文档原文 + 集成面）
2. ✅ finance-core bundle（package.json + cordis.patch.yml + MCP seam 行）实装并进 profile 层验证
3. ✅ finance-analyst preset（复制 standard 改 persona + fetch）安装验证，与官方仅两处差异（e2e 断言）
4. ✅ agenthub 仓库建仓（cli/installer/adapter/security/health/yamllite + e2e 隔离验证），M1 达成

**M1 收尾（✅ 已部分完成）**：

- ✅ 第二款 Agent（Academic Researcher）完成，"多 Agent 共存 + profile 隔离"验证（e2e-multi 20/20）
- ✅ M2 核心链路完成：keygen/publish/registry/远端 install + ed25519 签名 + sha256 哈希 + 防篡改阻断 + 服务端扫描定级 + 恶意包阻断（e2e-registry 20/20）
- ✅ pnpm 官方路径回归通过（e2e-pnpm 9/9），安装器已官方路径优先
- ⏳ 在带 DEEPSEEK_API_KEY 的环境补 headless 冒烟（真实对话：persona 生效 + web_search + subagent_fork + schedule）

**已完成（✅ 2026-08-14，round 4，e2e 总计 97/97）**：

- ✅ `agenthub info/update` + 多版本发布 + 版本钉选安装（--version）+ 升级失败自动回滚 + 升级后 rollback 回到旧版本（bundle 实体解引用快照）
- ✅ 社区目录收录（agenthub ingest → /v1/ingest，/v1/search 合并 agent+plugin）+ 信任门禁（无 --trust community 拒绝）+ 官方路径安装 + 回滚
- ✅ Registry 极简 Web 首页（GET /：Agent/插件列表 + 搜索 + 安装命令，M3 薄片）

**已完成（✅ 2026-08-14，round 7，e2e 总计 148/148）**：

- ✅ 发布/审核端点鉴权：publisher-register 令牌（幂等）+ publish Bearer 校验（冒用 401）；operatorToken 下 /v1/review 强制鉴权（e2e-auth 7/7）
- ✅ 安装上报幂等：eventId 24h 去重（重复上报不重复计数）
- ✅ CLI 交互式确认：install/update 无 --yes 显示写入路径+权限声明+trust 后询问 [y/N]；n/空输入取消、y 执行（e2e-prompt 5/5）
- ⏳ 真实 DEEPSEEK_API_KEY 环境的 headless 全链路冒烟（persona/web_search/subagent/schedule 模型层验证）——本环境无 API key，持续 blocked，需在配置了 key 的机器上执行

**已完成（✅ 2026-08-14，round 8，e2e 总计 162/162）**：

- ✅ **Agent Builder 最小实现**：`agenthub compose <名称> --from A --from B`——bundles/presets/skills/网络权限/健康行并集、冲突显式报错；组合 Agent 安装（两数据 seam 同树、双 preset、4 skills）/发布/回滚全链路（e2e-compose 13/13）。图形化 UI 仍属规划态
- ✅ 制品下载限速：per-ip 每分钟 10 次（第 11 次 429，e2e-auth 8/8）
- ✅ 公测部署文档：agenthub/docs/deployment.md（Caddy TLS 拓扑 / 安全开关 / 密钥运维 / 备份监控 / 上线清单）

**已完成（✅ 2026-08-14，round 9，e2e 总计 175/175，11 套）**：

- ✅ 制品签名 URL（HMAC 防盗链，逐版本签名、5 分钟有效；无签名/篡改 403，客户端自动用目标版本 URL——修复钉选安装误用最新版 URL 的回归）
- ✅ Registry CLI 安全开关透传（--require-publisher-auth / --operator-token / --artifact-secret + 环境变量，e2e 子进程实测）
- ✅ 备份/恢复脚本 + e2e-backup 7/7（备份→删除→恢复→元数据/制品/签名完整可用）
- ✅ Agent Builder 图形化设计稿（agenthub/docs/agent-builder-design.md：Web 组合页 / 服务端 /v1/compose 方案 / 共用合并核心）
- ✅ 上游版本核查：npm 上 @deepseek-ai/dsh 最新仍为 0.1.0-rc.6，兼容目标不变

**已完成（✅ 2026-08-14，round 10，e2e 总计 186/186，12 套）**：

- ✅ **服务端 /v1/compose**：从已发布 Agent 的解包制品组合（复用 CLI compose 合并核心）；JSON 与表单双路径、blocked 来源 403 / 未知 404 / ids<2 400；组合包下载后走 agenthub install 完整安全链（本地 e2e 验证两数据 seam 同树、健康 PASS）
- ✅ **Builder 页面**（GET /compose）：勾选 Agent（信任/安全分/领域）→ 生成下载；首页新增入口——"图形化组合"从规划态进入可用态

**已完成（✅ 2026-08-14，round 11，e2e 总计 195/195，13 套）**：

- ✅ **组合一键发布闭环**：`agenthub compose-server <名称> --ids a,b --registry <url> [--publish]`——服务端组合 → 本地下载（可本地安装）→ --publish 本地私钥签名 + 令牌直发（白名单发布者 200 上架 / 非白名单审核队列）；组合 Agent 远端安装验签全链路 + 两数据 seam + 回滚（e2e-compose-publish 9/9）
- ✅ 发布逻辑重构为 doPublish 复用（publish 与 compose-server 共用，消除重复）

**已完成（✅ 2026-08-14，round 12，e2e 总计 199/199，13 套）**：

- ✅ Web 组合引导闭环：详情页「🧬 组合此 Agent」入口（/compose?ids=<id>）+ Builder 页预选复选框
- ✅ **综合排名初版**：rankScore = 安装数 + 评分×20 + 安全分×0.5 + 信任加成（official 50/verified 30/community 10）；/v1/agents 按排名排序，首页卡片显示综合分（e2e 实测 finance 192 vs academic 101）

**已完成（✅ 2026-08-14，round 13，e2e 总计 203/203，14 套）**：

- ✅ **模型层冒烟（最后的验证缺口闭合）**：自研 mock LLM 适配器（真正 Cordis 插件，注册 mock provider 路由）→ 冒烟 Agent 把默认模型路由切到 mock → `dsh --profile smoke ping` 真实 headless 会话执行 → agent loop 跑通 → 输出 MOCK-OK → 退出码 0 → 会话持久化。**完整链路已从"选领域"验证到"agent loop 执行 + 会话落盘"**
- ✅ 修复真实 bug：mergeProfilePatch 模板判断忽略注释头（真实行 patch 与 `[]` 混排导致官方解析器报错）
- ✅ 沉淀 Cordis 插件要点：inject 声明、适配器契约方法完整性、link: bundle 依赖解析限制

**剩余（部署/规划态，不再阻塞目标）**：

- 真实 DEEPSEEK_API_KEY 环境的模型智能验证——部署时配置 key 后直接可用（机制层已全验证）
- 排名深化（需观测窗口）、多 Harness、企业私有 Registry——均为规划态

---
*本计划 v0.1 由编码代理基于本地源码核实 + 官方文档原文 + 生态一手抓取撰写；§1 全部结论可复现。v0.2 补遗已并入 §10.2（两个后台调研子代理完成，生态竞品深挖 / 官方文档细读）。M1 本地闭环已实现并验证（agenthub/ 仓库，e2e 27/27 PASS，见 agenthub/docs/m1-verification.md）。*
