// My Plugins — the local agent capability store (Plugins / Skills / MCP / Tools).
// Dense list: package / status / version / last updated / used-by / actions.
// Enable·Disable, review, update, uninstall — all real Rust Core operations.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ExternalLink,
  Power,
  RefreshCw,
  Search,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import {
  dependentsList,
  openExternal,
  packageRollback,
  setPluginEnabled,
  setPluginReview,
  stateList,
  updateApply,
  updateCheck,
} from "../ipc";
import type { DependentRef, InstalledAgent } from "../ipc";
import { useI18n } from "../i18n";
import {
  Badge,
  EmptyState,
  ErrorCard,
  InlineLoading,
  RowSkeleton,
  Segmented,
  Status,
  useDialog,
  useToast,
} from "../components/ui";

type Filter = "all" | "active" | "disabled" | "updates";

export interface PluginsPageProps {
  /** Component kinds managed on this page. */
  kinds?: string[];
  /** i18n key of the page heading. */
  titleKey?: string;
  /** i18n key of the page subtitle. */
  subtitleKey?: string;
  /** i18n key of the "n installed" prefix ({n}). */
  subCountKey?: string;
  /** i18n key of the empty-state title. */
  emptyTitleKey?: string;
  /** i18n key of the empty-state body. */
  emptyBodyKey?: string;
}

export default function Plugins({
  kinds,
  titleKey = "nav.plugins",
  subtitleKey = "plugins.subtitle",
  subCountKey = "plugins.subCount",
  emptyTitleKey = "plugins.emptyTitle",
  emptyBodyKey = "plugins.emptyBodyFull",
}: PluginsPageProps = {}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const dialog = useDialog();
  const toast = useToast();
  const [agents, setAgents] = useState<Record<string, InstalledAgent> | null>(null);
  const [deps, setDeps] = useState<Record<string, DependentRef[]>>({});
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [outdated, setOutdated] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");

  const MANAGED_KINDS = kinds ?? ["plugin", "mcp", "skill", "tool"];

  function load() {
    setErr(null);
    updateCheck()
      .then((entries) => {
        const map: Record<string, string> = {};
        for (const e of entries) {
          if (e.outdated) map[e.id] = e.latest;
        }
        setOutdated(map);
      })
      .catch(() => setOutdated({}));
    stateList()
      .then((s) => {
        const list = s.agents ?? {};
        setAgents(list);
        const ids = Object.entries(list)
          .filter(([, a]) => MANAGED_KINDS.includes(a.kind ?? "plugin"))
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
      .catch((e: unknown) => setErr(e));
  }
  useEffect(load, [MANAGED_KINDS.join(",")]);

  async function toggleEnabled(id: string, enabled: boolean) {
    setBusy("toggle:" + id);
    setErr(null);
    try {
      await setPluginEnabled(id, enabled);
      toast("success", enabled ? t("toast.enabled", { name: id }) : t("toast.disabled", { name: id }));
      load();
    } catch (e) {
      setErr(e);
      toast("error", t("common.failed"), id);
    } finally {
      setBusy(null);
    }
  }

  async function review(id: string, status: "approved" | "rejected") {
    setBusy("review:" + id);
    setErr(null);
    try {
      await setPluginReview(id, status);
      toast(
        "success",
        status === "approved"
          ? t("toast.reviewApproved", { name: id })
          : t("toast.reviewRejected", { name: id })
      );
      load();
    } catch (e) {
      setErr(e);
      toast("error", t("common.failed"), id);
    } finally {
      setBusy(null);
    }
  }

  async function update(id: string) {
    setBusy("update:" + id);
    setErr(null);
    try {
      await updateApply(id);
      toast("success", t("toast.updated", { name: id }), "v" + (outdated[id] ?? ""));
      load();
    } catch (e) {
      setErr(e);
      toast("error", t("toast.updateFailed"), id);
    } finally {
      setBusy(null);
    }
  }

  async function uninstall(id: string) {
    const used = deps[id] ?? [];
    if (used.length > 0) {
      await dialog.confirm({
        title: t("dialog.uninstallBlockedTitle"),
        body: t("plugins.blockedByDependents"),
        list: used.map(
          (u) => u.kind + " " + u.id + (u.requires ? " (" + u.requires + ")" : "")
        ),
        confirmLabel: t("common.close"),
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
    setBusy(id);
    setErr(null);
    try {
      await packageRollback(id);
      toast("success", t("toast.uninstalled", { name: id }));
      load();
    } catch (e) {
      setErr(e);
      toast("error", t("toast.uninstallFailed"), id);
    } finally {
      setBusy(null);
    }
  }

  const allEntries = useMemo(
    () =>
      Object.entries(agents ?? {}).filter(([, a]) =>
        MANAGED_KINDS.includes(a.kind ?? "plugin")
      ),
    [agents, MANAGED_KINDS]
  );

  const entries = useMemo(() => {
    let list = allEntries;
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(([id, a]) =>
        [id, a.kind ?? "", a.source ?? "", a.version ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    if (filter === "active") list = list.filter(([, a]) => a.enabled !== false);
    else if (filter === "disabled") list = list.filter(([, a]) => a.enabled === false);
    else if (filter === "updates") list = list.filter(([id]) => id in outdated);
    return list;
  }, [allEntries, query, filter, outdated]);

  const counts = useMemo(
    () => ({
      all: allEntries.length,
      active: allEntries.filter(([, a]) => a.enabled !== false).length,
      disabled: allEntries.filter(([, a]) => a.enabled === false).length,
      updates: allEntries.filter(([id]) => id in outdated).length,
    }),
    [allEntries, outdated]
  );

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-heading">{t(titleKey)}</h1>
          <p className="page-sub">
            {agents
              ? t(subCountKey, { n: allEntries.length }) + " · " + t(subtitleKey)
              : t(subtitleKey)}
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn btn-primary" to="/marketplace">
            {t("plugins.browseMarketplace")}
          </Link>
        </div>
      </header>

      {err ? <ErrorCard error={err} onRetry={load} /> : null}

      {!agents && !err && <RowSkeleton rows={6} />}

      {agents && (
        <>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <Segmented<Filter>
              value={filter}
              onChange={setFilter}
              ariaLabel={t("plugins.filter")}
              options={[
                { value: "all", label: t("plugins.filterAll"), count: counts.all },
                { value: "active", label: t("plugins.enabled"), count: counts.active },
                { value: "disabled", label: t("plugins.disabled"), count: counts.disabled },
                { value: "updates", label: t("updates.title"), count: counts.updates },
              ]}
            />
            <div className="search-box" style={{ maxWidth: 260, marginLeft: "auto" }}>
              <Search size={13} className="search-icon" />
              <input
                className="input"
                placeholder={t("plugins.search")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          {entries.length === 0 && !query && (
            <EmptyState
              icon={ShieldCheck}
              title={t(emptyTitleKey)}
              body={t(emptyBodyKey)}
            >
              <Link className="btn btn-primary" to="/marketplace">
                {t("plugins.exploreMarketplace")}
              </Link>
            </EmptyState>
          )}

          {entries.length === 0 && query && (
            <EmptyState icon={Search} title={t("mp.empty")} />
          )}

          {entries.length > 0 && (
            <div className="list">
              <div
                className="list-head"
                style={{ gridTemplateColumns: "minmax(0, 1fr) 130px 90px 150px 90px auto" }}
              >
                <span className="col-label">{t("plugins.package")}</span>
                <span className="col-label">{t("plugins.statusCol")}</span>
                <span className="col-label">{t("mp.version")}</span>
                <span className="col-label">{t("plugins.lastUpdated")}</span>
                <span className="col-label">{t("plugins.usedBy")}</span>
                <span className="col-label" style={{ textAlign: "right" }}>{t("plugins.actions")}</span>
              </div>
              {entries.map(([id, a]) => {
                const used = deps[id] ?? [];
                const enabled = a.enabled !== false;
                return (
                  <div
                    key={id}
                    className="list-row list-row--clickable"
                    style={{ gridTemplateColumns: "minmax(0, 1fr) 130px 90px 150px 90px auto" }}
                    onClick={() => navigate("/plugins/" + id)}
                    title={t("mp.viewDetails")}
                  >
                    <div className="cell">
                      <Link to={"/plugins/" + id} className="cell-title mono">
                        {id}
                      </Link>
                      <div className="cell-sub">
                        {a.kind ?? "plugin"}
                        {a.source
                          ? (
                            <>
                              {" · "}
                              <a
                                className="cell-link"
                                href={String(a.source)}
                                rel="noopener noreferrer"
                                title={t("pd.open")}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (a.source) void openExternal(String(a.source));
                                }}
                              >
                                {String(a.source).replace("https://github.com/", "github.com/")}
                                <ExternalLink size={9} />
                              </a>
                            </>
                          )
                          : ""}
                        {a.imported && (
                          <span style={{ marginLeft: 6 }}>
                            <Badge tone="community">{t("plugins.imported")}</Badge>
                          </span>
                        )}
                      </div>
                      {a.imported && (a.reviewStatus ?? "pending") !== "approved" && (
                        <div style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
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
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              void review(id, "approved");
                            }}
                            disabled={busy !== null}
                          >
                            {busy === "review:" + id ? (
                              <InlineLoading label={t("plugins.approve")} />
                            ) : (
                              t("plugins.approve")
                            )}
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              void review(id, "rejected");
                            }}
                            disabled={busy !== null}
                          >
                            {t("plugins.reject")}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="cell">
                      <Status
                        tone={enabled ? "on" : "off"}
                        label={enabled ? t("plugins.enabled") : t("plugins.disabled")}
                      />
                    </div>
                    <div className="cell">
                      <span className="mono" style={{ fontSize: 11.5, color: "var(--foreground-2)" }}>
                        v{a.version ?? "—"}
                      </span>
                    </div>
                    <div className="cell">
                      <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                        {a.installedAt ?? "—"}
                      </span>
                    </div>
                    <div className="cell">
                      {used.length > 0 ? (
                        <span
                          className="mono"
                          style={{ fontSize: 11.5, color: "var(--warning)" }}
                          title={used.map((u) => u.kind + " " + u.id).join(", ")}
                        >
                          {t("plugins.usedBy", { n: used.length })}
                        </span>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      )}
                    </div>
                    <div className="cell-actions">
                      {outdated[id] && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            void update(id);
                          }}
                          disabled={busy !== null}
                        >
                          {busy === "update:" + id ? (
                            <InlineLoading label={t("updates.update")} />
                          ) : (
                            <>
                              <RefreshCw size={12} />
                              {t("updates.update")} v{outdated[id]}
                            </>
                          )}
                        </button>
                      )}
                      <button
                        className="icon-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleEnabled(id, !enabled);
                        }}
                        disabled={busy !== null}
                        aria-label={(enabled ? t("plugins.disable") : t("plugins.enable")) + " " + id}
                        title={enabled ? t("plugins.disable") : t("plugins.enable")}
                      >
                        <Power size={13} />
                      </button>
                      <button
                        className="icon-btn danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          void uninstall(id);
                        }}
                        disabled={busy !== null}
                        aria-label={t("plugins.uninstall") + " " + id}
                        title={t("plugins.uninstall")}
                      >
                        <Unplug size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
