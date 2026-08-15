// Installation sheet — the single most important Forge interaction.
// Step 1: review the package summary (version/source/license/capabilities/
// dependencies/security). Step 2: confirm → real installPackage IPC with a
// live, event-driven pipeline. No fake steps, no instant "Installed".
import { useCallback, useEffect, useState } from "react";
import { Github, ShieldCheck } from "lucide-react";
import { installPackage, registryInfo } from "../ipc";
import { useI18n } from "../i18n";
import { Modal, useToast } from "./ui";
import InstallProgress from "./InstallProgress";

export interface InstallTarget {
  id: string;
  name: string;
  version?: string;
  repository?: string | null;
  license?: string | null;
  capabilities?: string[];
}

type SheetStatus = "confirm" | "running" | "done" | "failed";

export default function InstallDialog({
  target,
  onClose,
  onFinished,
}: {
  target: InstallTarget | null;
  onClose: () => void;
  onFinished?: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [status, setStatus] = useState<SheetStatus>("confirm");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<{
    dependencies?: { package?: string; version?: string | null }[];
    security?: string;
    license?: string;
    dataSources?: { id: string; label?: string; default?: boolean }[];
  } | null>(null);
  const [dataSource, setDataSource] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setStatus("confirm");
    setErr(null);
    setInfo(null);
    setDataSource(null);
    registryInfo(target.id)
      .then((p) => {
        const pkg = p as Record<string, any>;
        setInfo({
          dependencies: Array.isArray(pkg.dependencies) ? pkg.dependencies : [],
          security: pkg.security?.status ?? undefined,
          license: pkg.license?.spdx ?? undefined,
          dataSources: Array.isArray(pkg.dataSources) ? pkg.dataSources : [],
        });
      })
      .catch(() => setInfo({}));
  }, [target]);

  const start = useCallback(async () => {
    if (!target) return;
    setStatus("running");
    setErr(null);
    try {
      await installPackage(target.id, dataSource);
      setStatus("done");
      toast("success", t("toast.installed", { name: target.name }), t("toast.installedBody"));
      onFinished?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStatus("failed");
      toast("error", t("toast.installFailed"), target.name);
    }
  }, [target, toast, t, onFinished]);

  if (!target) return null;

  const deps = info?.dependencies ?? [];
  const security = info?.security;
  const license = target.license ?? info?.license ?? null;
  const repoShort = target.repository
    ? String(target.repository).replace("https://github.com/", "github.com/")
    : null;

  const body =
    status === "confirm" ? (
      <div className="install-sheet">
        <p className="sub" style={{ marginBottom: 12 }}>
          {t("install.reviewNote")}
        </p>
        <div className="sheet-kv">
          <span className="k">{t("mp.version")}</span>
          <span className="v mono">v{target.version ?? "—"}</span>
        </div>
        <div className="sheet-kv">
          <span className="k">{t("mp.source")}</span>
          <span className="v mono">{repoShort ?? "—"}</span>
        </div>
        <div className="sheet-kv">
          <span className="k">{t("mp.license")}</span>
          <span className="v mono">{license ?? "—"}</span>
        </div>
        {(target.capabilities ?? []).length > 0 && (
          <div className="sheet-kv">
            <span className="k">{t("mp.capabilities")}</span>
            <span className="v" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {target.capabilities!.slice(0, 5).map((c) => (
                <span key={c} className="chip">{c}</span>
              ))}
            </span>
          </div>
        )}
        <div className="sheet-kv">
          <span className="k">{t("pd.dependencies")}</span>
          <span className="v mono">{t("install.depsCount", { n: deps.length })}</span>
        </div>
        <div className="sheet-kv">
          <span className="k">
            <ShieldCheck size={12} /> {t("mp.security")}
          </span>
          {security && security !== "unscanned" ? (
            <span className="v ok">✓ {security}</span>
          ) : (
            <span className="v">{t("mp.unscanned")}</span>
          )}
        </div>
        {(info?.dataSources ?? []).length > 0 && (
          <div className="sheet-kv" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
            <span className="k">{t("install.dataSource")}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {(info?.dataSources ?? []).map((ds) => (
                <label
                  key={ds.id}
                  className={"ds-option" + (dataSource === ds.id ? " on" : "")}
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    padding: "4px 8px",
                    borderRadius: 6,
                    cursor: "pointer",
                    border: "1px solid var(--border)",
                    background: dataSource === ds.id ? "var(--surface-2, rgba(255,255,255,0.04))" : "transparent",
                  }}
                >
                  <input
                    type="radio"
                    name="data-source"
                    checked={dataSource === ds.id}
                    onChange={() => setDataSource(ds.id)}
                  />
                  <span className="v" style={{ fontSize: 12 }}>
                    {ds.label ?? ds.id}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    ) : (
      <div className="install-sheet">
        <p className="sub" style={{ marginBottom: 4 }}>
          {t("install.progressNote")}
        </p>
        <InstallProgress
          targetId={target.id}
          onDone={() => setStatus("done")}
          onFailed={() => setStatus("failed")}
        />
        {status === "failed" && (
          <div className="error-reason" style={{ marginTop: 8 }}>
            <span className="lbl">{t("err.reason")}</span> {err}
          </div>
        )}
        {status === "done" && (
          <div className="note" data-tone="ok" style={{ marginTop: 8 }}>
            <Github size={13} className="note-ico" />
            <span>
              {t("install.doneBody")} {repoShort && <span className="mono">{repoShort}</span>}
            </span>
          </div>
        )}
      </div>
    );

  const footer =
    status === "confirm" ? (
      <>
        <button className="btn btn-ghost" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button className="btn btn-primary" onClick={() => void start()}>
          {t("install.confirm")}
        </button>
      </>
    ) : status === "failed" ? (
      <>
        <button className="btn btn-ghost" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button className="btn btn-outline" onClick={() => void start()}>
          {t("mp.retry")}
        </button>
      </>
    ) : (
      <button className="btn btn-ghost" onClick={onClose}>
        {t("common.close")}
      </button>
    );

  return (
    <Modal
      title={
        status === "confirm"
          ? t("install.title", { name: target.name })
          : status === "running"
            ? t("install.installingTitle", { name: target.name })
            : status === "failed"
              ? t("install.failedTitle")
              : t("install.doneTitle")
      }
      onClose={onClose}
      footer={footer}
      width={460}
    >
      <div className="modal-body">{body}</div>
    </Modal>
  );
}
