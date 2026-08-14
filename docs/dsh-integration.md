# DSH 集成机制（源码级核实记录）

> 核实对象：`@deepseek-ai/dsh@0.1.0-rc.6`（npm 发布产物）+ 官方仓库 `deepseek-ai/deepseek-harness`（master，docs/architecture.md、AGENTS.md、docs/user/develop/basic/publish.md）。
> 本文件是 AgentHub 的 dsh-adapter 设计依据；上游升级后先跑 `test/e2e.mjs` 再更新本文。

## 1. 概览

运行中的 dsh = 由有序 patch 层组合出来的 Cordis 插件树。模型、工具注册表、Session Log、Agent Loop、沙箱、UI 全部是插件。没有特权核心：扩展 = 挂一个插件行。

## 2. 三大原语（官方定义原文 + 落点）

### Profile

- 官方："A profile is a named composition stored in the Harness home. It lists the bundles it stacks, holds any out-of-tree plugins it installs, and keeps the user's own `cordis.patch.yml`."
- 目录：`$DSH_HOME/profiles/<name>/`，含 `package.json`（`dsh.profile.bundles` 有序列表 + `dependencies`）、`cordis.patch.yml`、`pnpm-workspace.yaml`、`node_modules/`。
- 模板：web = [dsh-base, dsh-web-app]，headless = [dsh-base, dsh-headless]；自定义 profile 默认 [dsh-base]。
- 创建：`dsh plugin --profile <name> <pnpm args>`（首次自动初始化）。

### Bundle

- 官方："A bundle is a distribution format for Cordis config rows and the code they mount, so whatever it inserts stays patchable by the layers above it."
- 格式：npm 包，`package.json` 声明：

```json
{ "dsh": { "bundle": { "patch": "./cordis.patch.yml" } } }
```

- patch 文件 = Cordis 组合（YAML 数组）：`- insert:` 块插入 `{id, name, config}` 行；按 row id 覆盖（整 `config` 替换，后写赢，非深合并）；支持 `disabled:` 与 `!!js` 表达式。
- 行顺序无加载语义（激活由服务依赖驱动）。
- 发布方式（官方 publish.md）：npm 发布 / git 安装（prepare + allowBuilds）/ tarball。

### Agent Preset

- 官方："An agent preset is a directory holding one `agent.cordis.yml`"（`packages/preset/README.md`）；per-session 组合。
- 用户预设：`$DSH_HOME/.agent-presets/<id>/`（trust=user）；系统预设随部署在 `config/agent-presets/{standard,cordis,code,minimal}`（不可改，升级覆盖）。
- 同目录 `preset.yml`（name/description/order 展示元数据）；目录可带 `skills/` 与资产，`ctx.agentPresets.copy()` 整目录复制。
- 规则：服务行必须在带 `isolate` realm 的 group 里；宿主平面行不得进 preset。

## 3. 配置分层（应用顺序，后写赢）

空根 → ① `dsh.profile.bundles` 各 bundle patch（按序）→ ② profile `cordis.patch.yml` → ③ `$DSH_HOME/cordis.patch.yml`（home 级）→ ④ 每个 `--patch`（按 argv 序）→ ⑤ telemetry 开关。

`dsh --profile <name> --dump-config` / `--dump-default-config` 离线打印组合树（AgentHub health 检查的依据）。

## 4. 能力接入面（Finance 用）

| 能力 | 插件 | 配置要点 |
|---|---|---|
| 数据/新闻 | `dsh-mcp-client` | 每 server 一行：`{serverName, transport: stdio\|streamable-http, command/args/env 或 url/headers}`；工具名 `mcp__<server>__<tool>`；`failOnStartupError: false` 可容错启动 |
| 联网 | `dsh-tool-web` | `web_search`/`web_fetch`；config: `{search, fetch, searchMaxResults, fetchTimeoutMs, searchTimeoutMs}` |
| 定时 | `dsh-schedule` | `schedule_create/list/delete`（after_seconds/at/every_seconds），持久化于 Session 日志 |
| 多分析师 | `dsh-subagent` 系 | provider spawn/fork；`dsh-tool-subagent` config: `{provider, toolName, persona, toolFilter, maxDepth, backgroundMode}` |
| 编排 | `dsh-tool-workflow` | JS fan-out 脚本（meta/script/args） |
| 技能 | `dsh-skill` + `dsh-skill-filesystem` | 扫描根：项目 `.dsh/skills`、`.agents/skills`、`customSkillDirs`、`$DSH_HOME/skills`、`~/.agents/skills`；格式 `<name>/SKILL.md`，frontmatter `name`/`description`/`whenToUse` |
| 凭据 | `dsh-credentials-local` | `$DSH_HOME/.credentials.yaml` 纯键值映射；优先级 env > file > 项目 .env > 用户 .env |
| 打包技能（待实测） | `dsh-skill-badge` | 官方组合中已挂载但默认 disabled 的"打包技能提供者"——若可用则 skills 可随 bundle 包内分发，替代 $DSH_HOME/skills 复制方案；见 docs/subsystems/skills.md |

## 4b. 官方文档导航（后续 adapter 深化依据）

- `docs/subsystems/`：60+ 子系统文档（skills/schedule/subagent/workflow/session 等专篇）
- `docs/capability-seams.md`、`docs/config-catalog.md`、`docs/tool-catalog.md`：能力 seam 与配置/工具目录
- `examples/`：acp-demo / agent-spine-demo / jsonrpc-demo 三个官方演示 bundle（第三方 bundle 模板）

## 5. AgentHub 安装器的 DSH 交互面（M1 实测）

1. 初始化 profile：按官方 `initProfile` 字节级模板写 package.json（name=dsh-profile-<name>、private、dependencies、dsh.profile.bundles）+ `cordis.patch.yml`（模板 `[]`）+ `pnpm-workspace.yaml`。
2. 安装 bundle：把 bundle 包复制到 `$DSH_HOME/profiles/node_modules/<scope>/<pkg>`，并把包名追加进 `dsh.profile.bundles`（对账逻辑与官方 `dsh plugin` 一致）。插件依赖（如 dsh-mcp-client）由 dsh 启动时的 flat module fallback（`healProfilesModuleFallback`）解析到 profiles/node_modules 符号链接。
3. 安装 preset：整目录复制到 `$DSH_HOME/.agent-presets/<id>/`。
4. 安装 skills：复制到 `$DSH_HOME/skills/<name>/`（跨 preset 可见）。
5. 合并 profile patch：托管段以注释标记写入 `cordis.patch.yml`，保留用户行。
6. 验证：`--dump-config` 检查组合树（bundle 行 + 覆盖生效）。

## 6. 官方明确没有（= AgentHub 的增值点）

- 中心 registry（仅 GitHub topic `dsh-plugin` 可发现性）
- 签名 / 完整性校验（官方信任模型："安装 = 本机执行该包代码"）
- 安全扫描 / 信任等级 / 权限声明对账
- 兼容性元数据（官方 README：developer preview，"THERE WILL BE COMPATIBILITY-BREAKING CHANGES"；无跨版本兼容承诺）
- preset 的 patch 语义（改预设 = 整目录复制）
- 回滚 / 健康检查 / 更新策略
