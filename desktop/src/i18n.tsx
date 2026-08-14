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
};

interface I18n {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18n>({ locale: "zh", setLocale: () => {}, t: (k) => k });

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

  const t = (key: string) => {
    const entry = DICT[key];
    if (!entry) return key;
    return locale === "zh" ? entry.zh : entry.en;
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
