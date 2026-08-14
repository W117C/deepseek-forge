import { Check } from "lucide-react";
import type { PackageType } from "../types";
import { TypeIcon } from "./icons";

interface PreviewProps {
  type: PackageType;
  name: string;
  description: string;
  category: string;
  version: string;
  plugins: string[];
  skills: string[];
  workflows: string[];
}

export function PackageCardPreview({ type, name, description, category, version, plugins, skills, workflows }: PreviewProps) {
  const tags = [...plugins.slice(0, 2), ...skills.slice(0, 2)];
  return (
    <div className="card" style={{ maxWidth: 420, margin: "0 auto", pointerEvents: "none" }}>
      <div className="pkg-card-head">
        <div className={"pkg-icon" + (type === "agent" ? " pkg-icon--agent" : "")}>
          <TypeIcon type={type} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="type-tag">{type.toUpperCase()} · {(category || "Uncategorized").toUpperCase()}</div>
          <div className="pkg-card-name">{name || "Untitled package"}</div>
        </div>
      </div>
      <p className="pkg-card-desc">{description || "No description yet."}</p>
      <div className="pkg-tags">
        {tags.map((t) => <span key={t} className="chip">{t}</span>)}
        {tags.length === 0 && <span className="chip">new</span>}
      </div>
      <div className="pkg-meta">
        <span className="trust scanned"><Check /> Security Scanned</span>
        <span className="sep">·</span>
        <span>v{version}</span>
        <span className="sep">·</span>
        <span>0 installs</span>
        <span className="author">by @you</span>
      </div>
      <div className="pkg-card-foot">
        <span className="btn btn-primary btn-sm" aria-hidden="true">Install</span>
        <span className="view-link" aria-hidden="true">View →</span>
      </div>
      {(plugins.length + skills.length + workflows.length > 0) && (
        <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 12 }}>
          {plugins.length} plugins · {skills.length} skills · {workflows.length} workflows
        </div>
      )}
    </div>
  );
}
