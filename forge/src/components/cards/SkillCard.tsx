import { Link } from "react-router-dom";
import { ArrowRight, BadgeCheck, Download } from "lucide-react";
import type { Skill } from "../../types";
import { formatDownloads, routeFor } from "../../lib/registry";
import { TypeIcon } from "../icons";
import { InstallButton } from "../InstallButton";

export function SkillCard({ skill }: { skill: Skill }) {
  return (
    <article className="card">
      <div className="pkg-card-head">
        <div className="pkg-icon">
          <TypeIcon type="skill" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="type-tag">SKILL · {skill.domain.toUpperCase()}</div>
          <div className="pkg-card-name">
            <Link to={routeFor(skill)}>{skill.name}</Link>
          </div>
        </div>
      </div>

      <p className="pkg-card-desc">{skill.description}</p>

      <div className="pkg-tags">
        {skill.tags.slice(0, 3).map((t) => (
          <span key={t} className="chip">{t}</span>
        ))}
      </div>

      <div className="pkg-meta">
        {skill.verified ? (
          <span className="trust verified"><BadgeCheck /> Verified</span>
        ) : (
          <span className="trust">Community</span>
        )}
        <span className="sep">·</span>
        <span>v{skill.version}</span>
        <span className="sep">·</span>
        <span><Download size={10} style={{ display: "inline", marginRight: 3 }} />{formatDownloads(skill.downloads)}</span>
        <span className="author">by @{skill.authorId}</span>
      </div>

      <div className="pkg-card-foot">
        <InstallButton pkg={skill} size="sm" label="Install" />
        <Link to={routeFor(skill)} className="view-link">
          View <ArrowRight size={13} />
        </Link>
      </div>
    </article>
  );
}
