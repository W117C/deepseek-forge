# M1 验证报告：finance-analyst 本地闭环

> 运行时间：2026-08-14。环境：node v22.23.2，dsh 0.1.0-rc.6（npx 安装实例），隔离 DSH_HOME=.e2e-home。
> 复现：`node test/e2e.mjs`（全部 27 项断言，exit 0）。

## 结果：27/27 PASS

| # | 验证点 | 结果 | 证据 |
|---|---|---|---|
| 1 | 安装前安全扫描无高危 | PASS | 0 高危 / 0 中危 / 1 低危（官方平台判断白名单）/ 99 分 / verdict=pass |
| 2 | 一键安装全流水线 | PASS | compatibility → security-scan → snapshot → init-profile → install-bundles → install-presets → install-skills → merge-patch → save-state → health-check |
| 3 | 装后健康检查 | PASS | `dsh --profile finance --dump-config` 退出码 0，含 mcp-market-data 与 schedule 行 |
| 4 | profile manifest | PASS | `dsh.profile.bundles = [dsh-base, dsh-web-app, @agenthub/finance-core]` |
| 5 | bundle 覆盖生效 | PASS | dump-config 中 tool-web `fetch: true`（bundle 层覆盖了默认的 fetch:false） |
| 6 | preset 安装 | PASS | `$DSH_HOME/.agent-presets/finance-analyst/` + preset.yml 显示名「金融分析师」 |
| 7 | preset 差异约束 | PASS | 与官方 standard 仅 persona 与 fetch 两处差异（含 text 块风格） |
| 8 | skills 双落点 | PASS | `$DSH_HOME/skills/{financial-analysis,company-research}/SKILL.md` + preset 目录内副本 |
| 9 | profile patch 合并 | PASS | `cordis.patch.yml` 含 agenthub 托管段且 YAML 合法（单个文档根 `[]`） |
| 10 | 状态与信任记录 | PASS | `.agenthub/state.json` 记录版本/快照/权限/trust/安全分 |
| 11 | 真实启动冒烟 | PASS | `dsh --profile finance --port 3999` 存活 15s、无致命日志（`dsh web: http://127.0.0.1:3999`） |
| 12 | 回滚 | PASS | profile / preset / skills 全部移除，状态清空 |
| 13 | 重装可重复 | PASS | 二次安装健康检查 PASS |

## 尚待验证（需要模型 API key，健康检查中记为 WARN 的能力面）

- 真实会话对话（persona 生效、`web_search`/`web_fetch` 调用、`mcp__marketdata__*` 工具、`subagent_fork` 多分析师、`schedule_create`）——机制层已全部安装并可通过 dump-config/boot 验证，模型层留待有 DEEPSEEK_API_KEY 的环境跑 headless 冒烟。

## 本轮修复记录（真实开发过程）

- 零依赖 JS 中的 `'\n'` 字面量被写成真实换行 → 逐个修复并加 `node --check` 全量门禁。
- 迷你 YAML 解析器：列表项 map 栈处理、map 占位→list 就地转换、流式数组/映射（未加引号标量）。
- 安全扫描：localhost/回环 URL 不算外网；官方 `!!js process.platform === 'win32'` 惯用法白名单（低危提示，不计高危）。
- patch 合并：过滤占位 `[]`，保证最终文件恰好一个 YAML 文档根（官方解析器要求）。

## 关键机制确认（对计划文档 §1 的实测背书）

- Bundle = 声明 `dsh.bundle.patch` 的 npm 包，复制进 `profiles/node_modules/` 即成为 profile 层（无 pnpm 也可装）。
- Agent Preset 目录写入 `$DSH_HOME/.agent-presets/` 即可被 roster 发现。
- `--dump-config` 是无模型依赖的组合树验证口（health 检查基础）。
- 官方解析器接受「`[]` + 注释托管段」的 patch 文件形态。
