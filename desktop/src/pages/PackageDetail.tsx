// Package Detail — provenance, capabilities, dependencies, security, README.
// Tabs: Overview / Capabilities / Dependencies / Security / README.
// Header actions reflect the real installation state (Install sheet, Update,
// Disable/Enable, Uninstall with dependent checks).
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  ExternalLink,
  Github,
  Power,
  ShieldCheck,
  Sparkles,
  Unplug,
} from "lucide-react";
import {
  dependentsList,
  openExternal,
  packageRollback,
  registryInfo,
  registryVersions,
  stateList,
  setPluginEnabled,
  updateApply,
  updateCheck,
  wrapPlugin,
} from "../ipc";
import type { DependentRef } from "../ipc";
import { useI18n } from "../i18n";
import {
  Badge,
  ErrorCard,
  InlineLoading,
  RowSkeleton,
  Status,
  useDialog,
  useToast,
} from "../components/ui";
import InstallDialog from "../components/InstallDialog";
import type { InstallTarget } from "../components/InstallDialog";

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

type Tab = "overview" | "capabilities" | "dependencies" | "security" | "readme";

const TAB_KEYS: Record<Tab, string> = {
  overview: "pd.tabs.overview",
  capabilities: "pd.tabs.capabilities",
  dependencies: "pd.tabs.dependencies",
  security: "pd.tabs.security",
  readme: "pd.tabs.readme",
};

export default function PackageDetail() {
  const { id } = useParams();
  const { t, locale } = useI18n();
  const dialog = useDialog();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [pkg, setPkg] = useState<Pkg | null>(null);
  const [entry, setEntry] = useState<Record<string, any> | null>(null);
  const [installPath, setInstallPath] = useState<string | null>(null);
  const [outdated, setOutdated] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deps, setDeps] = useState<DependentRef[]>([]);
  const [versions, setVersions] = useState<string[]>([]);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [installTarget, setInstallTarget] = useState<InstallTarget | null>(null);
  const [wrapping, setWrapping] = useState(false);

  async function wrapAsAgent() {
    if (!id || !installPath || !pkg) return;
    setWrapping(true);
    setErr(null);
    try {
      const res = await wrapPlugin(installPath, pkg.name || id);
      toast(
        "success",
        t("pd.wrapDone", { name: pkg.name || id }),
        String(res?.profile ?? res?.agentId ?? "")
      );
    } catch (e) {
      setErr(e);
      toast("error", t("pd.wrapFailed"), id);
    } finally {
      setWrapping(false);
    }
  }

  function load() {
    if (!id) return;
    setErr(null);
    Promise.all([
      registryInfo(id),
      stateList(),
      dependentsList(id).catch(() => null),
      updateCheck().catch(() => []),
      registryVersions(id).catch(() => []),
    ])
      .then(([p, s, d, ups, vers]) => {
        setPkg(p);
        const e = ((s.agents ?? {})[id] as Record<string, any>) ?? null;
        setEntry(e);
        setDeps(d?.dependents ?? []);
        setVersions(vers);
        setInstallPath(
          e?.installPath ?? (e?.source ? String(e.source) : null)
        );
        const u = Array.isArray(ups)
          ? ups.find((x) => x.id === id && x.outdated)
          : undefined;
        setOutdated(u ? u.latest : null);
      })
      .catch((e: unknown) => setErr(e));
  }
  useEffect(load, [id]);

  async function update() {
    if (!id) return;
    setUpdating(true);
    setErr(null);
    try {
      await updateApply(id);
      load();
      toast("success", t("toast.updated", { name: id }), outdated ? "v" + outdated : undefined);
    } catch (e) {
      setErr(e);
      toast("error", t("toast.updateFailed"), id);
    } finally {
      setUpdating(false);
    }
  }

  async function toggleEnabled() {
    if (!id || !entry) return;
    setToggling(true);
    setErr(null);
    const next = entry.enabled === false;
    try {
      await setPluginEnabled(id, next);
      load();
      toast(
        "success",
        next ? t("toast.enabled", { name: id }) : t("toast.disabled", { name: id })
      );
    } catch (e) {
      setErr(e);
      toast("error", t("common.failed"), id);
    } finally {
      setToggling(false);
    }
  }

  async function uninstall() {
    if (!id) return;
    if (deps.length > 0) {
      await dialog.confirm({
        title: t("dialog.uninstallBlockedTitle"),
        body: t("plugins.blockedByDependents"),
        list: deps.map((u) => u.kind + " " + u.id + (u.requires ? " (" + u.requires + ")" : "")),
        confirmLabel: t("common.close"),
        danger: false,
      });
      return;
    }
    const ok = await dialog.confirm({
      title: t("dialog.uninstallTitle", { id }),
      body: t("plugins.confirmUninstall", { id }),
      confirmLabel: t("plugins.uninstall"),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await packageRollback(id);
      toast("success", t("toast.uninstalled", { name: id }));
      load();
    } catch (e) {
      setErr(e);
      toast("error", t("toast.uninstallFailed"), id);
    } finally {
      setBusy(false);
    }
  }

  if (err && !pkg) {
    return (
      <div className="page">
        <ErrorCard error={err} onRetry={load} title={t("mp.loadFailed")} />
      </div>
    );
  }
  if (!pkg) {
    return (
      <div className="page">
        <RowSkeleton rows={5} />
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
  const repo = source.repository ?? null;
  const repoShort = repo ? String(repo).replace("https://github.com/", "github.com/") : null;
  const installed = entry !== null;
  const enabled = entry?.enabled !== false;
  const secStatus: string = pkg.security?.status ?? t("mp.unscanned");
  const capLabel = (c: string) => (CAP_LABEL[c] ? CAP_LABEL[c][locale] : c);
  const isAgentLike = entry && (entry.kind === "agent" || entry.profile);

  const tabs: Tab[] = ["overview", "capabilities", "dependencies", "security", "readme"];

  return (
    <div className="page">
      <div className="crumb">
        <Link to="/marketplace">
          <ArrowLeft size={12} />
          {t("nav.marketplace")}
        </Link>
      </div>

      <div className="detail-title-row">
        <div>
          <div className="detail-name">
            {pkg.name}
            <span className="detail-ver">v{pkg.version}</span>
          </div>
          <p className="detail-desc">{pkg.description || "—"}</p>
          <div className="detail-meta">
            {repoShort && (
              <a
                className="badge badge-community"
                href={repo ?? "#"}
                rel="noopener noreferrer"
                style={{ textTransform: "none", letterSpacing: 0 }}
                onClick={(e) => {
                  e.preventDefault();
                  if (repo) void openExternal(String(repo));
                }}
              >
                <Github size={11} />
                {repoShort}
              </a>
            )}
            <Badge tone="community">{license}</Badge>
            <Badge tone="community">{pkg.type}</Badge>
            {installed && (
              <Badge tone={secStatus === "unscanned" ? "warning" : "verified"}>
                {secStatus === "unscanned" ? t("mp.unscanned") : "✓ " + secStatus}
              </Badge>
            )}
            {stars !== null && (
              <span className="badge badge-community">★ {stars}</span>
            )}
          </div>
        </div>

        <div className="detail-actions">
          {installed ? (
            <>
              <Status tone={enabled ? "on" : "off"} label={enabled ? t("pd.active") : t("plugins.disabled")} />
              {installPath && pkg.type !== "agent" && (
                <button
                  className="btn btn-outline"
                  onClick={() => void wrapAsAgent()}
                  disabled={wrapping || busy}
                  title={t("pd.wrapHint")}
                >
                  {wrapping ? (
                    <InlineLoading label={t("pd.wrapping")} />
                  ) : (
                    <>
                      <Sparkles size={13} />
                      {t("pd.wrap")}
                    </>
                  )}
                </button>
              )}
              {outdated && (
                <button className="btn btn-primary" onClick={() => void update()} disabled={updating || busy}>
                  {updating ? <InlineLoading label={t("updates.updating")} /> : t("updates.update") + " v" + outdated}
                </button>
              )}
              {repo && (
                <a
                  className="btn btn-outline"
                  href={String(repo)}
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.preventDefault();
                    void openExternal(String(repo));
                  }}
                >
                  <ExternalLink size={13} />
                  {t("pd.open")}
                </a>
              )}
              {isAgentLike && (
                <Link className="btn btn-outline" to="/agents">
                  {t("pd.configure")}
                </Link>
              )}
              <button className="btn btn-ghost" onClick={() => void toggleEnabled()} disabled={toggling || busy}>
                <Power size={13} />
                {enabled ? t("plugins.disable") : t("plugins.enable")}
              </button>
              <button className="btn btn-ghost" onClick={() => void uninstall()} disabled={busy}>
                <Unplug size={13} />
                {t("plugins.uninstall")}
              </button>
            </>
          ) : (
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() =>
                setInstallTarget({
                  id: pkg.id,
                  name: pkg.name,
                  version: String(pkg.version ?? ""),
                  repository: repo,
                  license: license === "—" ? null : license,
                  capabilities: caps,
                })
              }
            >
              {busy ? <InlineLoading label={t("mp.installing")} /> : t("mp.install")}
            </button>
          )}
        </div>
      </div>

      {err ? (
        <div style={{ marginTop: 16 }}>
          <ErrorCard error={err} />
        </div>
      ) : null}

      <div className="detail-tabs">
        <div className="tabs">
          {tabs.map((tb) => (
            <button
              key={tb}
              className={"tab" + (tab === tb ? " on" : "")}
              onClick={() => setTab(tb)}
            >
              {t(TAB_KEYS[tb])}
              {tb === "dependencies" && deps.length > 0 && (
                <span className="tab-count">{deps.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="detail-panel">
        {tab === "overview" && (
          <div>
            <div className="detail-sec">
              <div className="detail-sec-head">
                <span className="detail-sec-title">{t("pd.description")}</span>
              </div>
              <p className="sub" style={{ lineHeight: 1.65, maxWidth: 680 }}>{pkg.description || "—"}</p>
            </div>
            {(() => {
              // 组合包（agent 类型）：展示真实组件（skills/presets/bundles）
              const comps = (pkg as any)?.runtime?.components;
              const skills = Array.isArray(comps?.skills) ? comps.skills : [];
              const presets = Array.isArray(comps?.presets) ? comps.presets.map((p: any) => p?.id ?? String(p)) : [];
              const bundles = Array.isArray(comps?.bundles) ? comps.bundles.map((b: any) => b?.package ?? String(b)) : [];
              if (skills.length + presets.length + bundles.length === 0) return null;
              return (
                <div className="detail-sec">
                  <div className="detail-sec-head">
                    <span className="detail-sec-title">组合包组件</span>
                  </div>
                  {skills.length > 0 && (
                    <div className="kv">
                      <span className="kv-k">Skills（真实技能）</span>
                      <span className="kv-v" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {skills.map((s: string) => (
                          <span key={s} className="chip">{s}</span>
                        ))}
                      </span>
                    </div>
                  )}
                  {presets.length > 0 && (
                    <div className="kv">
                      <span className="kv-k">Presets（专业预设）</span>
                      <span className="kv-v" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {presets.map((p: string) => (
                          <span key={p} className="chip">{p}</span>
                        ))}
                      </span>
                    </div>
                  )}
                  {bundles.length > 0 && (
                    <div className="kv">
                      <span className="kv-k">Bundles（能力包）</span>
                      <span className="kv-v" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {bundles.map((b: string) => (
                          <span key={b} className="chip">{b}</span>
                        ))}
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="detail-sec">
              <div className="detail-sec-head">
                <span className="detail-sec-title">{t("pd.compatibility")}</span>
              </div>
              <div className="kv">
                <span className="kv-k">{t("pd.forge")}</span>
                <span className="kv-v mono">{pkg.compatibility?.forge ?? "—"}</span>
              </div>
              <div className="kv">
                <span className="kv-k">{t("pd.dsh")}</span>
                <span className="kv-v mono">
                  {pkg.compatibility?.dsh?.min
                    ? "min " +
                      pkg.compatibility.dsh.min +
                      (Array.isArray(pkg.compatibility.dsh.tested) &&
                      pkg.compatibility.dsh.tested.length > 0
                        ? " · tested " + pkg.compatibility.dsh.tested.join(", ")
                        : "")
                    : "—"}
                </span>
              </div>
              <div className="kv">
                <span className="kv-k">{t("pd.node")}</span>
                <span className="kv-v mono">{pkg.compatibility?.node ?? "—"}</span>
              </div>
              <div className="kv">
                <span className="kv-k">{t("pd.platform")}</span>
                <span className="kv-v mono">
                  {Array.isArray(pkg.compatibility?.platform) &&
                  pkg.compatibility.platform.length > 0
                    ? pkg.compatibility.platform.join(", ")
                    : "—"}
                </span>
              </div>
              {installPath && (
                <div className="kv">
                  <span className="kv-k">{t("pd.installLocation")}</span>
                  <span className="kv-v mono">{installPath}</span>
                </div>
              )}
              <div className="kv">
                <span className="kv-k">{t("pd.originalAuthor")}</span>
                <span className="kv-v">{upstream.author ?? pkg.publisher?.id ?? "—"}</span>
              </div>
              <div className="kv">
                <span className="kv-k">{t("pd.lastUpdated")}</span>
                <span className="kv-v mono">{pushedAt ?? "—"}</span>
              </div>
            </div>
          </div>
        )}

        {tab === "capabilities" && (
          <div>
            <div className="detail-sec">
              <div className="detail-sec-head">
                <span className="detail-sec-title">{t("mp.capabilities")}</span>
              </div>
              {caps.length === 0 ? (
                <p className="sub">{t("pd.capsEmpty")}</p>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {caps.map((c) => (
                    <span key={c} className="chip">
                      {capLabel(c)}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="detail-sec">
              <div className="detail-sec-head">
                <span className="detail-sec-title">{t("pd.permissions")}</span>
              </div>
              {!entry?.permissions ? (
                <p className="sub">{t("pd.permissionsNone")}</p>
              ) : (
                <>
                  <div className="kv">
                    <span className="kv-k">{t("pd.network")}</span>
                    <span className="kv-v mono">
                      {(entry.permissions.network ?? []).length > 0
                        ? entry.permissions.network.slice(0, 8).join(", ")
                        : t("sy.none")}
                    </span>
                  </div>
                  <div className="kv">
                    <span className="kv-k">{t("pd.filesystem")}</span>
                    <span className="kv-v mono">
                      {(entry.permissions.filesystem ?? []).length > 0
                        ? entry.permissions.filesystem.slice(0, 8).join(", ")
                        : t("sy.none")}
                    </span>
                  </div>
                  <div className="kv">
                    <span className="kv-k">{t("pd.env")}</span>
                    <span className="kv-v mono">
                      {(entry.permissions.env ?? []).length > 0
                        ? entry.permissions.env.slice(0, 8).join(", ")
                        : t("sy.none")}
                    </span>
                  </div>
                  <p className="field-hint">{t("pd.permissionsNote")}</p>
                </>
              )}
            </div>
          </div>
        )}

        {tab === "dependencies" && (
          <div>
            <div className="detail-sec">
              <div className="detail-sec-head">
                <span className="detail-sec-title">{t("pd.dependencies")}</span>
                <span className="sec-count">{depList.length}</span>
              </div>
              {depList.length === 0 ? (
                <p className="sub">{t("pd.noDeps")}</p>
              ) : (
                <div className="list" style={{ borderRadius: 8 }}>
                  {depList.map((d, i) => (
                    <div key={i} className="list-row" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                      <span className="cell-title mono">{d.package ?? "?"}</span>
                      <span className="kv-v mono" style={{ color: "var(--muted)" }}>
                        {d.version ?? "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="detail-sec">
              <div className="detail-sec-head">
                <span className="detail-sec-title">{t("pd.usedBy")}</span>
                <span className="sec-count">{deps.length}</span>
              </div>
              {deps.length === 0 ? (
                <p className="sub">{t("pd.usedByNone")}</p>
              ) : (
                <div className="list" style={{ borderRadius: 8 }}>
                  {deps.map((u, i) => (
                    <div key={i} className="list-row" style={{ gridTemplateColumns: "72px minmax(0,1fr) auto" }}>
                      <Badge tone="community">{u.kind}</Badge>
                      <span className="cell-title mono">{u.id}</span>
                      <span className="kv-v mono" style={{ color: "var(--muted)" }}>
                        {u.requires}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "security" && (
          <div className="detail-sec">
            <div className="detail-sec-head">
              <span className="detail-sec-title">{t("mp.security")}</span>
            </div>
            <div className="kv">
              <span className="kv-k">
                <ShieldCheck size={12} />
                {t("pd.securityStatus")}
              </span>
              <span className={"kv-v " + (secStatus === "unscanned" ? "warn" : "ok")}>
                {secStatus}
              </span>
            </div>
            {installed && (
              <>
                <div className="kv">
                  <span className="kv-k">{t("pd.integrity")}</span>
                  <span className="kv-v ok">{t("pd.verifiedValue")}</span>
                </div>
                <div className="kv">
                  <span className="kv-k">{t("pd.signature")}</span>
                  <span className="kv-v ok">{t("pd.verifiedValue")}</span>
                </div>
              </>
            )}
            {entry?.scanVerdict && (
              <div className="kv">
                <span className="kv-k">{t("mp.scanned")}</span>
                <span className="kv-v">{String(entry.scanVerdict)}</span>
              </div>
            )}
            {entry?.trust && (
              <div className="kv">
                <span className="kv-k">{t("sy.trust")}</span>
                <span className="kv-v">{String(entry.trust)}</span>
              </div>
            )}
            {entry?.score !== undefined && (
              <div className="kv">
                <span className="kv-k">{t("sy.score")}</span>
                <span className="kv-v">{String(entry.score)}/100</span>
              </div>
            )}
            <p className="field-hint" style={{ marginTop: 8 }}>
              {t("sy.securityNote")}
            </p>
          </div>
        )}

        {tab === "readme" && (
          <div>
            <div className="detail-sec">
              <div className="detail-sec-head">
                <span className="detail-sec-title">{t("pd.readme")}</span>
              </div>
              <p className="sub">{t("pd.readmeEmpty")}</p>
              {repoShort && (
                <a
                  className="btn btn-outline btn-sm"
                  style={{ marginTop: 12 }}
                  href={String(repo)}
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.preventDefault();
                    if (repo) void openExternal(String(repo));
                  }}
                >
                  <Github size={12} />
                  {t("pd.readmeOpen")} <ExternalLink size={11} />
                </a>
              )}
            </div>
            <div className="detail-sec">
              <div className="detail-sec-head">
                <span className="detail-sec-title">{t("pd.versions")}</span>
                <span className="sec-count">{versions.length}</span>
              </div>
              {versions.length === 0 ? (
                <p className="sub">{t("pd.noVersions")}</p>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {versions.map((v) => (
                    <span key={v} className={"chip" + (v === pkg.version ? " is-current" : "")}>
                      {v === pkg.version ? "v" + v + " · " + t("pd.current") : "v" + v}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <InstallDialog
        target={installTarget}
        onClose={() => setInstallTarget(null)}
        onFinished={load}
      />
    </div>
  );
}
