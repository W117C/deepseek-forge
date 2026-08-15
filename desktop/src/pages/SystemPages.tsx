// System pages — Security / Sources / Settings.
// Only data backed by real functionality is shown; everything else is an
// honest empty state. Trust system: calm, technical, not alarm-red.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Database, ShieldCheck } from "lucide-react";
import { sourcesStats, stateList, systemStatus } from "../ipc";
import type { SourcesStats } from "../ipc";
import { useI18n } from "../i18n";
import type { InstalledAgent, SystemStatus } from "../ipc";
import {
  Badge,
  EmptyState,
  ErrorCard,
  RowSkeleton,
  Segmented,
} from "../components/ui";

function useSystem() {
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => {
    systemStatus()
      .then(setSystem)
      .catch((e: unknown) => setErr(e));
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
        <div>
          <h1 className="page-heading">{t("nav.security")}</h1>
          <p className="page-sub">{t("sy.securitySubtitle")}</p>
        </div>
      </header>
      {!agents && <RowSkeleton rows={4} />}
      {agents && entries.length === 0 && (
        <EmptyState
          icon={ShieldCheck}
          title={t("sy.noInstalledPackages")}
          body={t("sy.noInstalledBody")}
        />
      )}
      {agents && entries.length > 0 && (
        <div className="list">
          <div
            className="list-head"
            style={{ gridTemplateColumns: "minmax(0,1fr) 120px 90px 110px minmax(0,1fr)" }}
          >
            <span className="col-label">{t("plugins.package")}</span>
            <span className="col-label">{t("sy.trust")}</span>
            <span className="col-label">{t("sy.score")}</span>
            <span className="col-label">{t("plugins.statusCol")}</span>
            <span className="col-label">{t("sy.permissions")}</span>
          </div>
          {entries.map(([id, a]) => (
            <div
              key={id}
              className="list-row"
              style={{ gridTemplateColumns: "minmax(0,1fr) 120px 90px 110px minmax(0,1fr)" }}
            >
              <Link to={"/plugins/" + id} className="cell-title mono">{id}</Link>
              <span className="mono" style={{ fontSize: 11.5, color: "var(--foreground-2)" }}>
                {a.trust ?? "?"}
              </span>
              <span className="mono" style={{ fontSize: 11.5, color: "var(--foreground-2)" }}>
                {a.score ?? "—"}/100
              </span>
              <span>
                {a.reviewStatus ? (
                  <Badge
                    tone={
                      a.reviewStatus === "rejected"
                        ? "blocked"
                        : a.reviewStatus === "approved"
                          ? "verified"
                          : "warning"
                    }
                  >
                    {a.reviewStatus === "rejected"
                      ? t("plugins.rejected")
                      : a.reviewStatus === "approved"
                        ? t("plugins.approved")
                        : t("plugins.pending")}
                  </Badge>
                ) : (
                  <Badge tone="verified">{t("plugins.approved")}</Badge>
                )}
              </span>
              <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
                {a.permissions ? (
                  <>
                    {t("pd.network")} {(a.permissions.network ?? []).length}
                    {" · "}
                    {t("pd.filesystem")} {(a.permissions.filesystem ?? []).length}
                    {" · "}
                    {t("pd.env")} {(a.permissions.env ?? []).length}
                  </>
                ) : (
                  "—"
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="field-hint" style={{ marginTop: 12 }}>
        {t("sy.securityNote")}
      </p>
    </div>
  );
}

export function SourcesPage() {
  const { t } = useI18n();
  const { system, err } = useSystem();
  const [stats, setStats] = useState<SourcesStats | null>(null);
  const [statsErr, setStatsErr] = useState<unknown>(null);
  useEffect(() => {
    sourcesStats()
      .then(setStats)
      .catch((e: unknown) => setStatsErr(e));
  }, []);
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-heading">{t("nav.sources")}</h1>
          <p className="page-sub">{t("sy.sourcesSubtitle")}</p>
        </div>
      </header>
      {err ? <ErrorCard error={err} /> : null}
      {!system && !err && <RowSkeleton rows={4} />}
      {system && (
        <div className="card">
          <div className="kv">
            <span className="kv-k">
              <Database size={12} />
              {t("sy.localRegistry")}
            </span>
            <span className={"kv-v " + (system.registryAvailable ? "ok" : "warn")}>
              {system.registryAvailable ? t("db.available") : t("db.unavailable")}
            </span>
          </div>
          <div className="kv">
            <span className="kv-k">{t("db.path")}</span>
            <span className="kv-v mono">{system.registryPath}</span>
          </div>
          <div className="kv">
            <span className="kv-k">{t("db.name")}</span>
            <span className="kv-v">{system.registryName ?? "—"}</span>
          </div>
          {statsErr ? (
            <div style={{ marginTop: 10 }}>
              <ErrorCard error={statsErr} />
            </div>
          ) : null}
          {stats && (
            <>
              <div className="kv">
                <span className="kv-k">{t("sy.packages")}</span>
                <span className="kv-v">
                  {stats.packages} · {t("sy.githubSources")} {stats.githubSources}
                </span>
              </div>
              <div className="kv">
                <span className="kv-k">{t("sy.licenses")}</span>
                <span className="kv-v mono">
                  {Object.entries(stats.licenses)
                    .map(([l, n]) => l + " ×" + n)
                    .join("  ") || "—"}
                </span>
              </div>
              <div className="kv">
                <span className="kv-k">{t("sy.cacheRepos")}</span>
                <span className="kv-v mono">
                  {stats.cacheRepos} {t("sy.repos")} · {stats.cachePath}
                </span>
              </div>
            </>
          )}
          <p className="field-hint">{t("sy.sourcesNote")}</p>
          <p className="field-hint">{t("sy.gitNote")}</p>
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
        <div>
          <h1 className="page-heading">{t("nav.settings")}</h1>
          <p className="page-sub">{t("sy.settingsSubtitle")}</p>
        </div>
      </header>
      <div className="card">
        <div className="panel-title">{t("sy.language")}</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Segmented<"zh" | "en">
            value={locale}
            onChange={setLocale}
            options={[
              { value: "zh", label: "中文" },
              { value: "en", label: "English" },
            ]}
          />
          <span className="field-hint" style={{ marginTop: 0 }}>
            {t("sy.languageHint")}
          </span>
        </div>
        <p className="field-hint">
          {t("sy.themeFixed")} {t("sy.moreSettingsLater")}
        </p>
      </div>
    </div>
  );
}
