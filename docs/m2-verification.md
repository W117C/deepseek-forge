# M2 验证报告：最小 Registry + 签名 + 远端安装 + 多 Agent 共存

> 运行时间：2026-08-14。环境：node v22.23.2，dsh 0.1.0-rc.6，隔离 DSH_HOME。
> 复现：node test/e2e-registry.mjs（20）+ node test/e2e-multi.mjs（20）+ node test/e2e-pnpm.mjs（9）+ node test/e2e-lifecycle.mjs（21）。

## 结果：70/70 PASS（e2e-registry 20 + e2e-multi 20 + e2e-pnpm 9 + e2e-lifecycle 21）

### 多 Agent 共存（e2e-multi）

- finance-analyst 与 academic-researcher 同装一个 DSH_HOME：两个 profile（finance/research）、两个 preset、4 个 skills 共存。
- 组合树隔离：finance 树含 mcp-market-data 不含 mcp-papers，research 反之；两者均启用 fetch。
- **单点回滚不伤及另一款**：回滚 finance 后 research 的 profile/preset/skills 全部完好。
- research profile 启动冒烟 PASS（12s，port 3998）。

### Registry 全链路（e2e-registry）

| # | 验证点 | 结果 |
|---|---|---|
| 1 | agenthub keygen 生成 ed25519 发布者密钥（0600） | PASS |
| 2 | agenthub publish → 服务端验签 + 验哈希入库 | PASS（HTTP 200 published） |
| 3 | GET /v1/agents 目录（2 款 Agent） | PASS |
| 4 | agenthub install <id> --registry：客户端验签 + 验哈希 + 解包 + 本地安装 + 健康检查 | PASS |
| 5 | 远端安装的组合树验证（dump-config 含 bundle 行） | PASS |
| 6 | 远端安装的 trust/score 记录 | PASS（official / 99） |
| 7 | **篡改制品（替换 tgz）→ 哈希不匹配 → 安装阻断** | PASS |
| 8 | **篡改注册表签名 → 验签失败 → 安装阻断** | PASS |
| 9 | 恢复制品后远端安装成功 | PASS |
| 10 | 远端安装的 Agent 可回滚 | PASS |

### 本轮工程要点（真实开发记录）

- **死锁教训**：e2e 里用 spawnSync 调 CLI 会阻塞父进程事件循环，使同进程内的 Registry 服务器无法应答 CLI 子进程的 HTTP 请求。改用异步 spawn 解决（已注释入 e2e-registry.mjs）。
- 签名方案：ed25519（node:crypto，零依赖）；规范负载 = JSON.stringify(manifest) + 换行 + sha256hex(artifact)；发布者公钥 trust-on-first-use（同一 publisher 的 key 不一致 → 409 拒绝）。
- 客户端安全顺序：先验哈希（防传输/存储篡改）→ 再验签（防发布者伪造）→ 才解包执行安装；任一步失败即阻断并回滚（安装器自带快照）。
- 第二款 Agent 复用第一款模板生成（cp + persona/skills/patch 替换），说明 Agent 供给成本低、可批量复制。

### 本轮加固（服务端扫描 + 信任定级 + 官方路径）

- **服务端不再信任自报 trust**：publish 时对制品实体解包并运行静态扫描（score/verdict/findings 入库）；信任定级 = 官方发布者白名单（officialPublishers，默认 ['agenthub']）+ 扫描结论（verdict=block → trust=blocked；非白名单 → community）。
- **恶意包端到端阻断（e2e 实测）**：构造含 !!js + execSync + 外网 URL 的夹具 → 服务端扫描 40 分/2 高危 → trust=blocked → 客户端 fetchAgent 直接拒绝安装。
- **search / versions 端点**：GET /v1/search?q=、GET /v1/agents/:id/versions（含各版本 scan 记录）。
- **官方 dsh plugin 路径回归（e2e-pnpm 9/9）**：pnpm 11.21.0 下 dsh plugin add file: → 官方对账自动写入 dsh.profile.bundles → dump-config 验证 → remove 对账移除 → 复装。安装器已改为 **pnpm 官方路径优先、无 pnpm 复制兜底**。

### 版本生命周期 + 社区目录 + Web 薄片（e2e-lifecycle 21/21）

- **多版本发布**：同一 Agent 可发布多个版本；/v1/agents/:id/versions 每版本带 manifest+signature+scan；`install --version 0.1.0` 钉选安装（fetchAgent 解包到版本化目录，杜绝旧链接被新内容污染）。
- **`agenthub update`**：本地版本对比 → 新版拉取（验签+验哈希）→ 安装 → 失败自动回滚；重复升级提示已最新。
- **升级回滚**：快照记录旧状态 + 解引用 bundle 实体；rollback 后本地版本回到 0.1.0 且组合树无新版行（e2e 断言）。
- **`agenthub info`**：本地安装状态 + Registry 远端版本/信任/扫描信息。
- **社区目录（ingest）**：POST /v1/ingest 收录 {name, source, description, category}；/v1/search 合并 agent+plugin；安装社区插件需显式 `--trust community`（信任门禁），装法走官方 `dsh plugin add <source>`，可回滚。
- **极简 Web 首页（M3 薄片）**：GET / 返回 Marketplace 页面（Agent 列表 + 社区插件列表 + 搜索框 + 安装命令），e2e 断言含 Agent 名称。

**本轮工程教训**：
- pnpm `add file:` 对同名跨路径升级不刷新已装内容（缓存目录）→ 改用 `link:` 规格 + `dsh plugin install`（符号链接永远解析最新目录）。
- Node `cpSync dereference` 不解引用目录内部符号链接 → 自写 copyDeref 递归展开（回滚后 bundle 实体为真实内容，不依赖可能被删除的链接目标）。

### 已知边界（M2 有意不做的）

- Registry 为单进程内存+JSON 文件存储（无鉴权/无并发写锁/无 CDN）——M3 服务端化时替换为 PostgreSQL+S3。
- 信任等级目前随 manifest.trust 自报（official 自维护包）；第三方包的 Verified 需要服务端扫描流水线（M2 后续）。
- 远端安装的制品保留在 .agenthub/fetch/，重复安装会重新拉取（无本地缓存/去重）。
