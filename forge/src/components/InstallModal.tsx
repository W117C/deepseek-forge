import { useEffect, useMemo, useState } from "react";
import { Check, Download, ShieldCheck } from "lucide-react";
import type { AnyPackage } from "../types";
import { useApp } from "../context/app";
import { typeLabel } from "../lib/registry";
import { ModalShell } from "./Modal";
import { TypeIcon } from "./icons";
import { TrustBadge } from "./badges";
import { copyText } from "../lib/hooks";

type Phase = "confirm" | "running" | "done";

interface Line { id: number; text: string; kind: "cmd" | "dim" | "ok" | "accent" }

function depSummary(pkg: AnyPackage): string[] {
  if (pkg.type === "agent") {
    const c = pkg.components;
    return [c.plugins.length + " Plugins", c.skills.length + " Skills", c.workflows.length + " Workflows", "1 Profile"];
  }
  if (pkg.type === "bundle") {
    const c = pkg.counts;
    return [c.plugins + " Plugins", c.skills + " Skills", c.workflows + " Workflows", c.profiles + " Profile"];
  }
  return [pkg.security.dependencies + " Dependencies"];
}

function priorVersion(v: string): string | null {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  const patch = Number(m[3]);
  if (patch === 0) return null;
  return m[1] + "." + m[2] + "." + (patch - 1);
}

export function InstallModal({ pkg, onClose }: { pkg: AnyPackage; onClose: () => void }) {
  const { install } = useApp();
  const [phase, setPhase] = useState<Phase>("confirm");
  const [version, setVersion] = useState(pkg.version);
  const [lines, setLines] = useState<Line[]>([]);
  const [copied, setCopied] = useState(false);

  const stepLines = useMemo<Line[]>(() => {
    const deps: string[] = [];
    if (pkg.type === "agent") deps.push(...pkg.components.plugins.map((p) => "Installing plugin " + p), ...pkg.components.skills.map((s) => "Installing skill " + s), ...pkg.components.workflows.map((w) => "Installing workflow " + w));
    if (pkg.type === "bundle") deps.push(...pkg.contents.plugins.map((p) => "Installing plugin " + p), ...pkg.contents.skills.map((s) => "Installing skill " + s), ...pkg.contents.workflows.map((w) => "Installing workflow " + w));
    return [
      { id: 1, text: "Resolving dependencies", kind: "ok" as const },
      { id: 2, text: "Checking compatibility", kind: "ok" as const },
      { id: 3, text: "Security scan", kind: "ok" as const },
      ...deps.map((t, i) => ({ id: 4 + i, text: t, kind: "ok" as const })),
      { id: 999, text: "Installing profile", kind: "ok" as const },
    ];
  }, [pkg]);

  useEffect(() => {
    if (phase !== "running") return;
    const cmd = "forge install " + pkg.slug;
    setLines([
      { id: 0, text: "$ " + cmd, kind: "cmd" },
      { id: -1, text: "Resolving package...", kind: "dim" },
    ]);
    let i = 0;
    const timer = window.setInterval(() => {
      if (i >= stepLines.length) {
        window.clearInterval(timer);
        setLines((prev) => [
          ...prev,
          { id: 1000, text: "Agent ready.", kind: "accent" },
          { id: 1001, text: pkg.name + " installed.", kind: "accent" },
          { id: 1002, text: "Installed 1 package · " + pkg.security.dependencies + " dependencies", kind: "dim" },
        ]);
        setPhase("done");
        return;
      }
      // Capture the value now — React runs updaters after i has moved on.
      const line = stepLines[i];
      setLines((prev) => [...prev, line]);
      i += 1;
    }, 420);
    return () => window.clearInterval(timer);
  }, [phase, pkg, stepLines]);

  // Commit the install only when the user closes the completed modal,
  // so the terminal stays visible through the final "Agent ready." lines.
  const finish = () => {
    if (phase === "done") install(pkg.id);
    onClose();
  };

  const cmd = "forge install " + pkg.slug;
  const prior = priorVersion(pkg.version);

  return (
    <ModalShell onClose={finish} width={phase === "confirm" ? 540 : 620} labelledBy="install-title" dismissable={phase !== "running"} escapeClose={phase !== "running"}>
      <div className="modal-head">
        <div className={"pkg-icon pkg-icon--" + pkg.type}>
          <TypeIcon type={pkg.type} />
        </div>
        <div>
          <span className="type-tag">{typeLabel(pkg.type).toUpperCase()}</span>
          <h3 id="install-title">Install {pkg.name}</h3>
        </div>
        <button className="icon-btn modal-close" onClick={finish} aria-label="Close dialog">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      {phase === "confirm" && (
        <>
          <div className="modal-body">
            <div className="field">
              <label className="field-label" htmlFor="install-version">Version</label>
              <select id="install-version" className="select" value={version} onChange={(e) => setVersion(e.target.value)}>
                <option value={pkg.version}>v{pkg.version} — Latest</option>
                {prior && <option value={prior}>v{prior}</option>}
              </select>
            </div>

            <div className="install-grid" style={{ marginTop: 14 }}>
              <div className="install-cell">
                <div className="k">Compatibility</div>
                <div className="v">{pkg.compatibility.replace("DeepSeek Harness", "Harness")}</div>
              </div>
              <div className="install-cell">
                <div className="k">Dependencies</div>
                <div className="v">{depSummary(pkg).join(" · ")}</div>
              </div>
            </div>

            <h4 className="filter-group-title" style={{ marginTop: 20 }}>Permissions</h4>
            <div className="perm-grid">
              <div className="perm-cell"><span className="k">Network</span><span className={"perm-value " + pkg.security.network}>{cap(pkg.security.network)}</span></div>
              <div className="perm-cell"><span className="k">Filesystem</span><span className={"perm-value " + pkg.security.filesystem}>{cap(pkg.security.filesystem)}</span></div>
              <div className="perm-cell"><span className="k">Shell</span><span className={"perm-value " + pkg.security.shell}>{cap(pkg.security.shell)}</span></div>
              <div className="perm-cell"><span className="k">Secrets</span><span className={"perm-value " + pkg.security.secrets}>{cap(pkg.security.secrets)}</span></div>
            </div>

            <div className="security-note">
              Community security scan from {pkg.security.lastScanned}. Scans are advisory — review permissions before installing.
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={finish}>Cancel</button>
            <button className="btn btn-primary" onClick={() => setPhase("running")}>
              <Download size={15} />
              Install
            </button>
          </div>
        </>
      )}

      {(phase === "running" || phase === "done") && (
        <>
          <div className="modal-body" style={{ padding: 0 }}>
            <div className="terminal" style={{ borderRadius: 0, border: "none" }}>
              <div className="terminal-head">
                <span className="dot" /><span className="dot" /><span className="dot" />
                <span className="terminal-title">forge — install {pkg.slug}</span>
                {phase === "done" && <TrustBadge security={pkg.security} />}
              </div>
              <div className="terminal-body" style={{ minHeight: 300 }} aria-live="polite">
                {lines.map((l) => (
                  <div key={l.id} className="term-line">
                    {l.kind === "cmd" && <><span className="term-prompt">$</span><span className="term-cmd">{l.text.slice(2)}</span></>}
                    {l.kind === "dim" && <span className="term-dim">{l.text}</span>}
                    {l.kind === "ok" && <><span className="check">✓</span><span>{l.text}</span></>}
                    {l.kind === "accent" && <span style={{ color: "var(--code-accent)" }}>{l.text}</span>}
                  </div>
                ))}
                {phase === "running" && <span className="term-cursor" aria-hidden="true" />}
              </div>
            </div>
            {phase === "done" && (
              <div style={{ padding: 14, display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <code className="mono" style={{ fontSize: 12, color: "var(--foreground-2)" }}>{cmd}</code>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={async () => {
                    const ok = await copyText(cmd);
                    if (ok) { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
                  }}
                >
                  {copied ? <><Check size={13} /> Copied</> : "Copy CLI command"}
                </button>
              </div>
            )}
          </div>
          <div className="modal-foot">
            {phase === "done" && <span className="mono" style={{ fontSize: 11, color: "var(--muted)", marginRight: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}><ShieldCheck size={13} /> Scanned · {pkg.security.dependencies} deps</span>}
            <button className="btn btn-primary" onClick={finish} disabled={phase === "running"}>
              {phase === "done" ? "Done" : "Installing…"}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

function cap(s: string): string {
  return s === "none" ? "None" : s === "limited" ? "Limited" : s === "full" ? "Full" : s === "read" ? "Read" : s === "read-write" ? "Read-write" : s === "restricted" ? "Restricted" : s === "optional" ? "Optional" : s === "required" ? "Required" : s;
}
