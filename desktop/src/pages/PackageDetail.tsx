// STEP 5: Plugin Detail —— 完整 provenance（绝不伪装原创）+ 安装/卸载。
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Github, LoaderCircle, ShieldCheck, TriangleAlert, Unplug } from "lucide-react";
import { installPackage, packageRollback, registryInfo, stateList } from "../ipc";
import { useI18n } from "../i18n";

type Pkg = Record<string, any>;

const CAP_LABEL: Record<string, string> = {
  "network.http": "Network",
  "filesystem.read": "Filesystem Read",
  "filesystem.write": "Filesystem Write",
  "process.spawn": "Process",
  "environment.read": "Environment",
  "browser.control": "Browser",
  "shell.execute": "Shell",
};

export default function PackageDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const [pkg, setPkg] = useState<Pkg | null>(null);
  const [installed, setInstalled] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  function load() {
    if (!id) return;
    setErr(null);
    Promise.all([registryInfo(id), stateList()])
      .then(([p, s]) => {
        setPkg(p);
        setInstalled(id in (s.agents ?? {}));
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
  }
  useEffect(load, [id]);

  async function install() {
    if (!id) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await installPackage(id);
      setResult(res);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function uninstall() {
    if (!id) return;
    if (!window.confirm("Uninstall " + id + "?\n该插件将从本地 Forge 环境移除登记。")) return;
    setBusy(true);
    setErr(null);
    try {
      await packageRollback(id);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (err && !pkg) {
    return (
      <div className="page">
        <div className="error-state">
          <TriangleAlert size={22} className="err-icon" />
          <p>{err}</p>
          <button className="btn btn-ghost" onClick={load}>{t("mp.retry")}</button>
        </div>
      </div>
    );
  }
  if (!pkg) {
    return (
      <div className="page">
        <div className="dashboard-loading">
          <LoaderCircle size={16} className="spin" />
          <span>{t("mp.loading")}</span>
        </div>
      </div>
    );
  }

  const source = pkg.source ?? {};
  const upstream = pkg.upstream ?? {};
  const license = pkg.license?.spdx ?? upstream.license ?? "—";
  const caps: string[] = pkg.capabilities ?? [];
  const deps: { package?: string }[] = pkg.dependencies ?? [];
  const extra = pkg.extra ?? {};
  const stars = extra.stars ?? null;
  const pushedAt = extra.pushedAt ?? null;

  return (
    <div className="page">
      <header className="page-header">
        <div className="crumb">
          <Link to="/marketplace" className="mono">← {t("nav.marketplace")}</Link>
        </div>
        <h1 className="page-heading" style={{ marginTop: 8 }}>{pkg.name}</h1>
        <p className="page-sub">
          {pkg.type} · v{pkg.version} {stars !== null ? "· ★ " + stars : ""}
        </p>
      </header>

      <div className="card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {installed ? (
          <>
            <span className="badge badge-verified">{t("mp.installed")} ✓</span>
            <button className="btn btn-ghost" onClick={() => void uninstall()} disabled={busy}>
              <Unplug size={14} /> Uninstall
            </button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={() => void install()} disabled={busy}>
            {busy ? <LoaderCircle size={14} className="spin" /> : null}
            {busy ? t("mp.installing") : t("mp.install")}
          </button>
        )}
        {result && (
          <span className="field-hint">
            {t("mp.imported")} ✓ — {((result.steps as string[]) ?? []).join(" → ")}
          </span>
        )}
        {err && <span className="field-error">{err}</span>}
      </div>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">Description</h2>
        <div className="card"><p>{pkg.description || "—"}</p></div>
      </section>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">Powered by Open Source</h2>
        <div className="card">
          <div className="registry-row">
            <span className="registry-k"><Github size={13} /> {t("mp.source")}</span>
            <a className="registry-v mono" href={source.repository ?? "#"} target="_blank" rel="noopener noreferrer">
              {String(source.repository ?? "—").replace("https://github.com/", "github.com/")}
            </a>
          </div>
          <div className="registry-row">
            <span className="registry-k">{t("mp.license")}</span>
            <span className="registry-v">{license}</span>
          </div>
          <div className="registry-row">
            <span className="registry-k">Original Author</span>
            <span className="registry-v">{upstream.author ?? pkg.publisher?.id ?? "—"}</span>
          </div>
          <div className="registry-row">
            <span className="registry-k">Last Updated</span>
            <span className="registry-v mono">{pushedAt ?? "—"}</span>
          </div>
          <div className="registry-row">
            <span className="registry-k"><ShieldCheck size={13} /> {t("mp.security")}</span>
            <span className="registry-v">{pkg.security?.status ?? t("mp.unscanned")}</span>
          </div>
        </div>
      </section>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">{t("mp.capabilities")}</h2>
        <div className="card">
          {caps.length === 0 ? (
            <p className="sub">—（收录条目未经适配，暂无能力声明）</p>
          ) : (
            caps.map((c) => <span key={c} className="badge badge-community" style={{ marginRight: 8 }}>{CAP_LABEL[c] ?? c}</span>)
          )}
        </div>
      </section>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">Dependencies</h2>
        <div className="card">
          {deps.length === 0 ? (
            <p className="sub">No dependencies.</p>
          ) : (
            deps.map((d, i) => <div key={i} className="mono">{d.package ?? "?"}</div>)
          )}
        </div>
      </section>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">README / Changelog</h2>
        <div className="card empty-card">
          <p className="empty-card-body">收录条目暂未抓取 README；可点击上方 GitHub 链接查看原文。</p>
        </div>
      </section>
    </div>
  );
}
