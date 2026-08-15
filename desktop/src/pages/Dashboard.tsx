// Dashboard — quiet status, not a data wall.
// "Forge is ready." + installed/agents/updates/security + recent activity timeline.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Boxes,
  CircleCheck,
  CircleX,
  Database,
  PackagePlus,
  RefreshCw,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import {
  logsList,
  registryList,
  runtimeStatus,
  stateList,
  systemStatus,
  updateCheck,
} from "../ipc";
import type { LogEntry, RegistrySummary, SystemStatus } from "../ipc";
import { useI18n } from "../i18n";
import { Badge, EmptyState, ErrorCard, RowSkeleton } from "../components/ui";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: unknown }
  | {
      status: "ready";
      system: SystemStatus;
      packages: RegistrySummary[];
      installed: number;
      agents: number;
      outdated: number;
      sessions: number;
      activity: LogEntry[];
    };

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
      stateList().catch(() => ({ agents: {} })),
    ])
      .then(([system, packages, updates, runtime, logs, st]) => {
        if (cancelled) return;
        const outdated = Array.isArray(updates) ? updates.filter((u) => u.outdated).length : 0;
        const sessions =
          typeof runtime === "object" && runtime !== null && "sessionCount" in runtime
            ? Number((runtime as { sessionCount?: number }).sessionCount ?? 0)
            : 0;
        const agentsMap = (st as { agents?: Record<string, { kind?: string; profile?: string }> }).agents ?? {};
        const entries = Object.entries(agentsMap);
        setState({
          status: "ready",
          system,
          packages,
          installed: entries.length,
          agents: entries.filter(([, a]) => a.kind === "agent" || !!a.profile).length,
          outdated,
          sessions,
          activity: Array.isArray(logs) ? logs.slice(0, 8) : [],
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: "error", message: err });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="page">
        <RowSkeleton rows={6} />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="page">
        <ErrorCard error={state.message} title={t("db.loadFailed")} />
      </div>
    );
  }

  const { system, packages, installed, agents, outdated, sessions, activity } = state;
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? t("db.greetingMorning") : hour < 18 ? t("db.greetingAfternoon") : t("db.greetingEvening");
  const securityClear = system.registryAvailable;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-heading">{greeting}</h1>
          <p className="page-sub">{t("db.ready")}</p>
        </div>
        <div className="page-actions">
          <Link className="btn btn-primary" to="/marketplace">
            <PackagePlus size={14} />
            {t("db.browseMarketplace")}
          </Link>
        </div>
      </header>

      <section className="stat-grid">
        <StatCard
          icon={Boxes}
          label={t("db.installedPackages")}
          value={String(installed)}
          detail={t("db.installedPackagesDetail")}
        />
        <StatCard
          icon={Bot}
          label={t("db.agents")}
          value={String(agents)}
          detail={t("db.agentsDetail")}
        />
        <Link to="/updates" style={{ textDecoration: "none" }}>
          <StatCard
            icon={RefreshCw}
            label={t("db.updates")}
            value={String(outdated)}
            detail={outdated > 0 ? t("db.updatesBody", { n: outdated }) : t("db.updatesNone")}
            valueTone={outdated > 0 ? "acc" : undefined}
          />
        </Link>
        <Link to="/security" style={{ textDecoration: "none" }}>
          <StatCard
            icon={ShieldCheck}
            label={t("db.security")}
            value={securityClear ? t("db.allClear") : t("db.attention")}
            detail={securityClear ? t("db.securityClearDetail") : t("db.registryUnavailable")}
            valueTone={securityClear ? "ok" : "warn"}
          />
        </Link>
      </section>

      <section>
        <div className="sec-head">
          <h2 className="sec-title">{t("db.registry")}</h2>
          <span className="sec-count">
            {packages.length} {t("sy.packages")}
          </span>
        </div>
        <div className="card" style={{ padding: "12px 16px", gap: 6 }}>
          <div className="kv" style={{ padding: "3px 0" }}>
            <span className="kv-k">
              <Database size={12} />
              {t("db.status")}
            </span>
            {system.registryAvailable ? (
              <span className="kv-v ok">
                <CircleCheck size={13} />
                {t("db.available")}
                {system.registryName ? " · " + system.registryName : ""}
              </span>
            ) : (
              <span className="kv-v err">
                <CircleX size={13} />
                {t("db.unavailable")}
              </span>
            )}
          </div>
          <div className="kv" style={{ padding: "3px 0" }}>
            <span className="kv-k">{t("db.path")}</span>
            <span className="kv-v mono">{system.registryPath}</span>
          </div>
          <div className="kv" style={{ padding: "3px 0" }}>
            <span className="kv-k">{t("db.coreVersion")}</span>
            <span className="kv-v mono">v{system.coreVersion}</span>
          </div>
          {!system.registryAvailable && (
            <div className="note" style={{ marginTop: 6 }}>
              {t("db.registryMissing", { path: system.registryPath })}
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="sec-head">
          <h2 className="sec-title">{t("db.activity")}</h2>
          <Link to="/logs" className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
            {t("db.viewAllLogs")} →
          </Link>
        </div>
        {activity.length === 0 ? (
          <EmptyState icon={TerminalSquare} title={t("db.noActivity")} body={t("db.noActivityBody")} />
        ) : (
          <div className="list">
            {activity.map((e, i) => {
              const Icon = e.kind === "install" ? PackagePlus : e.kind === "security" ? ShieldCheck : TerminalSquare;
              return (
                <div key={i} className="act-row">
                  <span className="act-time">{e.ts}</span>
                  <span className="act-ico">
                    <Icon size={12} />
                  </span>
                  <span className="act-text">
                    {e.kind === "install"
                      ? t("db.eventInstalled")
                      : e.kind === "security"
                        ? t("db.eventSecurity")
                        : t("db.eventHarness")}{" "}
                    <span className="act-pkg">
                      {e.id} v{e.version}
                    </span>
                  </span>
                  {e.kind === "install" ? (
                    e.ok ? (
                      <span className="act-status ok">{t("lg.ok")}</span>
                    ) : (
                      <span className="act-status bad">{t("lg.failed")}</span>
                    )
                  ) : (
                    <Badge tone="community">{e.kind}</Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="sec-head">
          <h2 className="sec-title">{t("db.runtime")}</h2>
        </div>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
          <Link to="/sessions" style={{ textDecoration: "none" }}>
            <StatCard
              icon={TerminalSquare}
              label={t("nav.sessions")}
              value={String(sessions)}
              detail={sessions > 0 ? t("db.sessionsBody", { n: sessions }) : t("db.sessionsNone")}
            />
          </Link>
          <Link to="/processes" style={{ textDecoration: "none" }}>
            <StatCard
              icon={Boxes}
              label={t("nav.processes")}
              value={system.dshDetected ? t("db.yes") : t("db.no")}
              detail={system.dshDetected ? t("db.dshDetailYes") : t("db.dshDetailNo")}
            />
          </Link>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  valueTone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  valueTone?: "acc" | "ok" | "warn";
}) {
  return (
    <div className="stat-card">
      <div className="stat-head">
        <Icon size={13} />
        <span className="stat-label">{label}</span>
      </div>
      <div className={"stat-value" + (valueTone ? " " + valueTone : "")}>{value}</div>
      <div className="stat-detail">{detail}</div>
    </div>
  );
}
