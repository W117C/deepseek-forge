import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  CircleCheck,
  CircleDashed,
  CircleX,
  Cpu,
  Database,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { Link } from "react-router-dom";
import { logsList, registryList, runtimeStatus, systemStatus, updateCheck } from "../ipc";
import type { LogEntry, RegistrySummary, SystemStatus } from "../ipc";
import { useI18n } from "../i18n";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; system: SystemStatus; packages: RegistrySummary[]; outdated: number; sessions: number; activity: LogEntry[] };

export default function Dashboard() {
  const { t } = useI18n();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      systemStatus(),
      registryList(),
      updateCheck().catch(() => []),
      runtimeStatus().catch(() => ({ sessionCount: 0 })),
      logsList().catch(() => []),
    ])
      .then(([system, packages, updates, runtime, logs]) => {
        if (!cancelled) {
          const outdated = Array.isArray(updates) ? updates.filter((u) => u.outdated).length : 0;
          const sessions = typeof runtime === "object" && runtime !== null && "sessionCount" in runtime
            ? Number((runtime as { sessionCount?: number }).sessionCount ?? 0)
            : 0;
          const activity = Array.isArray(logs) ? logs.slice(0, 6) : [];
          setState({ status: "ready", system, packages, outdated, sessions, activity });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="page">
        <div className="dashboard-loading" role="status">
          <LoaderCircle size={16} className="spin" />
          <span>{t("db.loading")}</span>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="page">
        <div className="error-state">
          <TriangleAlert size={22} className="err-icon" />
          <h3>{t("db.loadFailed")}</h3>
          <p>{state.message}</p>
        </div>
      </div>
    );
  }

  const { system, packages, outdated, sessions, activity } = state;

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-heading">{t("nav.dashboard")}</h1>
        <p className="page-sub">{t("db.subtitle")}</p>
      </header>

      <section className="stat-grid">
        <StatCard
          icon={Cpu}
          label={t("db.coreVersion")}
          value={system.coreVersion}
          detail={t("db.coreVersionDetail")}
        />
        <StatCard
          icon={Database}
          label={t("db.registryPackages")}
          value={String(packages.length)}
          detail={t("db.registryPackagesDetail")}
        />
        <StatCard
          icon={system.dshDetected ? CircleCheck : CircleDashed}
          label={t("db.dshDetected")}
          value={system.dshDetected ? t("db.yes") : t("db.no")}
          detail={system.dshDetected ? t("db.dshDetailYes") : t("db.dshDetailNo")}
        />
      </section>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">{t("db.registry")}</h2>
        <RegistryCard system={system} />
      </section>

      <section className="dashboard-grid">
        <Link to="/updates" style={{ textDecoration: "none" }}>
          <EmptyCard
            icon={RefreshCw}
            title={t("nav.updates")}
            body={outdated > 0 ? t("db.updatesBody", { n: outdated }) : t("db.updatesNone")}
          />
        </Link>
        <Link to="/sessions" style={{ textDecoration: "none" }}>
          <EmptyCard
            icon={Boxes}
            title={t("nav.sessions")}
            body={sessions > 0 ? t("db.sessionsBody", { n: sessions }) : t("db.sessionsNone")}
          />
        </Link>
      </section>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">{t("db.activity")}</h2>
        {activity.length === 0 ? (
          <div className="card empty-card">
            <p className="empty-card-body">{t("db.noActivity")}</p>
          </div>
        ) : (
          <div className="card">
            {activity.map((e, i) => (
              <div key={i} className="registry-row">
                <span className="registry-k mono">{e.ts}</span>
                <span className="registry-v">
                  <span className="badge badge-community">{e.kind}</span>{" "}
                  {e.id} v{e.version} — {e.ok ? t("lg.ok") : t("lg.failed")}
                  {e.code ? " · " + e.code : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="card stat-card">
      <div className="stat-card-head">
        <Icon size={15} />
        <span className="stat-card-label">{label}</span>
      </div>
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-detail">{detail}</div>
    </div>
  );
}

function RegistryCard({ system }: { system: SystemStatus }) {
  const { t } = useI18n();
  return (
    <div className="card registry-card">
      <div className="registry-row">
        <span className="registry-k">{t("db.path")}</span>
        <span className="registry-v mono">{system.registryPath}</span>
      </div>
      <div className="registry-row">
        <span className="registry-k">{t("db.status")}</span>
        {system.registryAvailable ? (
          <span className="registry-v ok">
            <CircleCheck size={14} /> {t("db.available")}
          </span>
        ) : (
          <span className="registry-v warn">
            <CircleX size={14} /> {t("db.unavailable")}
          </span>
        )}
      </div>
      {system.registryName ? (
        <div className="registry-row">
          <span className="registry-k">{t("db.name")}</span>
          <span className="registry-v">{system.registryName}</span>
        </div>
      ) : null}
      {!system.registryAvailable ? (
        <p className="registry-error">{t("db.registryMissing", { path: system.registryPath })}</p>
      ) : null}
    </div>
  );
}

function EmptyCard({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <div className="card empty-card">
      <div className="empty-card-head">
        <Icon size={15} />
        <span className="empty-card-title">{title}</span>
      </div>
      <p className="empty-card-body">{body}</p>
    </div>
  );
}
