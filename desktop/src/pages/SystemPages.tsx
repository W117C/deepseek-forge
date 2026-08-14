// Phase 8: System 组诚实最小页 —— 只显示有真实后端支撑的数据，其余为空态。
import { useEffect, useState } from "react";
import { Database, LoaderCircle, Settings, ShieldCheck, TriangleAlert } from "lucide-react";
import { sourcesStats, stateList, systemStatus } from "../ipc";
import type { SourcesStats } from "../ipc";
import { useI18n } from "../i18n";
import type { InstalledAgent, SystemStatus } from "../ipc";

function useSystem() {
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    systemStatus()
      .then(setSystem)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  return { system, err };
}

export function SecurityPage() {
  const { t } = useI18n();
  const [agents, setAgents] = useState<Record<string, InstalledAgent> | null>(null);
  useEffect(() => {
    stateList()
      .then((s) => setAgents(s.agents ?? {}))
      .catch(() => setAgents({}));
  }, []);
  const entries = Object.entries(agents ?? {});
  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-heading">{t("nav.security")}</h1>
        <p className="page-sub">{t("sy.securitySubtitle")}</p>
      </header>
      {entries.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-card-head"><ShieldCheck size={15} /><span className="empty-card-title">{t("sy.noInstalledPackages")}</span></div>
          <p className="empty-card-body">{t("sy.noInstalledBody")}</p>
        </div>
      ) : (
        <div className="card">
          {entries.map(([id, a]) => (
            <div key={id} className="registry-row">
              <span className="registry-k mono">{id}</span>
              <span className="registry-v">
                {t("sy.trust")} <b>{a.trust ?? "?"}</b> · {t("sy.score")} <b>{a.score ?? "—"}</b>/100
              </span>
            </div>
          ))}
          <p className="field-hint" style={{ marginTop: 10 }}>{t("sy.securityNote")}</p>
        </div>
      )}
    </div>
  );
}

export function SourcesPage() {
  const { t } = useI18n();
  const { system, err } = useSystem();
  const [stats, setStats] = useState<SourcesStats | null>(null);
  const [statsErr, setStatsErr] = useState<string | null>(null);
  useEffect(() => {
    sourcesStats()
      .then(setStats)
      .catch((e: unknown) => setStatsErr(e instanceof Error ? e.message : String(e)));
  }, []);
  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-heading">{t("nav.sources")}</h1>
        <p className="page-sub">{t("sy.sourcesSubtitle")}</p>
      </header>
      {err && (
        <div className="card error-state"><TriangleAlert size={18} className="err-icon" /><p>{err}</p></div>
      )}
      {!system && !err && (
        <div className="dashboard-loading"><LoaderCircle size={16} className="spin" /><span>{t("sy.loading")}</span></div>
      )}
      {system && (
        <div className="card">
          <div className="registry-row">
            <span className="registry-k"><Database size={13} /> {t("sy.localRegistry")}</span>
            <span className={"registry-v " + (system.registryAvailable ? "ok" : "warn")}>
              {system.registryAvailable ? t("db.available") : t("db.unavailable")}
            </span>
          </div>
          <div className="registry-row">
            <span className="registry-k">{t("db.path")}</span>
            <span className="registry-v mono">{system.registryPath}</span>
          </div>
          <div className="registry-row">
            <span className="registry-k">{t("db.name")}</span>
            <span className="registry-v">{system.registryName ?? "—"}</span>
          </div>
          {statsErr && (
            <p className="field-error" style={{ marginTop: 10 }}>{statsErr}</p>
          )}
          {stats && (
            <>
              <div className="registry-row">
                <span className="registry-k">{t("sy.packages")}</span>
                <span className="registry-v">
                  {stats.packages} · {t("sy.githubSources")} {stats.githubSources}
                </span>
              </div>
              <div className="registry-row">
                <span className="registry-k">{t("sy.licenses")}</span>
                <span className="registry-v mono">
                  {Object.entries(stats.licenses)
                    .map(([l, n]) => l + " ×" + n)
                    .join("  ") || "—"}
                </span>
              </div>
              <div className="registry-row">
                <span className="registry-k">{t("sy.cacheRepos")}</span>
                <span className="registry-v mono">
                  {stats.cacheRepos} {t("sy.repos")} · {stats.cachePath}
                </span>
              </div>
            </>
          )}
          <p className="field-hint" style={{ marginTop: 10 }}>{t("sy.sourcesNote")}</p>
          <p className="field-hint" style={{ marginTop: 6 }}>{t("sy.gitNote")}</p>
        </div>
      )}
    </div>
  );
}

export function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-heading">{t("nav.settings")}</h1>
        <p className="page-sub">{t("sy.settingsSubtitle")}</p>
      </header>
      <div className="card">
        <div className="registry-row">
          <span className="registry-k"><Settings size={13} /> {t("sy.language")}</span>
          <span className="registry-v">
            <button
              className={"btn " + (locale === "zh" ? "btn-primary" : "btn-ghost")}
              onClick={() => setLocale("zh")}
            >
              中文
            </button>{" "}
            <button
              className={"btn " + (locale === "en" ? "btn-primary" : "btn-ghost")}
              onClick={() => setLocale("en")}
            >
              English
            </button>
          </span>
        </div>
        <p className="field-hint" style={{ marginTop: 10 }}>
          {t("sy.themeFixed")} {t("sy.moreSettingsLater")}
        </p>
      </div>
    </div>
  );
}
