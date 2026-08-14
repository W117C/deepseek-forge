# Desktop MVP 计划 —— 从 UI 原型到真正的 Plugin Manager

> 依据最新目标（§44 真正的 MVP 25 项闭环）。先审计，后按 STEP 3-18 增量执行。

## 1. Current Architecture（现状，已核实）

- **Rust Forge Kernel（crates/forge-core）**：Package 模型（7 类型）/manifest v1/Local Registry（目录式，SemVer）/安装引擎（十步管线+快照回滚）/签名/扫描/导入分析（GitHub clone）/Adapter（rules+AI 接口）/Composer（拓扑+冲突）/Runtime（状态/会话/进程/日志捕获）/updater（版本对比）/logutil（三类日志）。
- **Node 委托桥**：lib/installer/signing/security → forge-core 二进制；19 套 e2e 断言不变全绿。
- **Tauri 桌面（desktop/）**：typed IPC（registry_list/info/versions/get_version、import_analyze、adapter_propose、composer_resolve、state_list、package_rollback、update_check、runtime_status/stop/restart/run、logs_list）；页面：Dashboard/Import/Composer/Agents/Sessions/Processes/Logs/Security/Sources/Updates/Settings。
- **缺**：Marketplace 页（sidebar 里是 Placeholder"Phase 4"）、My Plugins 页（Placeholder）、插件详情页、安装进度 UI、卸载确认+使用方警告、Bundle 创建/一键装/一键卸、依赖使用追踪（used-by）、Update 执行、Activity、i18n（中英）、⌘K、Disable/Enable。

## 2. Existing Features（可直接复用）

registry IPC 全家、真实 Install（Rust 管线）、rollback、update check 数据、composer resolve、三类日志、真实运行时数据、Empty/Loading/Error 组件（states.tsx/Dashboard 模式）、forge 设计 tokens。

## 3. Missing Components（按目标清单）

见 §1"缺"列表 + Marketplace 的 search/filter/sort/featured/security badge/capabilities 展示。

## 4. Migration Plan（STEP 3-18 映射）

| STEP | 内容 | 落点 |
| --- | --- | --- |
| 1-2 | 本审计 | 本文件 |
| 3 | 真实 Registry 数据 ✅ | scripts/curate-ecosystem.mjs：从 deepseekdocs.com/ecosystem 内嵌 JSON 提取 listed 条目（真实 name/desc/repo/owner/category/stars），GitHub API 拉真实 license → 写入 ~/.deepseek-forge/registry/packages/*/package.json（forge.package.v1，source=github，upstream 完整 provenance，license 真实） |
| 4 | Marketplace 页 ✅ | desktop Marketplace.tsx：真实 registry_list → 搜索 + 分类 + 排序（Popular=stars）+ 已安装过滤 + 卡片（name/desc/version/stars/license/category/security/install 状态，真实扫描结论） |
| 5 | Plugin Detail ✅ | 详情页：全部元数据 + provenance + capabilities + 安全 + Install/Uninstall（收录式安装，诚实标注）+ used-by |
| 6 | 真实 Install ✅ | IPC install_package(id)：registry 条目有 artifact → install-from-registry；无 artifact 的 GitHub 源 → 收录式安装（clone→scan→LICENSE 门禁→state 登记→日志），步骤流由 Core 返回并展示 |
| 7-8 | My Plugins / Uninstall ✅ | 真实 state_list + uninstall 确认弹窗 + used-by 拦截（dependents 反向依赖） |
| 9 | Dependency Tracking ✅ | dependents 命令（state dependencies 声明 + Bundle components）+ UI 拦截卸载；import-github 登记 dependencies |
| 10-11 | Bundle Composer + 装/卸 ✅ | bundle create/list/install/uninstall（Rust bin + IPC）；Composer 页名称输入/Create Bundle/Install All/Uninstall |
| 12 | Updates ✅ | update check 纳入 plugin；update apply（plugin/imported 重新收录；artifact 走 install-from-registry）；Updates 页 Update/Update All |
| 13 | Activity ✅ | Dashboard 最近活动（logs_list 真实聚合）+ 真实更新数/会话数 |
| 14 | Security UX 🔄 | capabilities 人类化标签（中英）+ 扫描结论徽章已接入；风险徽章随扫描数据接入 |
| 15 | Empty/Loading/Error ✅ | 全页面四态 + i18n（默认中文/可切英文）+ ⌘K 命令面板 + 设置页语言切换 |
| 16-18 | 全量测试 + Desktop build + E2E 🔄 | cargo test 52/52 + e2e-updates 11/11 + e2e-smoke 4/4 + e2e-registry 25/25；全量 19 套件 Gate 由 CI 执行 |

## 5. 纪律

每 STEP：修改→cargo test→tsc→desktop build→e2e→commit。不 mock、不伪造（curated 数据全部来自生态页真实条目 + GitHub 真实 license）。
