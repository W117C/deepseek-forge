# DeepSeek Forge — 组件操作系统（Component OS）进度

> 新目标：Desktop-first 的 AI Agent 开源组件操作系统——收录、审核并标准化 GitHub 上优秀的
> Plugins/Skills/MCP/Tools，一键安装、组合、配置、更新、回滚、卸载，快速搭建自己的 Agent。

## 能力矩阵（全部真实实现，无 Mock）

| 能力 | 实现 | 验证 |
| --- | --- | --- |
| 收录（多类型） | curate-ecosystem.mjs：真实生态数据（1025 条）按 topics 分类 plugin/mcp/skill/tool + license 管线（raw 文本识别 → API → 诚实 NOASSERTION） | Registry 50 包（plugin 24/mcp 8/skill 8/tool 8/agent 2），37 个真实 SPDX |
| 审核 | state set-review（pending/approved/rejected）+ 强制语义（组合安装/更新拒绝未批准组件）+ 桌面批准/拒绝 UI | e2e-updates 32/32 |
| 标准化 | adapter propose/generate（规则型骨架）+ registry import LICENSE 检测（官方 Agent MIT）+ 诚实人工门禁标注 | 冒烟：骨架目录生成 |
| 一键安装 | 收录式（克隆→扫描→LICENSE 门禁→登记，实时进度事件流）+ artifact 完整管线（哈希→验签→快照→安装→健康） | e2e-updates/compose-agent |
| 组合 | bundle create/list/install/uninstall + composer generate（生成可运行领域 Agent，dump-config 证明 bundle 合并） | e2e-compose-agent 15/15 |
| 配置 | agent-config get/set（真实读写 profile cordis.patch.yml，经 Rust Core） | e2e-compose-agent 6 项断言 |
| 更新/回滚/卸载 | update check/apply（新版本重新审核）+ 自动回滚 + 手动 rollback + used-by 拦截卸载 | e2e-updates 32/32、parity 33/33 |
| 桌面 | Marketplace/详情/My Plugins/Bundles/Updates/Activity/Sources/命令面板/中英文 | CI 7/7（6e96e74） |

## 待办
- 11 个社区条目 license 为诚实 NOASSERTION（自定义/非常规许可文件），GitHub API 配额恢复后重跑 curation 补采。
- CI 07d23f3 一轮出现 4 job 失败（本地 mac 全绿 + windows 交叉检查通过），日志待 API 配额恢复后拉取定位。
