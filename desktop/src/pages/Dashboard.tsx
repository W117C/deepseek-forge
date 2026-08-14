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
import { registryList, systemStatus } from "../ipc";
import type { RegistrySummary, SystemStatus } from "../ipc";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; system: SystemStatus; packages: RegistrySummary[] };

export default function Dashboard() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    Promise.all([systemStatus(), registryList()])
      .then(([system, packages]) => {
        if (!cancelled) setState({ status: "ready", system, packages });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          });
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
          <span>Loading system status…</span>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="page">
        <div className="error-state">
          <TriangleAlert size={22} className="err-icon" />
          <h3>Could not load system status</h3>
          <p>{state.message}</p>
        </div>
      </div>
    );
  }

  const { system, packages } = state;

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-heading">Dashboard</h1>
        <p className="page-sub">Local registry and runtime status.</p>
      </header>

      <section className="stat-grid">
        <StatCard
          icon={Cpu}
          label="Core version"
          value={system.coreVersion}
          detail="Forge Core kernel version"
        />
        <StatCard
          icon={Database}
          label="Registry packages"
          value={String(packages.length)}
          detail="Available in the local registry (not installed yet)"
        />
        <StatCard
          icon={system.dshDetected ? CircleCheck : CircleDashed}
          label="DSH detected"
          value={system.dshDetected ? "Yes" : "No"}
          detail={
            system.dshDetected
              ? "DeepSeek Harness CLI is available"
              : "DeepSeek Harness CLI (dsh) was not found"
          }
        />
      </section>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">Registry</h2>
        <RegistryCard system={system} />
      </section>

      <section className="dashboard-grid">
        <EmptyCard
          icon={RefreshCw}
          title="Updates"
          body="No updates available yet."
        />
        <EmptyCard icon={Boxes} title="Recent sessions" body="No sessions yet." />
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
  return (
    <div className="card registry-card">
      <div className="registry-row">
        <span className="registry-k">Path</span>
        <span className="registry-v mono">{system.registryPath}</span>
      </div>
      <div className="registry-row">
        <span className="registry-k">Status</span>
        {system.registryAvailable ? (
          <span className="registry-v ok">
            <CircleCheck size={14} /> Available
          </span>
        ) : (
          <span className="registry-v warn">
            <CircleX size={14} /> Unavailable
          </span>
        )}
      </div>
      {system.registryName ? (
        <div className="registry-row">
          <span className="registry-k">Name</span>
          <span className="registry-v">{system.registryName}</span>
        </div>
      ) : null}
      {!system.registryAvailable ? (
        <p className="registry-error">
          No registry found at {system.registryPath}. To recover, create a
          registry there (a registry.json plus packages/) or point the
          FORGE_REGISTRY environment variable at an initialized registry
          directory.
        </p>
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
