# DeepSeek Forge Desktop — Target State（目标架构）

> 核心目标一句话：**不推倒现有项目，复用已有 Registry / Installer / Security / Bundle / Marketplace 能力，将它们重构为一个 Tauri Desktop 的本地 AI Agent Package Platform；插件本身主要来自 GitHub 开源项目，Forge 负责发现、分析、适配、组合、验证、安装和运行。**
> 配套文档：`current-state.md`（现状，已核实）、`migration-plan.md`（增量迁移路径）。本文只描述“目标是什么”，不改代码。

---

## 1. 产品定位与原则

产品链路（核心价值）：

```
GitHub → Discover → Import → Analyze → License Check → Security Scan
→ Compatibility Check → Adapter → Forge Package → Compose → Install → Run → DeepSeek Harness
```

| 原则 | 落点 |
| --- | --- |
| Desktop First | Tauri 2 桌面是主产品；Web Marketplace 降级为“未来可选的 Discover 页”，当前不投入 |
| Local First | Local Registry / 本地缓存 / 本地 Runtime / 本地配置；第一版零公网后端依赖 |
| Open Source First | Forge 不生产插件；从 GitHub 发现，提供 Analyze/Adapt/Normalize/Verify/Compose/Install/Manage/Run |
| Never Pretend to Own Upstream | 每个 Package 强制保留 upstream（仓库/作者/许可证/版本/URL/adapter 版本）；禁止伪原创 |
| Security First | 导入前强制：license 检测、依赖分析、能力检测、静态扫描、权限分析、危险命令、网络/文件系统访问、secret 检测、安装脚本检查 |
| Package Is the Core Primitive | 7 类型统一 Package → Manifest → Artifact → Dependency → Capability → Security → Install → Runtime，全系统一条安装逻辑 |

## 2. 目标架构总图

```
┌───────────────────────────── DeepSeek Forge Desktop（Tauri 2）─────────────────────────────┐
│  UI Layer（React + TypeScript）                                                             │
│  Discover(Marketplace/GitHub Import) · Workspace(My Agents/Skills/Plugins/Bundles)          │
│  Runtime(Sessions/Processes/Logs) · System(Security/Sources/Updates/Settings)               │
│  UI 不直接执行 shell/npm/git/filesystem mutation/package install                            │
└───────────────┬─────────────────────────────────────────────────────────────────────────────┘
                │ typed IPC（invoke + typed request/response/error + events）
┌───────────────▼─────────────────────────────────────────────────────────────────────────────┐
│  Rust Core（Forge Kernel，crates/forge-core）                                               │
│  filesystem · process · package manager · registry · security · signature · hashing         │
│  installation · rollback · runtime process management · IPC · event system                  │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐                       │
│  │ model    │ manifest │ registry │ security │ installer│ runtime  │                       │
│  │ package  │ adapter  │ import   │ composer │ errors   │ events   │                       │
│  └──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘                       │
└───────┬────────────────────────────┬──────────────────────────────┬─────────────────────────┘
        ▼                            ▼                              ▼
   Local Registry               Local Package Cache           Forge CLI（薄壳）
   ~/.deepseek-forge/registry/  ~/.deepseek-forge/cache/      同 Core，无第二套逻辑
        │                            │
        ▼                            ▼
   GitHub（开源项目发现/导入）   DeepSeek Harness（Model Runtime + Tool Calling + Agent Execution）
```

**关系定义（§22）**：Forge = Package Manager + Environment Manager + Agent Manager；Harness = Model Runtime + Tool Calling + Agent Execution。**Forge 不重新实现 Agent Runtime。**

## 3. 分层与边界

| 层 | 允许 | 禁止 |
| --- | --- | --- |
| UI（React/TS） | 页面、交互、状态展示、Package 浏览、Composer、Runtime UI、经 IPC 调 Core | 直接 shell/npm/git/文件变更/安装；直连 GitHub API；持有 secrets |
| Rust Core | 上述全部特权操作 + IPC/事件 | 渲染 UI；执行第三方未验证代码（扫描与运行分离） |
| Harness | 模型运行时与执行 | —（由 Core 经 dsh CLI 面调用） |

## 4. 目标目录结构（基于现有 repo 增量，不强制重排）

```
deepseek-forge/
├── crates/forge-core/        # Rust Kernel（模型/manifest/registry/security/installer/runtime/events/errors）
├── desktop/                  # Tauri 2 壳（src-tauri + React UI，复用 forge 组件）
├── forge/                    # 现有 Web UI（保留，作为组件库来源与可选 Discover 页）
├── cli/                      # 现有 CLI（逐步变薄为 Core 的 automation interface）
├── lib/                      # 现有 Node 核心（parity 切换后变薄代理；逻辑进 Rust）
├── schemas/forge-package.schema.json   # Manifest JSON Schema（权威）
├── bundles/                  # 官方包（迁移为 forge.package.v1 或经归一化加载）
├── registry-template/        # Git Registry 仓库模板（registry.json + packages/）
├── test/                     # 既有 18 套 e2e（保留，作为契约）+ 新增套件
└── docs/architecture/        # current-state / target-state / migration-plan
```

## 5. Package Model（统一原语）

```
Package ├─ identity(id, slug)      ├─ metadata(name, description, category, tags, icon)
        ├─ type(agent|skill|tool|mcp|plugin|workflow|bundle)
        ├─ version(SemVer, latest 由 registry 解析)
        ├─ source(type: github|forge|local, repository, ref, commit)
        ├─ upstream(repository, author, license, version, url, adapterVersion)   # Principle 4 强制
        ├─ artifact(filename, size, sha256, signature, signatureAlgorithm, publisherKeyId)
        ├─ dependencies[{ package, version, required }]
        ├─ capabilities[filesystem.read|filesystem.write|network.http|network.websocket|
        │              process.spawn|shell.execute|environment.read|browser.control]
        ├─ compatibility(forge, dsh{min,tested}, node, platform, os, arch)
        ├─ security(scan: required|optional, status: PASS|WARNING|BLOCKED, scannedAt, findings[])
        ├─ entrypoint(type: harness-profile|process|mcp-server|workflow, profile|command, config)
        └─ runtime(engine: deepseek-harness, profile, components{bundles,presets,skills}, health[])
```

七类型语义（§7）：**Agent**=完整 AI Agent 配置（instructions+skills+plugins+tools+workflows+runtime config）；**Skill**=instructions/workflow/knowledge/prompt/tool usage rules（默认无 arbitrary code execution）；**Tool**=agent 可调用工具（browser/filesystem/search/data query）；**MCP**=server+tools+configuration+runtime requirements；**Plugin**=真实系统扩展（外部进程/原生集成/API connector/filesystem 集成）；**Workflow**=多能力可执行工作流；**Bundle**=多 Package 组合（如 Quant：Agent+Financial Data+Backtesting+Research+Report）。

与现状衔接：现有 agenthub.dev/agent/v1（finance-analyst 等）在加载时**归一化**为 forge.package.v1（type=agent，components→runtime.components，permissions→capabilities 映射），两个官方包零改动继续有效；SQLite 三表与 /v1/packages 端点语义保留为 Local/兼容后端的数据视图，不重复建模型。

## 6. Package Manifest（forge.manifest.json）

基于现有 agenthub.yaml 统一设计（字段全部来自现状 + §5 扩展），权威 JSON Schema：`schemas/forge-package.schema.json`（Phase 1 交付）。

示例（finance-analyst 的归一化形态）：

```json
{
  "schema": "forge.package.v1",
  "id": "finance-analyst",
  "name": "Finance Analyst",
  "type": "agent",
  "version": "0.1.0",
  "description": "把 DeepSeek Harness 变成金融研究与决策支持 Agent。",
  "category": "finance",
  "tags": [],
  "publisher": { "id": "agenthub", "name": "AgentHub" },
  "source": { "type": "forge", "repository": "https://github.com/W117C/deepseek-forge", "ref": "v0.3.0", "commit": null },
  "upstream": { "repository": null, "author": "AgentHub", "license": "MIT", "version": null, "url": null, "adapterVersion": "0.1.0" },
  "license": { "spdx": "MIT", "file": "LICENSE" },
  "compatibility": { "forge": ">=0.4.0", "dsh": { "min": "0.1.0-rc.6", "tested": ["0.1.0-rc.6"] }, "node": ">=22", "platform": ["darwin", "linux"] },
  "capabilities": ["network.http", "environment.read"],
  "permissions": { "network": ["localhost:3111"], "env": [] },
  "security": { "scan": "required", "status": "PASS", "scannedAt": null, "findings": [] },
  "artifact": { "filename": "finance-analyst-0.1.0.tar.gz", "sha256": null, "signature": null, "signatureAlgorithm": "ed25519", "publisherKeyId": "agenthub" },
  "entrypoint": { "type": "harness-profile", "profile": "finance", "command": null, "config": {} },
  "dependencies": [{ "package": "@agenthub/finance-core", "version": "0.1.0", "required": true }],
  "runtime": {
    "engine": "deepseek-harness",
    "profile": { "name": "finance", "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@agenthub/finance-core"], "patch": "./profile.patch.yml" },
    "components": {
      "bundles": [{ "package": "@agenthub/finance-core", "version": "0.1.0" }],
      "presets": [{ "id": "finance-analyst", "base": "standard" }],
      "skills": ["financial-analysis", "company-research"]
    },
    "health": [{ "kind": "dump-config", "expect-rows": ["mcp-market-data", "schedule"] }]
  }
}
```

加载顺序：forge.package.v1（JSON）为权威；legacy agenthub.dev/agent/v1（YAML）经归一化器（Node 侧现有 yamllite 语义 → Rust serde_yaml）转换；GitHub 导入产物一律生成 v1。

## 7. Adapter 架构（隔离 upstream）

每个 Adapter 目录（`adapters/<owner>__<repo>@<adapterVer>/`）：

```
adapter/
├── manifest        # adapter 版本、目标 upstream、生成的 package 类型
├── install         # 把 upstream 落为 forge package 布局的步骤（声明式）
├── configure       # 配置模板
├── healthcheck     # 安装后验证
├── uninstall
└── runtime         # entrypoint 元数据（不进 Forge Core 业务逻辑）
```

Adapter 把 upstream 实现与 Forge Core 解耦；Forge Core 不含任何具体 GitHub 项目逻辑。AI 可生成 Adapter 提案，但执行必须 Analyze → Propose → Validate → **User Approve** → Execute（§9），AI 不得自动执行高风险代码。

## 8. Registry（Local-first）

| Registry | 实现 | 状态 |
| --- | --- | --- |
| Local Registry | `~/.deepseek-forge/registry/`：`registry.json` + `index.json` + `packages/<id>/{package.json, versions/<v>/{manifest,artifact,security,compatibility}.json}` | **Phase 1 唯一必需** |
| Git Registry | GitHub 仓库作 Registry Source（`registry.json` + `packages/`，经 Git 读取，本地缓存） | 随 Import 管线实现 |
| HTTP/Private/Enterprise | 只留 trait 接口，不实现（§12 禁止过度实现） | Future |

现有 `lib/registry-server.mjs` + SQLite：过渡期保留（兼容旧 CLI/forge 与既有 e2e），**不作为** Desktop 的生产依赖；其数据语义是 Local Registry 文件布局的设计参考。

## 9. Source Registry（GitHub 元数据缓存）

`~/.deepseek-forge/registry/sources/<owner>__<repo>.json` 缓存：github_url、owner、license、stars、forks、language、last_updated、releases、dependencies、security_status、forge_compatibility、forge_adapter、package_type、pin(ref/commit)。导入分析结果在此落盘，支持离线复看。

## 10. Installation Engine（Rust Core 核心）

```
Resolve → Download → Verify(sha256) → Signature(ed25519) → Security Check → Dependency Resolution
→ Snapshot → Install → Health Check → Activate
（任一步失败 → Rollback；install/update 共用；event: package.install.*）
```

行为契约 = 现有 lib/installer.mjs 十步管线 + lib/registry-client.mjs 校验序（验哈希→验签→解包）+ blocked/yanked 门禁；Rust 实现逐步骤对齐，e2e 245 项为验收。

## 11. Security System（强化版）

| 扫描面 | 内容 | 与现状关系 |
| --- | --- | --- |
| Files | executable、shell scripts、binary、可疑文件 | 扩展现有 7 规则 |
| Commands | rm -rf、curl|sh、wget|sh、sudo、chmod、launchctl、注册表修改、持久化 | 新增 |
| Network | 外网 URL、域名、API 端点 | 现有 network 规则细化 |
| Secrets | API keys、tokens、私钥、credentials | 现有 secret 规则细化 |
| Permissions | filesystem/network/process/environment/shell 声明 | 现有 permissions 扩展为 capabilities |
| Install scripts | 安装脚本检查（package.json scripts、install.sh 等） | 新增 |
| License | SPDX 检测 + 无许可证阻断 | 新增（Principle 5） |

严重度：Critical/High/Medium/Low/Info；SECURITY_BLOCKED 即停止安装；结果全部落 `security/` 并可解释（哪条规则、哪个文件、第几行）。

## 12. Capability System

标准枚举：`filesystem.read · filesystem.write · network.http · network.websocket · process.spawn · shell.execute · environment.read · browser.control`。Manifest 必须声明；UI 显示 ✓/⚠/✕；**高风险集合**（shell.execute、process.spawn、filesystem.write、browser.control）必须显著警告；扫描发现未声明能力 → 警告并要求确认。

## 13. Trust Model

显示四档：`Unknown / Community / Verified / Trusted`；另有硬门禁状态 `blocked`（不可安装）。计算因子（§17）：source、license、scan、signature、publisher、provenance —— **Star 数不参与 Trust**。legacy 归一化：official→trusted、verified→verified、community→community、blocked→blocked；现有 e2e 的字符串断言经归一化边界保持通过。

## 14. Signature（不变，延续）

SHA256 + Ed25519；canonical payload = `JSON.stringify(manifest) + '
' + sha256hex(artifact)`；publish 本地签名（私钥永不出本机，0600，桌面进 keyring）；install 验哈希→验签→才解包；任一失败 BLOCK。Rust 侧：sha2 + ed25519-dalek 对齐现有语义。

## 15. Composer（桌面核心 UI）

左「Available Components」（Skills/Tools/Plugins/MCP/Workflows，按类型分组）→ 右「Agent Composition」（Add/Remove/Configure/Reorder/Enable/Disable）；自动解析依赖图并**提前发现冲突**（如 Browser→Node≥20 与 某插件→Node<20 冲突、版本重叠）；产出可安装的 agent 包（复用 compose 语义）。

## 16. Runtime（复用 Harness）

Forge 侧：session（start/stop/restart/status）、process（PID/启动时间/所属 package/session/状态）、logs（stdout/stderr，搜索/过滤/复制/导出）、health、tool calls 事件；**执行交给 DeepSeek Harness**（经 lib/dsh 语义适配到 Core 的进程管理）。日志四类：forge / harness / install / security；脱敏（无 API Key/Token/私钥/Authorization 头）。

## 17. Desktop UI

侧栏（§24）：Forge / DISCOVER(Marketplace, GitHub Import) / WORKSPACE(My Agents, My Skills, My Plugins, Bundles) / RUNTIME(Sessions, Processes, Logs) / SYSTEM(Security, Sources, Updates, Settings)。
页面：Dashboard（Runtime 状态/已装包/活跃 Agent/最近会话/更新/安全告警/最近添加，§25）、Package Detail（含 Source/Original Repository/License/Upstream/Forge Compatibility/Security/Capabilities/Dependencies/Installed Version/Changelog/Readme，§26）、Import UI（粘贴 URL → 逐项 ✓ 分析 → Package Proposal{Type/Risk/Capabilities} → [Create Adapter]，§27）、Composer（§15）、Runtime UI（Agent ● Running/Task/Model/Context/Tools/Processes/Duration + Logs/Events/Tool Calls，§29）、Security Center、Sources（Local/Git registry 管理 + Doctor）、Settings（General/Runtime/Registry/Security/Advanced——只放有 backend 支撑的项）。
设计语言（§23）：dark、professional、technical、minimal、高信息密度、细边框、好排版、键盘友好；禁止渐变/花哨动画/SaaS 风/大圆角 —— 直接复用 forge 的 tokens.css/globals.css 风格。

## 18. 本地存储（结合现状约定）

```
~/.deepseek-forge/
├── config/      # config.json（默认 registry、verification policy、默认模型、主题）
├── registry/    # Local Registry + sources/ 缓存（§8/§9）
├── packages/    # 已安装包（唯一落地，不重复存储）
├── cache/       # 制品缓存（按 sha256 命名，自动去重）
├── snapshots/   # 安装/升级快照
├── adapters/    # <owner>__<repo>@<ver>/
├── agents/      # 组合产物（agent workspace）
├── sessions/    # 会话状态
├── logs/        # forge/harness/install/security
└── security/    # 扫描报告缓存
```

迁移：首次启动读旧 `$DSH_HOME/.agenthub/{state.json,keys.json,publisher.json,snapshots/}` 并导入（复制 + 保留旧文件），DSH 的 profile/preset/skills 本体仍留在 DSH_HOME（那是 Harness 的地盘）；`~/.deepseek-forge` 只存 Forge 自己的数据。

## 19. CLI（保留并统一）

现有 20 命令全部保留（行为不变）；新增 `search / inspect / import / validate / security scan / run / logs`（§31）；info↔inspect、health→inspect 提供别名。最终形态：**CLI 与 Desktop 调用同一个 Forge Core**（CLI=薄壳 + 自动化接口），不出现两套 Installer/Security/Registry 逻辑。

## 20. Event System（Core 发出，UI/CLI 订阅）

`package.install.started · package.install.progress · package.install.completed · package.install.failed`、`package.security.started · package.security.completed`、`package.update.*`、`import.analyze.*`、`runtime.started · runtime.stopped · runtime.error · runtime.log · runtime.tool-call`、`registry.*`、`system.update-available`。Tauri 事件通道 + CLI 进度行共用同一枚举。

## 21. Error Model（typed）

禁止 try/catch 静默。所有错误：`code + human message + technical detail + recovery suggestion`。初始枚举：`PACKAGE_NOT_FOUND / VERSION_NOT_FOUND / REGISTRY_UNAVAILABLE / INVALID_MANIFEST / INVALID_SCHEMA / HASH_MISMATCH / SIGNATURE_INVALID / PUBLISHER_UNTRUSTED / SECURITY_BLOCKED / INCOMPATIBLE_VERSION / ARTIFACT_NOT_FOUND / INSTALL_DEPENDENCY_MISSING / RUNTIME_FAILED / LICENSE_MISSING`。示例（§33）：`INSTALL_DEPENDENCY_MISSING → "Node.js >=20 is required." → [Install Dependency] [View Details]`。legacy 字符串错误在边界转换为 typed error。

## 22. Testing

分层：Unit（cargo test + vitest）→ Integration → Security → Package Install → Registry → Rollback → Desktop IPC → E2E。关键链路（必须可自动测试，§34）：

```
GitHub Import → Analyze → Adapter → Package → Install → Verify → Run → Rollback
```

用本地 fixture 仓库（file:// git repo）+ mock GitHub API 实现自动化；手动真实 GitHub 冒烟文档化。既有 18 套 e2e / 245 项**一个不减**，作为新旧实现共同验收（§35/§36）。

## 23. MVP（第一版验收链）

安装 → 打开 Desktop → Search → Import GitHub Repo → Analyze → Security Scan → Create Adapter → Install Package → Create Agent → Add Skill/Tool/Plugin → Run Agent → View Logs → Uninstall → Rollback。**这条链完整才算 MVP**（§38）。

## 24. 明确不做（Anti-scope，§39/§0）

不做：公网 Registry Server、HTTP Registry 实现、云服务、账户/支付/社交/推荐、自己生产大量插件、mock backend 冒充、fake runtime 冒充 Harness 已连接、无真实功能的页面、重写现有功能、Desktop 与 CLI 两套 Installer、UI 直接 shell、硬编码 Key、secret 进前端、忽略 License、隐藏 upstream、打包无许可证代码。
