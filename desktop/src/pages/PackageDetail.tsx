// STEP 5: Plugin Detail —— 完整 provenance（绝不伪装原创）+ 安装/卸载 + used-by 依赖追踪。
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Github, LoaderCircle, ShieldCheck, TriangleAlert, Unplug } from "lucide-react";
import {
  dependentsList,
  installPackage,
  packageRollback,
  registryInfo,
  stateList,
} from "../ipc";
import type { DependentRef } from "../ipc";
import { useI18n } from "../i18n";
import InstallProgress from "../components/InstallProgress";

type Pkg = Record<string, any>;

const CAP_LABEL: Record<string, { zh: string; en: string }> = {
  "network.http": { zh: "网络", en: "Network" },
  "filesystem.read": { zh: "读取文件", en: "Filesystem Read" },
  "filesystem.write": { zh: "写入文件", en: "Filesystem Write" },
  "process.spawn": { zh: "进程", en: "Process" },
  "environment.read": { zh: "环境变量", en: "Environment" },
  "browser.control": { zh: "浏览器", en: "Browser" },
  "shell.execute": { zh: "Shell", en: "Shell" },
};

export default function PackageDetail() {
  const { id } = useParams();
  const { t, locale } = useI18n();
  const [pkg, setPkg] = useState<Pkg | null>(null);
  const [installed, setInstalled] = useState(false);
  const [installedPerms, setInstalledPerms] = useState<{ network?: string[]; filesystem?: string[]; env?: string[] } | null>(null);
  const [deps, setDeps] = useState<DependentRef[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  function load() {
    if (!id) return;
    setErr(null);
    Promise.all([registryInfo(id), stateList(), dependentsList(id).catch(() => null)])
      .then(([p, s, d]) => {
        setPkg(p);
        setInstalled(id in (s.agents ?? {}));
        setDeps(d?.dependents ?? []);
        const entry = (s.agents ?? {})[id] as { permissions?: { network?: string[]; filesystem?: string[]; env?: string[] } } | undefined;
        setInstalledPerms(entry?.permissions ?? null);
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
    if (deps.length > 0) {
      window.alert(
        t("plugins.blockedByDependents") +
          "\n\n" +
          deps
            .map((u) => "• " + u.kind + " " + u.id + (u.requires ? " (" + u.requires + ")" : ""))
            .join("\n")
      );
      return;
    }
    if (!window.confirm(t("plugins.confirmUninstall", { id }))) return;
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
  const depList: { package?: string; version?: string | null }[] = pkg.dependencies ?? [];
  const extra = pkg.extra ?? {};
  const stars = extra.stars ?? null;
  const pushedAt = extra.pushedAt ?? null;
  const capLabel = (c: string) => (CAP_LABEL[c] ? CAP_LABEL[c][locale] : c);

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
              <Unplug size={14} /> {t("plugins.uninstall")}
            </button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={() => void install()} disabled={busy}>
            {busy ? <LoaderCircle size={14} className="spin" /> : null}
            {busy ? t("mp.installing") : t("mp.install")}
          </button>
        )}
        {busy && id && <InstallProgress targetId={id} />}
        {result && (
          <span className="field-hint">
            {t("pd.importedResult")} {((result.steps as string[]) ?? []).join(" → ")}
          </span>
        )}
        {deps.length > 0 && (
          <span className="field-hint" style={{ color: "var(--warning, #e6a23c)" }}>
            {t("plugins.usedBy", { n: deps.length })}
          </span>
        )}
        {err && <span className="field-error">{err}</span>}
      </div>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">{t("pd.description")}</h2>
        <div className="card"><p>{pkg.description || "—"}</p></div>
      </section>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">{t("pd.openSource")}</h2>
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
            <span className="registry-k">{t("pd.originalAuthor")}</span>
            <span className="registry-v">{upstream.author ?? pkg.publisher?.id ?? "—"}</span>
          </div>
          <div className="registry-row">
            <span className="registry-k">{t("pd.lastUpdated")}</span>
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
            <p className="sub">{t("pd.capsEmpty")}</p>
          ) : (
            caps.map((c) => (
              <span key={c} className="badge badge-community" style={{ marginRight: 8 }}>
                {capLabel(c)}
              </span>
            ))
          )}
        </div>
      </section>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">{t("pd.permissions")}</h2>
        <div className="card">
          {!installedPerms ? (
            <p className="sub">{t("pd.permissionsNone")}</p>
          ) : (
            <>
              <div className="registry-row">
                <span className="registry-k">{t("pd.network")}</span>
                <span className="registry-v mono">
                  {(installedPerms.network ?? []).length > 0
                    ? installedPerms.network?.slice(0, 8).join(", ")
                    : t("sy.none")}
                </span>
              </div>
              <div className="registry-row">
                <span className="registry-k">{t("pd.filesystem")}</span>
                <span className="registry-v mono">
                  {(installedPerms.filesystem ?? []).length > 0
                    ? installedPerms.filesystem?.slice(0, 8).join(", ")
                    : t("sy.none")}
                </span>
              </div>
              <div className="registry-row">
                <span className="registry-k">{t("pd.env")}</span>
                <span className="registry-v mono">
                  {(installedPerms.env ?? []).length > 0
                    ? installedPerms.env?.slice(0, 8).join(", ")
                    : t("sy.none")}
                </span>
              </div>
              <p className="field-hint" style={{ marginTop: 8 }}>
                {t("pd.permissionsNote")}
              </p>
            </>
          )}
        </div>
      </section>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">{t("pd.dependencies")}</h2>
        <div className="card">
          {depList.length === 0 ? (
            <p className="sub">{t("pd.noDeps")}</p>
          ) : (
            depList.map((d, i) => (
              <div key={i} className="mono">
                {d.package ?? "?"}
                {d.version ? " (" + d.version + ")" : ""}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">{t("pd.readme")}</h2>
        <div className="card empty-card">
          <p className="empty-card-body">{t("pd.readmeEmpty")}</p>
        </div>
      </section>
    </div>
  );
}
