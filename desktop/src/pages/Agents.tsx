// My Agents — installed packages with runnable profiles (shared DSH state store).
// Run / Configure (cordis.patch.yml overlay) / Rollback — all real Rust Core ops.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Play, RotateCcw, Settings2 } from "lucide-react";
import {
  agentConfigGet,
  agentConfigSet,
  packageRollback,
  runtimeRun,
  stateList,
} from "../ipc";
import { useI18n } from "../i18n";
import type { InstalledAgent } from "../ipc";
import {
  Badge,
  EmptyState,
  ErrorCard,
  InlineLoading,
  RowSkeleton,
  useDialog,
  useToast,
} from "../components/ui";

type State =
  | { status: "loading" }
  | { status: "error"; message: unknown }
  | { status: "ready"; agents: Record<string, InstalledAgent> };

export default function Agents() {
  const { t } = useI18n();
  const dialog = useDialog();
  const toast = useToast();
  const [state, setState] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [runBusy, setRunBusy] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<Record<string, { pid: number; logFile: string }>>({});
  const [configOpen, setConfigOpen] = useState<string | null>(null);
  const [configText, setConfigText] = useState("");
  const [configPath, setConfigPath] = useState("");
  const [configBusy, setConfigBusy] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [actionErr, setActionErr] = useState<unknown>(null);

  const load = useCallback(() => {
    setState({ status: "loading" });
    stateList()
      .then((s) => setState({ status: "ready", agents: s.agents ?? {} }))
      .catch((err: unknown) => setState({ status: "error", message: err }));
  }, []);

  useEffect(load, [load]);

  async function run(id: string, profile: string) {
    setRunBusy(id);
    setActionErr(null);
    try {
      const res = await runtimeRun(profile);
      setRunResult((prev) => ({ ...prev, [id]: res }));
      toast("success", t("ag.runOkShort", { id }), "PID " + res.pid);
    } catch (err) {
      setActionErr(err);
      toast("error", t("common.failed"), id);
    } finally {
      setRunBusy(null);
    }
  }

  async function openConfig(id: string) {
    if (configOpen === id) {
      setConfigOpen(null);
      return;
    }
    setConfigOpen(id);
    setConfigText("");
    setConfigSaved(false);
    setActionErr(null);
    try {
      const cfg = await agentConfigGet(id);
      setConfigText(cfg.text);
      setConfigPath(cfg.path);
    } catch (err) {
      setActionErr(err);
      setConfigOpen(null);
    }
  }

  async function saveConfig(id: string) {
    setConfigBusy(true);
    setConfigSaved(false);
    setActionErr(null);
    try {
      await agentConfigSet(id, configText);
      setConfigSaved(true);
      toast("success", t("ag.configSavedShort", { id }));
    } catch (err) {
      setActionErr(err);
      toast("error", t("common.failed"), id);
    } finally {
      setConfigBusy(false);
    }
  }

  async function rollback(id: string) {
    const ok = await dialog.confirm({
      title: t("dialog.rollbackTitle", { id }),
      body: t("dialog.rollbackBody"),
      confirmLabel: t("ag.rollback"),
      danger: true,
    });
    if (!ok) return;
    setBusy(id);
    setActionErr(null);
    try {
      await packageRollback(id);
      toast("success", t("toast.uninstalled", { name: id }));
      load();
    } catch (err) {
      setActionErr(err);
      toast("error", t("common.failed"), id);
    } finally {
      setBusy(null);
    }
  }

  if (state.status === "loading") {
    return (
      <div className="page">
        <RowSkeleton rows={4} />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="page">
        <ErrorCard error={state.message} onRetry={load} title={t("nav.agents")} />
      </div>
    );
  }

  const entries = Object.entries(state.agents);
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-heading">{t("nav.agents")}</h1>
          <p className="page-sub">{t("ag.subtitle")}</p>
        </div>
        <div className="page-actions">
          <Link className="btn btn-primary" to="/bundles">
            {t("ag.compose")}
          </Link>
        </div>
      </header>

      {actionErr ? (
        <div style={{ marginBottom: 16 }}>
          <ErrorCard error={actionErr} />
        </div>
      ) : null}

      {entries.length === 0 ? (
        <EmptyState
          icon={Bot}
          title={t("ag.emptyTitle")}
          body={t("ag.emptyBody")}
        >
          <Link className="btn btn-primary" to="/marketplace">
            {t("plugins.exploreMarketplace")}
          </Link>
        </EmptyState>
      ) : (
        <div className="list">
          {entries.map(([id, a]) => {
            const isRunnable = !!a.profile && a.kind !== "plugin";
            return (
              <div key={id}>
                <div className="list-row" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                  <div className="cell">
                    <span className="cell-title mono">{id}</span>
                    <div className="cell-sub">
                      v{a.version ?? "?"}
                      {a.profile ? " · profile " + a.profile : ""}
                      {a.trust ? " · " + t("sy.trust") + " " + a.trust : ""}
                      {a.score !== undefined ? " · " + t("sy.score") + " " + a.score : ""}
                      {a.kind && a.kind !== "agent" ? " · " + a.kind : ""}
                    </div>
                    {runResult[id] && (
                      <div className="cell-sub" style={{ color: "var(--success)" }}>
                        {t("ag.runOk", { pid: runResult[id].pid })}
                      </div>
                    )}
                  </div>
                  <div className="cell-actions">
                    {isRunnable && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => void run(id, String(a.profile))}
                        disabled={runBusy === id}
                      >
                        {runBusy === id ? (
                          <InlineLoading label={t("ag.running")} />
                        ) : (
                          <>
                            <Play size={12} />
                            {t("ag.run")}
                          </>
                        )}
                      </button>
                    )}
                    {a.profile && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => void openConfig(id)}
                      >
                        <Settings2 size={12} />
                        {t("ag.configure")}
                      </button>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => void rollback(id)}
                      disabled={busy === id}
                    >
                      {busy === id ? (
                        <InlineLoading label={t("ag.rollback")} />
                      ) : (
                        <>
                          <RotateCcw size={12} />
                          {t("ag.rollback")}
                        </>
                      )}
                    </button>
                    {a.kind && a.kind !== "agent" ? (
                      <Badge tone="community">{a.kind}</Badge>
                    ) : (
                      <Badge tone="accent">agent</Badge>
                    )}
                  </div>
                </div>

                {configOpen === id && (
                  <div className="detail-sec" style={{ margin: "0 16px 16px", borderColor: "var(--border-strong)" }}>
                    <div className="detail-sec-head">
                      <span className="detail-sec-title">{t("ag.configure")}</span>
                      <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
                        {configPath}
                      </span>
                    </div>
                    <textarea
                      className="textarea"
                      style={{ width: "100%", minHeight: 220, fontFamily: "var(--font-mono)", fontSize: 12 }}
                      value={configText}
                      onChange={(e) => setConfigText(e.target.value)}
                      spellCheck={false}
                    />
                    <p className="field-hint">
                      {t("ag.configHint")} {configSaved ? t("ag.configSaved") : ""}
                    </p>
                    <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                      <button
                        className="btn btn-primary"
                        onClick={() => void saveConfig(id)}
                        disabled={configBusy}
                      >
                        {configBusy ? <InlineLoading label={t("ag.configSave")} /> : t("ag.configSave")}
                      </button>
                      <button className="btn btn-ghost" onClick={() => setConfigOpen(null)}>
                        {t("ag.configCancel")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
