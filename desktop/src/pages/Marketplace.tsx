// STEP 4: Marketplace —— 真实 Local Registry 数据：搜索/分类/排序/卡片/安装状态。
// 安装 = install_package IPC（Core 收录式安装：克隆→扫描→状态登记），无 mock。
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Box, Github, LoaderCircle, ShieldCheck, Star, TriangleAlert } from "lucide-react";
import { installPackage, registryList, stateList } from "../ipc";
import type { RegistrySummary } from "../ipc";
import { useI18n } from "../i18n";
import InstallProgress from "../components/InstallProgress";

type InstallState = { id: string; status: "busy" | "ok" | "error"; message?: string; steps?: string[] };

export default function Marketplace() {
  const { t } = useI18n();
  const [packages, setPackages] = useState<RegistrySummary[] | null>(null);
  const [installed, setInstalled] = useState<Record<string, unknown>>({});
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState("popular");
  const [installing, setInstalling] = useState<InstallState | null>(null);
  const [onlyInstalled, setOnlyInstalled] = useState(false);
  const [licFilter, setLicFilter] = useState("all");

  function load() {
    setErr(null);
    setPackages(null);
    Promise.all([registryList(), stateList()])
      .then(([pkgs, state]) => {
        setPackages(pkgs);
        setInstalled((state.agents ?? {}) as Record<string, unknown>);
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
  }

  useEffect(load, []);

  async function install(id: string) {
    setInstalling({ id, status: "busy" });
    try {
      const res = await installPackage(id);
      setInstalling({ id, status: "ok", steps: (res.steps as string[]) ?? [] });
      load();
    } catch (e) {
      setInstalling({ id, status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  const filtered = useMemo(() => {
    let list = packages ?? [];
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((p) =>
        [p.name, p.id, p.description, p.category ?? "", p.license ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    if (cat !== "all") {
      list = list.filter((p) => p.type === cat);
    }
    if (onlyInstalled) {
      list = list.filter((p) => p.id in installed);
    }
    if (licFilter !== "all") {
      list = list.filter((p) => (p.license ?? "") === licFilter);
    }
    const sorted = [...list];
    if (sort === "popular") sorted.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));
    else if (sort === "recent") sorted.sort((a, b) => a.id.localeCompare(b.id));
    else sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [packages, query, cat, sort, onlyInstalled, installed, licFilter]);

  const licenses = useMemo(() => {
    const set = new Set<string>();
    (packages ?? []).forEach((p) => {
      if (p.license) set.add(p.license);
    });
    return Array.from(set).sort();
  }, [packages]);

  const cats = useMemo(() => {
    const set = new Set<string>();
    (packages ?? []).forEach((p) => set.add(p.type));
    return ["all", ...Array.from(set)];
  }, [packages]);

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-heading">{t("mp.title")}</h1>
        <p className="page-sub">{t("mp.subtitle")}</p>
      </header>

      <div className="card marketplace-toolbar">
        <input
          className="input"
          placeholder={t("mp.search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1 }}
        />
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 160 }}>
          <option value="popular">{t("mp.sort.popular")}</option>
          <option value="recent">{t("mp.sort.recent")}</option>
          <option value="az">{t("mp.sort.az")}</option>
        </select>
        <select className="input" value={licFilter} onChange={(e) => setLicFilter(e.target.value)} style={{ width: 170 }}>
          <option value="all">{t("mp.filterLicense")}</option>
          {licenses.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      <div className="marketplace-cats" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0", alignItems: "center" }}>
        <button
          className={"btn " + (onlyInstalled ? "btn-primary" : "btn-ghost")}
          onClick={() => setOnlyInstalled((v) => !v)}
        >
          {onlyInstalled ? t("mp.onlyInstalled") : t("mp.allPackages")}
        </button>
        {cats.map((c) => (
          <button
            key={c}
            className={"btn " + (cat === c ? "btn-primary" : "btn-ghost")}
            onClick={() => setCat(c)}
          >
            {c === "all" ? t("mp.all") : c}
          </button>
        ))}
      </div>

      {err && (
        <div className="card error-state">
          <TriangleAlert size={22} className="err-icon" />
          <p>{t("mp.loadFailed")} {err}</p>
          <button className="btn btn-ghost" onClick={load}>{t("mp.retry")}</button>
        </div>
      )}

      {!err && !packages && (
        <div className="dashboard-loading" role="status">
          <LoaderCircle size={16} className="spin" />
          <span>{t("mp.loading")}</span>
        </div>
      )}

      {!err && packages && filtered.length === 0 && (
        <div className="card empty-card">
          <div className="empty-card-head">
            <Box size={15} />
            <span className="empty-card-title">{t("mp.empty")}</span>
          </div>
        </div>
      )}

      <div className="marketplace-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {filtered.map((p) => {
          const isInstalled = p.id in installed;
          const busy = installing?.id === p.id && installing.status === "busy";
          return (
            <div key={p.id} className="card pkg-card">
              <div className="pkg-card-head">
                <span className="pkg-icon pkg-icon--agent">
                  <Github size={15} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link to={"/plugins/" + p.id} className="mono" style={{ fontWeight: 600 }}>
                    {p.name}
                  </Link>
                  <div className="field-hint">
                    {p.type} · v{p.versionLatest}
                  </div>
                </div>
                {p.stars !== null && p.stars !== undefined && (
                  <span className="stat" title="GitHub stars">
                    <Star size={12} /> {p.stars}
                  </span>
                )}
              </div>

              <p className="sub" style={{ margin: "8px 0", minHeight: 36 }}>
                {p.description || "—"}
              </p>

              <div className="field-hint" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <span className="badge badge-community">{t("mp.openSource")}</span>
                {p.license && <span className="badge badge-community">{p.license}</span>}
                {p.category && <span className="badge badge-community">{p.category}</span>}
              </div>

              <div className="registry-row" style={{ padding: 0 }}>
                <span className="registry-k">
                  <ShieldCheck size={13} /> {t("mp.security")}
                </span>
                <span className="registry-v">
                  {isInstalled && (installed[p.id] as { scanVerdict?: string })?.scanVerdict
                    ? t("mp.scanned") + " · " + (installed[p.id] as { scanVerdict?: string }).scanVerdict
                    : t("mp.unscanned")}
                </span>
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
                {isInstalled ? (
                  <span className="badge badge-verified">{t("mp.installed")} ✓</span>
                ) : (
                  <button className="btn btn-primary" disabled={busy} onClick={() => void install(p.id)}>
                    {busy ? <LoaderCircle size={14} className="spin" /> : null}
                    {busy ? t("mp.installing") : t("mp.install")}
                  </button>
                )}
              </div>

              {installing?.id === p.id && installing.status === "busy" && (
                <InstallProgress targetId={p.id} />
              )}
              {installing?.id === p.id && installing.status === "ok" && (
                <div className="field-hint" style={{ marginTop: 8 }}>
                  {t("mp.imported")} ✓ — {(installing.steps ?? []).join(" → ")}
                  <br />
                  {t("mp.importedNote")}
                </div>
              )}
              {installing?.id === p.id && installing.status === "error" && (
                <div className="field-error" style={{ marginTop: 8 }}>
                  {t("common.failed")}: {installing.message}
                  <button className="btn btn-ghost" onClick={() => void install(p.id)}>{t("mp.retry")}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
