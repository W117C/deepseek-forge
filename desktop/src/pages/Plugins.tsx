// STEP 7/8/9: My Plugins —— 真实安装列表 + 卸载 + 反向依赖追踪（dependents）。
// 被其他插件依赖声明或组合 Bundle 引用的插件，卸载前会被拦截并列出使用方。
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Box, LoaderCircle, TriangleAlert, Unplug } from "lucide-react";
import { dependentsList, packageRollback, stateList } from "../ipc";
import type { DependentRef, InstalledAgent } from "../ipc";
import { useI18n } from "../i18n";

export default function Plugins() {
  const { t } = useI18n();
  const [agents, setAgents] = useState<Record<string, InstalledAgent> | null>(null);
  const [deps, setDeps] = useState<Record<string, DependentRef[]>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    setErr(null);
    stateList()
      .then((s) => {
        const list = s.agents ?? {};
        setAgents(list);
        const ids = Object.entries(list)
          .filter(([, a]) => a.kind === "plugin")
          .map(([id]) => id);
        Promise.all(
          ids.map((id) =>
            dependentsList(id)
              .then((d) => ({ id, refs: d.dependents ?? [] }))
              .catch(() => ({ id, refs: [] as DependentRef[] }))
          )
        ).then((rows) => {
          const map: Record<string, DependentRef[]> = {};
          for (const row of rows) map[row.id] = row.refs;
          setDeps(map);
        });
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
  }
  useEffect(load, []);

  async function uninstall(id: string) {
    const used = deps[id] ?? [];
    if (used.length > 0) {
      window.alert(
        t("plugins.blockedByDependents") +
          "\n\n" +
          used.map((u) => "• " + u.kind + " " + u.id + (u.requires ? " (" + u.requires + ")" : "")).join("\n")
      );
      return;
    }
    if (!window.confirm(t("plugins.confirmUninstall", { id }))) return;
    setBusy(id);
    setErr(null);
    try {
      await packageRollback(id);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const entries = Object.entries(agents ?? {}).filter(
    ([, a]) => a.kind === "plugin"
  );

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-heading">{t("nav.plugins")}</h1>
        <p className="page-sub">{t("plugins.subtitle")}</p>
      </header>

      {err && (
        <div className="card error-state">
          <TriangleAlert size={18} className="err-icon" />
          <p>{err}</p>
        </div>
      )}

      {!agents && !err && (
        <div className="dashboard-loading">
          <LoaderCircle size={16} className="spin" />
          <span>{t("mp.loading")}</span>
        </div>
      )}

      {agents && entries.length === 0 && (
        <div className="card empty-card">
          <div className="empty-card-head">
            <Box size={15} />
            <span className="empty-card-title">{t("plugins.emptyTitle")}</span>
          </div>
          <p className="empty-card-body">
            <Link to="/marketplace">{t("plugins.emptyBody1")}</Link>
            {t("plugins.emptyBody2")}
          </p>
        </div>
      )}

      <div className="card" style={{ marginTop: 12 }}>
        {entries.map(([id, a]) => {
          const used = deps[id] ?? [];
          return (
            <div key={id} className="registry-row" style={{ padding: "10px 0" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link to={"/plugins/" + id} className="mono" style={{ fontWeight: 600 }}>
                  {id}
                </Link>
                <div className="field-hint">
                  {a.imported ? t("plugins.imported") : t("plugins.installed")} ·{" "}
                  {t("plugins.score")} {a.score ?? "—"}
                  {a.source ? " · " + String(a.source).replace("https://github.com/", "") : ""}
                  {used.length > 0 && (
                    <span style={{ color: "var(--warning, #e6a23c)" }}>
                      {" "}
                      · {t("plugins.usedBy", { n: used.length })}
                    </span>
                  )}
                </div>
              </div>
              <button
                className="btn btn-ghost"
                onClick={() => void uninstall(id)}
                disabled={busy === id}
                aria-label={t("plugins.uninstall") + " " + id}
              >
                {busy === id ? <LoaderCircle size={14} className="spin" /> : <Unplug size={14} />}
                {t("plugins.uninstall")}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
