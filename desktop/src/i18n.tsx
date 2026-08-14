// i18n：中英文切换（默认中文）。字典逐步覆盖全部页面；未覆盖键回退英文键名。
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type Locale = "zh" | "en";

const DICT: Record<string, { zh: string; en: string }> = {
  "nav.discover": { zh: "发现", en: "Discover" },
  "nav.workspace": { zh: "工作区", en: "Workspace" },
  "nav.runtime": { zh: "运行时", en: "Runtime" },
  "nav.system": { zh: "系统", en: "System" },
  "nav.dashboard": { zh: "总览", en: "Dashboard" },
  "nav.marketplace": { zh: "插件市场", en: "Marketplace" },
  "nav.import": { zh: "GitHub 收录", en: "GitHub Import" },
  "nav.agents": { zh: "我的 Agent", en: "My Agents" },
  "nav.skills": { zh: "我的技能", en: "My Skills" },
  "nav.plugins": { zh: "我的插件", en: "My Plugins" },
  "nav.bundles": { zh: "组合", en: "Bundles" },
  "nav.sessions": { zh: "会话", en: "Sessions" },
  "nav.processes": { zh: "进程", en: "Processes" },
  "nav.logs": { zh: "日志", en: "Logs" },
  "nav.security": { zh: "安全", en: "Security" },
  "nav.sources": { zh: "来源", en: "Sources" },
  "nav.updates": { zh: "更新", en: "Updates" },
  "nav.settings": { zh: "设置", en: "Settings" },
  "mp.title": { zh: "插件市场", en: "Marketplace" },
  "mp.subtitle": { zh: "从开源社区收录的能力，安装到你的 Agent 工作区。", en: "Capabilities curated from the open-source community." },
  "mp.search": { zh: "搜索插件、技能、MCP…", en: "Search plugins, skills, MCP…" },
  "mp.all": { zh: "全部", en: "All" },
  "mp.sort.popular": { zh: "热门", en: "Popular" },
  "mp.sort.recent": { zh: "最近更新", en: "Recently Updated" },
  "mp.sort.az": { zh: "A-Z", en: "A-Z" },
  "mp.install": { zh: "安装", en: "Install" },
  "mp.installing": { zh: "安装中…", en: "Installing…" },
  "mp.installed": { zh: "已安装", en: "Installed" },
  "mp.imported": { zh: "已收录", en: "Imported" },
  "mp.importedNote": { zh: "源码已收录并完成安全扫描；适配为可运行 Forge 包是后续步骤。", en: "Source imported and scanned; adapting to a runnable Forge package is a later step." },
  "mp.retry": { zh: "重试", en: "Retry" },
  "mp.loading": { zh: "正在加载插件…", en: "Loading packages…" },
  "mp.loadFailed": { zh: "无法加载 Registry。", en: "Failed to load registry." },
  "mp.empty": { zh: "没有符合条件的插件。", en: "No packages match." },
  "mp.license": { zh: "许可", en: "License" },
  "mp.source": { zh: "来源", en: "Source" },
  "mp.security": { zh: "安全", en: "Security" },
  "mp.unknown": { zh: "未知", en: "Unknown" },
  "mp.unscanned": { zh: "未扫描", en: "Unscanned" },
  "mp.capabilities": { zh: "能力", en: "Capabilities" },
  "mp.version": { zh: "版本", en: "Version" },
  "mp.openSource": { zh: "开源", en: "Open Source" },
  "common.cancel": { zh: "取消", en: "Cancel" },
  "common.confirm": { zh: "确认", en: "Confirm" },
  "common.failed": { zh: "失败", en: "Failed" },
  "common.success": { zh: "成功", en: "Success" },
  "common.details": { zh: "详情", en: "Details" },
  "common.comingSoon": { zh: "即将推出", en: "Coming Soon" },
  "common.comingSoonBody": { zh: "该模块尚未实现；不会伪装成可用功能。", en: "This module is not implemented yet; it will not pretend to be functional." },
  "updates.title": { zh: "更新", en: "Updates" },
  "updates.subAvailable": { zh: "本地 Registry 中有 {n} 个可更新项。", en: "{n} update(s) available in the local registry." },
  "updates.subNone": { zh: "本地 Registry 中没有可用的更新。", en: "No updates available in the local registry." },
  "updates.update": { zh: "更新", en: "Update" },
  "updates.updateAll": { zh: "全部更新", en: "Update All" },
  "updates.updating": { zh: "更新中…", en: "Updating…" },
  "updates.upToDate": { zh: "已是最新", en: "Up to date" },
  "updates.available": { zh: "可更新", en: "Update available" },
  "updates.nothingInstalled": { zh: "尚未安装任何内容", en: "Nothing installed" },
  "updates.nothingBody": { zh: "已安装的包会在这里与本地 Registry 对比。", en: "Installed packages will be compared against the local registry here." },
  "updates.applied": { zh: "已更新", en: "Updated" },
  "plugins.subtitle": { zh: "已安装 / 已收录的插件（与 CLI 共享状态库）。", en: "Installed / imported plugins (shared state store with the CLI)." },
  "plugins.emptyTitle": { zh: "还没有安装插件", en: "No plugins installed yet" },
  "plugins.emptyBody1": { zh: "去市场看看", en: "Browse the marketplace" },
  "plugins.emptyBody2": { zh: "，收录/安装你需要的开源能力。", en: " and import the open-source capabilities you need." },
  "plugins.imported": { zh: "已收录（源码+扫描）", en: "Imported (source + scan)" },
  "plugins.installed": { zh: "已安装", en: "Installed" },
  "plugins.uninstall": { zh: "卸载", en: "Uninstall" },
  "plugins.confirmUninstall": { zh: "确定卸载 {id}？该插件将从本地 Forge 环境移除登记。", en: "Uninstall {id}? Its registration will be removed from the local Forge environment." },
  "plugins.blockedByDependents": { zh: "无法卸载：仍被以下依赖使用（先卸载或调整它们）", en: "Cannot uninstall: still used by these dependents (remove or adjust them first)" },
  "plugins.usedBy": { zh: "被 {n} 项依赖", en: "Used by {n}" },
  "plugins.score": { zh: "安全评分", en: "Security score" },
  "pd.description": { zh: "描述", en: "Description" },
  "pd.openSource": { zh: "由开源社区驱动", en: "Powered by Open Source" },
  "pd.originalAuthor": { zh: "原作者", en: "Original Author" },
  "pd.lastUpdated": { zh: "最近更新", en: "Last Updated" },
  "pd.dependencies": { zh: "依赖", en: "Dependencies" },
  "pd.noDeps": { zh: "无依赖。", en: "No dependencies." },
  "pd.readme": { zh: "README / 变更日志", en: "README / Changelog" },
  "pd.readmeEmpty": { zh: "收录条目暂未抓取 README；可点击上方 GitHub 链接查看原文。", en: "No README captured for this entry yet; open the GitHub link above." },
  "pd.capsEmpty": { zh: "（收录条目未经适配，暂无能力声明）", en: "(Not yet adapted; no capability declaration.)" },
  "pd.importedResult": { zh: "已收录 ✓ 流程：", en: "Imported ✓ steps:" },
  "co.subtitle": { zh: "从本地 Registry 组合包，解析依赖图并一键安装。", en: "Combine packages from the local registry into an agent composition." },
  "co.available": { zh: "可用组件", en: "Available" },
  "co.empty": { zh: "本地 Registry 为空 —— 先收录一个项目。", en: "Local registry is empty — import a project first." },
  "co.composition": { zh: "当前组合", en: "Composition" },
  "co.selectHint": { zh: "在左侧选择包。", en: "Select packages on the left." },
  "co.resolve": { zh: "解析依赖", en: "Resolve" },
  "co.bundleNamePlaceholder": { zh: "组合名称（如 Research Stack）", en: "Bundle name (e.g. Research Stack)" },
  "co.createBundle": { zh: "创建组合", en: "Create Bundle" },
  "co.bundles": { zh: "我的组合", en: "Bundles" },
  "co.installAll": { zh: "一键安装", en: "Install All" },
  "co.confirmUninstall": { zh: "确定卸载组合 {id}？其组件登记将被移除（被其他组合引用的组件需单独处理）。", en: "Uninstall bundle {id}? Its component registrations will be removed (components referenced by other bundles need separate handling)." },
  "co.dependencyGraph": { zh: "依赖图", en: "Dependency graph" },
  "co.generateAgent": { zh: "生成 Agent 并安装", en: "Generate Agent & Install" },
  "co.generating": { zh: "生成中…", en: "Generating…" },
  "co.agentGenerated": { zh: "Agent 已生成并安装：{id}（Profile {profile}）。到 My Agents 点击 Run 即可运行。", en: "Agent generated and installed: {id} (profile {profile}). Go to My Agents and press Run." },
  "co.agentOnlyHint": { zh: "只有已适配（带运行 bundle）的 Agent 组件能组合成可运行 Agent；收录式插件需先经 Adapter 适配。", en: "Only adapted Agent components (with runnable bundles) can be composed into a runnable agent; curated imports need adaptation first." },
  "co.installNote": { zh: "组合产物安装走 Rust Kernel 完整管线（哈希→验签→扫描→快照→安装→健康）；图形化 Agent 构建器的组合落盘在后续接入。", en: "Bundle installs run the full Rust Kernel pipeline (hash → signature → scan → snapshot → install → health); the visual agent builder lands in a later step." },
  "im.subtitle": { zh: "分析开源项目，评估其成为 Forge 包的可行性。全程不执行第三方代码。", en: "Analyze an open-source project before it becomes a Forge package. Nothing is executed." },
  "im.placeholder": { zh: "https://github.com/owner/repo 或本地目录路径", en: "https://github.com/owner/repo or a local directory path" },
  "im.analyze": { zh: "分析", en: "Analyze" },
  "im.localHint": { zh: "分析会把源码克隆到本地缓存（不执行第三方代码）。", en: "Analysis clones source into a local cache (no third-party code is executed)." },
  "im.risk": { zh: "风险", en: "Risk" },
  "im.license": { zh: "许可", en: "License" },
  "im.language": { zh: "语言", en: "Language" },
  "im.entryPoint": { zh: "入口", en: "Entry point" },
  "im.forgeCompat": { zh: "Forge 兼容", en: "Forge compatibility" },
  "im.noLicense": { zh: "未检测到许可证。Forge 拒绝收录无许可代码（Principle 5）。", en: "No license detected. Forge refuses to package unlicensed code (Principle 5)." },
  "im.capsSecurity": { zh: "能力与安全", en: "Capabilities & security" },
  "im.networkRefs": { zh: "{n} 处网络引用", en: "{n} network reference(s)" },
  "im.fsWrites": { zh: "{n} 处文件写入", en: "{n} filesystem write(s)" },
  "im.envVars": { zh: "{n} 个环境变量", en: "{n} environment variable(s)" },
  "im.dangerous": { zh: "{n} 条危险命令", en: "{n} dangerous command(s)" },
  "im.secrets": { zh: "{n} 处密钥发现", en: "{n} secret finding(s)" },
  "im.scanLine": { zh: "扫描：{score}/100（{verdict}，{files} 个文件）", en: "Scan: {score}/100 ({verdict}, {files} files)" },
  "im.deps": { zh: "依赖（{n}）", en: "Dependencies ({n})" },
  "im.createProposal": { zh: "生成适配方案", en: "Create Adapter Proposal" },
  "im.rulesGen": { zh: "规则型生成器（非 AI），生成后必须人工审阅。", en: "Rule-based generator (not AI); human review required." },
  "im.requiresReview": { zh: "需人工审阅（高风险/危险命令）", en: "Requires human review (high risk / dangerous commands)" },
  "im.generateNote": { zh: "落地为文件：forge-core adapter generate <源> --out <目录>（骨架 install/configure/healthcheck 待人工补充后才会被使用）。", en: "Materialize with: forge-core adapter generate <source> --out <dir> (skeleton install/configure/healthcheck must be completed by a human before use)." },
  "ag.loading": { zh: "正在加载已安装的 Agent…", en: "Loading installed agents…" },
  "ag.subtitle": { zh: "已安装的包（与 CLI 通过 DSH 状态库共享）。", en: "Installed packages (shared with the CLI via the DSH state store)." },
  "ag.emptyTitle": { zh: "尚未安装任何内容", en: "Nothing installed yet" },
  "ag.emptyBody": { zh: "先收录项目或从本地 Registry 安装（CLI：agenthub install …）。", en: "Import a project or install from the local registry first (CLI: agenthub install …)." },
  "ag.rollback": { zh: "回滚", en: "Rollback" },
  "ag.run": { zh: "运行", en: "Run" },
  "ag.running": { zh: "运行中…", en: "Running…" },
  "ag.runOk": { zh: "已启动：PID {pid}（进程页可停止；日志见日志页）", en: "Started: PID {pid} (stop in Processes; log in Logs)" },
  "co.uninstallBlockedBy": { zh: "组合无法卸载：组件仍被其他组合/插件依赖", en: "Cannot uninstall bundle: components are still used elsewhere" },
  "co.uninstallBlockedBody": { zh: "以下组件被其它项引用，需先移除那些引用：", en: "These components are referenced by other items; remove those first:" },
  "db.loading": { zh: "正在加载系统状态…", en: "Loading system status…" },
  "db.loadFailed": { zh: "无法加载系统状态", en: "Could not load system status" },
  "db.subtitle": { zh: "本地 Registry 与运行时状态。", en: "Local registry and runtime status." },
  "db.coreVersion": { zh: "内核版本", en: "Core version" },
  "db.coreVersionDetail": { zh: "Forge Core 内核版本", en: "Forge Core kernel version" },
  "db.registryPackages": { zh: "Registry 包数", en: "Registry packages" },
  "db.registryPackagesDetail": { zh: "本地 Registry 中可用（尚未安装）", en: "Available in the local registry (not installed yet)" },
  "db.dshDetected": { zh: "DSH 检测", en: "DSH detected" },
  "db.yes": { zh: "是", en: "Yes" },
  "db.no": { zh: "否", en: "No" },
  "db.dshDetailYes": { zh: "DeepSeek Harness CLI 可用", en: "DeepSeek Harness CLI is available" },
  "db.dshDetailNo": { zh: "未找到 DeepSeek Harness CLI (dsh)", en: "DeepSeek Harness CLI (dsh) was not found" },
  "db.registry": { zh: "Registry", en: "Registry" },
  "db.path": { zh: "路径", en: "Path" },
  "db.status": { zh: "状态", en: "Status" },
  "db.available": { zh: "可用", en: "Available" },
  "db.unavailable": { zh: "不可用", en: "Unavailable" },
  "db.name": { zh: "名称", en: "Name" },
  "db.registryMissing": { zh: "在 {path} 未找到 Registry。恢复方法：在该目录创建 Registry（registry.json + packages/），或将 FORGE_REGISTRY 环境变量指向已初始化的 Registry 目录。", en: "No registry found at {path}. To recover, create a registry there (a registry.json plus packages/) or point the FORGE_REGISTRY environment variable at an initialized registry directory." },
  "db.updatesBody": { zh: "{n} 个包可更新。", en: "{n} package(s) can be updated." },
  "db.updatesNone": { zh: "没有可用的更新。", en: "No updates available." },
  "db.sessionsBody": { zh: "{n} 个会话。", en: "{n} session(s)." },
  "db.sessionsNone": { zh: "暂无会话。", en: "No sessions yet." },
  "se.loading": { zh: "正在加载运行时状态…", en: "Loading runtime status…" },
  "se.subtitle": { zh: "DeepSeek Harness 运行时状态。", en: "DeepSeek Harness runtime status." },
  "se.harness": { zh: "Harness", en: "Harness" },
  "se.running": { zh: "运行中", en: "Running" },
  "se.notFound": { zh: "未找到", en: "Not found" },
  "se.sessions": { zh: "会话", en: "Sessions" },
  "se.dshProcesses": { zh: "dsh 进程", en: "Dsh processes" },
  "se.viaPs": { zh: "来自 ps 观测", en: "Observed via ps" },
  "se.recentSessions": { zh: "最近会话", en: "Recent sessions" },
  "se.noSessions": { zh: "暂无会话", en: "No sessions yet" },
  "se.noSessionsBody": { zh: "在 DeepSeek Harness 中开始对话后，会话会出现在这里。", en: "Start a conversation in DeepSeek Harness and it will appear here." },
  "pr.loading": { zh: "正在加载进程…", en: "Loading processes…" },
  "pr.subtitle": { zh: "来自系统观测的 dsh 进程（无伪造条目）。", en: "dsh processes observed from the system (no fabricated entries)." },
  "pr.emptyTitle": { zh: "没有 dsh 进程", en: "No dsh processes" },
  "pr.emptyBody": { zh: "启动 DeepSeek Harness 后，其进程会出现在这里。", en: "Start DeepSeek Harness and its processes will appear here." },
  "pr.restart": { zh: "重启", en: "Restart" },
  "pr.stop": { zh: "停止", en: "Stop" },
  "pr.note": { zh: "Stop/Restart 由 Rust Core 执行（kill -TERM / 分离重启），UI 不直接操作进程。", en: "Stop/Restart are performed by Rust Core (kill -TERM / detached restart); the UI never operates on processes directly." },
  "lg.loading": { zh: "正在加载日志…", en: "Loading logs…" },
  "lg.subtitle": { zh: "安装与安全扫描日志（只追加 JSONL）。", en: "Install and security-scan logs (append-only JSONL)." },
  "lg.emptyTitle": { zh: "暂无安装日志", en: "No install logs yet" },
  "lg.emptyBody": { zh: "每次 Forge 安装/更新都会写入一条记录。", en: "Each Forge install/update writes an entry here." },
  "lg.ok": { zh: "成功", en: "ok" },
  "lg.failed": { zh: "失败", en: "failed" },
  "lg.verdict": { zh: "判定", en: "verdict" },
  "sy.securitySubtitle": { zh: "已安装包：来自 Registry 支撑状态的信任与扫描评分。", en: "Installed packages: trust and scan score from the registry-backed state." },
  "sy.noInstalledPackages": { zh: "没有已安装的包", en: "No installed packages" },
  "sy.noInstalledBody": { zh: "安装一个包后，这里会显示其信任级别与扫描评分。", en: "Install a package to see its trust level and scan score here." },
  "sy.trust": { zh: "信任", en: "trust" },
  "sy.score": { zh: "评分", en: "score" },
  "sy.securityNote": { zh: "安装时已执行：SHA256 + Ed25519 验签 + 静态扫描 + 信任门禁（详情见 CLI 安装输出）。", en: "At install time we run: SHA256 + Ed25519 signature check + static scan + trust gating (see CLI install output)." },
  "sy.sourcesSubtitle": { zh: "Registry 提供者（Local-first）。", en: "Registry providers (Local-first)." },
  "sy.loading": { zh: "加载中…", en: "Loading…" },
  "sy.localRegistry": { zh: "本地 Registry", en: "Local Registry" },
  "sy.gitNote": { zh: "Git Registry 与 HTTP/Private Registry 为后续阶段能力（协议已预留，不提前实现）。", en: "Git and HTTP/Private registries are later-stage capabilities (protocol reserved, not implemented early)." },
  "sy.settingsSubtitle": { zh: "只显示有真实功能支撑的设置。", en: "Only settings backed by real functionality are shown." },
  "sy.language": { zh: "语言", en: "Language" },
  "sy.themeFixed": { zh: "主题当前固定为 dark（设计系统 token）。", en: "The theme is fixed to dark for now (design-system tokens)." },
  "sy.moreSettingsLater": { zh: "其余设置项将随对应功能（默认 Registry、验证策略、日志级别）逐步开放。", en: "Other settings open up with their features (default registry, verification policy, log level)." },
  "mp.onlyInstalled": { zh: "只看已安装", en: "Installed only" },
  "mp.allPackages": { zh: "全部插件", en: "All packages" },
  "mp.scanned": { zh: "已扫描", en: "Scanned" },
  "mp.filterLicense": { zh: "全部许可", en: "All licenses" },
  "mp.featured": { zh: "官方精选", en: "Featured" },
  "sy.githubSources": { zh: "GitHub 来源", en: "GitHub sources" },
  "sy.cacheRepos": { zh: "本地源码缓存", en: "Local source cache" },
  "sy.licenses": { zh: "许可分布", en: "License distribution" },
  "sy.packages": { zh: "包", en: "packages" },
  "sy.repos": { zh: "仓库", en: "repos" },
  "progress.resolving": { zh: "解析包", en: "Resolving package" },
  "progress.cloning": { zh: "克隆源码", en: "Cloning source" },
  "progress.scanning": { zh: "安全扫描", en: "Security scan" },
  "progress.registering": { zh: "登记状态", en: "Registering state" },
  "progress.installed": { zh: "安装完成", en: "Installed" },
  "progress.component": { zh: "组件", en: "Component" },
  "progress.componentOf": { zh: "组件：{name}", en: "Component: {name}" },
  "progress.failed": { zh: "失败", en: "Failed" },
  "progress.failedNote": { zh: "安装失败（Core 已记录失败步骤，详见日志页）。", en: "Install failed (Core logged the failing step; see Logs)." },
  "progress.phase": { zh: "阶段", en: "Phase" },
  "pd.permissions": { zh: "权限（来自安全扫描）", en: "Permissions (from security scan)" },
  "pd.permissionsNone": { zh: "扫描未发现网络 / 文件系统 / 环境变量引用。", en: "The scan found no network / filesystem / environment references." },
  "pd.network": { zh: "网络", en: "Network" },
  "pd.filesystem": { zh: "文件系统", en: "Filesystem" },
  "pd.env": { zh: "环境变量", en: "Environment" },
  "pd.permissionsNote": { zh: "安装时由静态安全扫描得出；空列表 = 未发现该类引用。", en: "Derived from the static security scan at install time; empty list = no such references found." },
  "sy.permissions": { zh: "权限", en: "Permissions" },
  "sy.none": { zh: "无", en: "None" },
  "sy.sourcesNote": { zh: "收录来自 deepseekdocs.com/ecosystem 的真实开源条目 + 官方 Agent；GitHub 来源在安装时克隆到本地缓存并安全扫描。", en: "Curated from real open-source entries on deepseekdocs.com/ecosystem plus official agents; GitHub sources are cloned into a local cache and security-scanned at install time." },
  "palette.placeholder": { zh: "输入命令或页面名称…", en: "Type a command or page name…" },
  "palette.hint": { zh: "↑↓ 选择 · Enter 跳转 · Esc 关闭", en: "↑↓ select · Enter go · Esc close" },
  "plugins.enabled": { zh: "已启用", en: "Enabled" },
  "plugins.disabled": { zh: "已禁用", en: "Disabled" },
  "plugins.disable": { zh: "禁用", en: "Disable" },
  "plugins.enable": { zh: "启用", en: "Enable" },
  "plugins.filterAll": { zh: "全部", en: "All" },
  "plugins.disabledNote": { zh: "禁用后，Forge 的组合安装/更新会拒绝使用该插件。", en: "While disabled, Forge bundle install / update refuses to use this plugin." },
  "db.activity": { zh: "最近活动", en: "Recent activity" },
  "db.noActivity": { zh: "暂无活动记录（安装/安全扫描后会出现）。", en: "No activity yet (appears after installs / security scans)." },
};

interface I18n {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18n>({
  locale: "zh",
  setLocale: () => {},
  t: (k) => k,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    try {
      const saved = localStorage.getItem("forge-locale");
      if (saved === "zh" || saved === "en") return saved;
    } catch {
      /* storage unavailable */
    }
    return "zh";
  });

  useEffect(() => {
    try {
      localStorage.setItem("forge-locale", locale);
    } catch {
      /* noop */
    }
    document.documentElement.setAttribute("lang", locale);
  }, [locale]);

  const t = (key: string, vars?: Record<string, string | number>) => {
    const entry = DICT[key];
    let text = entry ? (locale === "zh" ? entry.zh : entry.en) : key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.split("{" + k + "}").join(String(v));
      }
    }
    return text;
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale: setLocaleState, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}
