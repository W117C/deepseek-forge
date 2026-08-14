// STEP 7/8: My Plugins —— 真实安装列表 + 卸载（确认弹窗；used-by 跟踪随 Bundle 接入）。
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Box, LoaderCircle, TriangleAlert, Unplug } from "lucide-react";
import { packageRollback, stateList } from "../ipc";
import type { InstalledAgent } from "../ipc";
import { useI18n } from "../i18n";

export default function Plugins() {
  const { t } = useI18n();
  const [agents, setAgents] = useState<Record<string, InstalledAgent> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    setErr(null);
    stateList()
      .then((s) => setAgents(s.agents ?? {}))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
  }
  useEffect(load, []);

  async function uninstall(id: string) {
    if (!window.confirm("Uninstall " + id + "?\n该插件将从本地 Forge 环境移除登记。")) return;
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
        <p className="page-sub">已安装 / 已收录的插件（与 CLI 共享状态库）。</p>
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
            <span className="empty-card-title">还没有安装插件</span>
          </div>
          <p className="empty-card-body">
            <Link to="/marketplace">去市场看看</Link>，收录/安装你需要的开源能力。
          </p>
        </div>
      )}

      <div className="card" style={{ marginTop: 12 }}>
        {entries.map(([id, a]) => (
          <div key={id} className="registry-row" style={{ padding: "10px 0" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link to={"/plugins/" + id} className="mono" style={{ fontWeight: 600 }}>
                {id}
              </Link>
              <div className="field-hint">
                {a.imported ? "已收录（源码+扫描）" : "已安装"} · score {a.score ?? "—"}
                {a.source ? " · " + String(a.source).replace("https://github.com/", "") : ""}
              </div>
            </div>
            <button
              className="btn btn-ghost"
              onClick={() => void uninstall(id)}
              disabled={busy === id}
              aria-label={"Uninstall " + id}
            >
              {busy === id ? <LoaderCircle size={14} className="spin" /> : <Unplug size={14} />}
              Uninstall
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
