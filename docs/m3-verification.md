# M3 验证报告：Marketplace Web（服务端渲染）+ 评分/安装计数 + 社区目录实况收录

> 运行时间：2026-08-14。零依赖服务端渲染（lib/webui.mjs），无前端构建步骤。
> 复现：node test/e2e-web.mjs（19 项）。

## 结果：19/19 PASS

| # | 验证点 | 结果 |
|---|---|---|
| 1 | ingest 自适应 Alex 格式（categories+plugins） | PASS（55 条实况数据实测） |
| 2 | ingest 自适应 bruc3van 格式（repositories，topic:dsh-plugin 1123 仓库） | PASS（限 50 条实测，去重后共 101 条） |
| 3 | 首页按领域分类（manifest.category） | PASS（金融 Finance / 学术 Academic） |
| 4 | 首页 Agent 卡片（名称/描述/信任/安全分/安装数/评分/安装命令） | PASS |
| 5 | 首页社区插件区（计数 + 前 20 展示） | PASS |
| 6 | 详情页（描述/安全分/网络权限/版本表/安装命令/包含组件） | PASS |
| 7 | 匿名安装计数（POST /v1/installations，客户端安装成功后上报） | PASS（installs=1→2） |
| 8 | 首页按安装数排序 | PASS |
| 9 | CLI rate 评分 + 详情页平均分展示（5+4→4.5） | PASS |
| 10 | /v1/search 合并 agent + 收录插件 | PASS |

## 实况收录（真实社区数据，非夹具）

- Alex-Yanggg/awesome-DSH-plugin catalog/plugins.json：55 条全部收录（source 归一化为 github:owner/repo）。
- bruc3van/awesome-dsh-plugin data/repositories.json：1123 个 topic:dsh-plugin 仓库，实测限 50 条收录，4 条与 Alex 去重，最终 101 条。
- 收录后首页/搜索即可浏览真实社区插件，安装走官方 dsh plugin add github:...（需 --trust community）。

## 本轮追加（审核队列 + 评分限流 + 开发者脚手架，e2e-registry 25 + e2e-dev 14）

- **审核队列**：非官方白名单发布者 publish → HTTP 202 排队（服务端扫描结论保留）；/v1/pending 查询、/v1/review approve/reject；审批前安装不可见（404）；审批后按扫描定级上架（blocked 仍被客户端拒绝）；拒绝流删除制品与记录。e2e 全路径覆盖。
- **评分限流**：ip+agent 10 分钟窗口最多 5 次（第 6 次 429），防刷初版。
- **`agenthub create`**：一键生成 Agent 脚手架（manifest + bundle 包 + 官方 standard 派生 preset（persona 占位）+ hello-skill + profile patch + README）；生成的 Agent 可本地安装（健康 PASS + 组合树含 hello-row）→ 发布进审核队列 → 审批 → 远端安装 → 回滚（e2e-dev 14/14）。
- **生产化设计文档**：docs/registry-production.md（PostgreSQL 数据模型 / S3 制品 / 多实例一致性 / 上线安全清单 / 部署形态）。

## 本轮追加（端点鉴权 + 幂等 + 交互确认，e2e-auth 7 + e2e-prompt 5）

- **发布/审核鉴权**（配置开启）：`requirePublisherAuth` 下 publish 需发布者令牌（publisher-register 幂等发令牌，CLI 自动存储并携带）；冒用他人令牌 401；`operatorToken` 下 /v1/review 无令牌 401。
- **安装上报幂等**：客户端每次安装携带随机 eventId，Registry 24h 窗口去重，重复上报不重复计数。
- **交互式确认**：install/update 无 --yes 时显示写入路径 + 权限声明 + trust 后询问 [y/N]；n/空输入取消，y 执行（stdin 可管道化，CI 友好）。

## 本轮追加（Agent Builder + 下载限速 + 部署文档，e2e-compose 13 + e2e-auth 8）

- **Agent Builder（最小实现）**：`agenthub compose <名称> --from A --from B` 生成组合 Agent——bundles/presets/skills/网络权限/健康行全部取并集，冲突（同名 preset / 同名 bundle 不同源 / 缺 skill）显式报错；组合 Agent 可本地安装（两个数据 seam 同树、两个 preset、4 skills）、发布、回滚（e2e-compose 13/13）。
- **制品下载限速**：per-ip 每分钟 10 次制品下载，第 11 次 429（e2e-auth 8/8）。
- **公测部署文档**：docs/deployment.md（Caddy TLS 拓扑、安全开关、密钥运维、备份监控、上线清单）。

## 本轮追加（签名 URL + CLI 安全开关 + 备份恢复 + Builder 设计，e2e-auth 14 + e2e-backup 7）

- **制品签名 URL（防盗链）**：artifactSecret 配置后，detail 与 versions 端点逐版本返回 HMAC 签名 URL（5 分钟有效）；无签名/篡改签名下载 403，有效签名 200（e2e 实测三种状态）；客户端自动使用目标版本的签名 URL（修复了版本钉选安装误用最新版 URL 的回归）。
- **Registry CLI 安全开关透传**：`agenthub registry <dir> --require-publisher-auth --operator-token <t> --artifact-secret <s>`（或环境变量），启动日志回显各开关状态，e2e 子进程实测强制发布鉴权 401。
- **备份/恢复**：scripts/backup.sh + restore.sh（tar 数据目录）；e2e-backup 7/7（备份→删除→恢复→元数据/制品/签名完整可用）。
- **Agent Builder 图形化设计稿**：docs/agent-builder-design.md（Web 组合页形态、服务端 /v1/compose 方案、与 CLI 共用合并核心、里程碑建议）。

## 本轮追加（服务端组合 + Builder 页面，e2e-compose-server 11/11）

- **POST /v1/compose**：服务端从已发布 Agent 的解包制品组合（复用 CLI compose 合并核心）；JSON 请求返回组合摘要 + tgz base64，表单请求直接返回 gzip 附件下载；blocked 来源 403、未知来源 404、ids<2 400（全部 e2e 覆盖）。
- **GET /compose Builder 页面**：勾选已发布 Agent（显示信任/安全分/领域）→ 填名称/领域/发布者 → 生成下载；首页新增「🧬 组合 Agent」入口。
- 组合包下载后走 agenthub install 完整安全链（本地 e2e 验证：组合树含两个数据 seam、健康 PASS）。

## 本轮追加（组合一键发布闭环，e2e-compose-publish 9/9）

- **`agenthub compose-server <名称> --ids a,b --registry <url> [--publish]`**：服务端组合 → 下载解包到本地（可本地安装）→ `--publish` 时用本地私钥签名 + 发布者令牌直发（白名单发布者 200 上架，非白名单走审核队列）。
- 组合 Agent 定级随发布者（官方白名单 → official）；远端安装验签验哈希全链路正常；组合树含两个数据 seam；可回滚。
- 发布逻辑已重构为 doPublish 复用于 publish 与 compose-server（消除重复）。

## 本轮追加（组合引导 + 综合排名，e2e-web 24/24）

- **组合引导闭环**：详情页新增「🧬 组合此 Agent」入口（/compose?ids=<id>），Builder 页按查询参数预选复选框。
- **综合排名（M3 初版）**：rankScore = 安装数 + 评分×20 + 安全分×0.5 + 信任加成（official 50 / verified 30 / community 10）；/v1/agents 按 rankScore 排序并返回该字段，首页卡片显示综合分并按其排序（e2e 实测 finance 192 vs academic 101——安装+评分+安全+信任全部计入）。

## 本轮追加（模型层冒烟——最后的验证缺口闭合，e2e-smoke 4/4）

- **mock LLM 适配器**（bundles/test-fixtures/mock-llm，真正的 Cordis 插件）：注册 `mock` provider 路由，按 LlmAdapter 契约实现 providerInfo/listModels/resolveModel/stream（零依赖实现——link: 安装的 bundle 源码目录无法解析宿主依赖，运行时按鸭子类型调用）。
- **真实 headless 会话执行**：冒烟 Agent（headless profile + finance 组合 + patch 挂载适配器行并把默认模型路由切到 mock）→ `dsh --profile smoke ping` → agent loop 运行 → 输出 MOCK-OK → 退出码 0 → 会话持久化（sessions 0→1）。
- 至此**完整链路已验证到模型层**：选领域 → 装 Bundle → 组合树 → 启动 → agent loop 执行 → 会话落盘。剩余仅为真实模型智能（需 DEEPSEEK_API_KEY），属部署质量项而非机制缺口。
- **真实 bug 修复**：mergeProfilePatch 模板判断忽略注释头（此前带注释的模板永不命中 `[]` 分支，真实行与 `[]` 混排导致官方解析器报错）——e2e-smoke 的真实行 patch 触发并修复。
- **Cordis 插件要点沉淀**：inject 声明（`mockLlm.inject = ['llm']`）、适配器契约方法完整性（providerRetryPolicy 等）、link: bundle 的依赖解析限制。

## 设计说明与已知边界

- Web 层为服务端渲染（无 React 构建）：与计划中 React+Vite 的偏差是有意为之——零依赖、无构建、与 Registry 同进程；后续如需复杂交互再迁移。
- 安装计数为匿名事件（无用户标识），客户端默认上报、--no-telemetry 可关。
- 评分无鉴权（M3 为排名信号原型；M4 接入账号体系后加防刷）。
- ingest 上限：bruc 格式默认 100 条（--limit 可调），防止单次收录过载。
