import { Link } from "react-router-dom";
import { ArrowRight, BadgeCheck, Download, Star } from "lucide-react";
import type { Agent } from "../../types";
import { authorOf, formatDownloads, routeFor } from "../../lib/registry";
import { TypeIcon } from "../icons";
import { InstallButton } from "../InstallButton";

export function AgentCard({ agent }: { agent: Agent }) {
  const author = authorOf(agent);
  return (
    <article className="card">
      <div className="pkg-card-head">
        <div className="pkg-icon pkg-icon--agent">
          <TypeIcon type="agent" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="type-tag">AGENT · {agent.category.toUpperCase()}</div>
          <div className="pkg-card-name">
            <Link to={routeFor(agent)}>{agent.name}</Link>
          </div>
        </div>
      </div>

      <p className="pkg-card-desc">{agent.description}</p>

      <div className="pkg-tags">
        {agent.tags.slice(0, 4).map((t) => (
          <span key={t} className="chip">{t}</span>
        ))}
      </div>

      <div className="pkg-meta">
        {agent.verified ? (
          <span className="trust verified"><BadgeCheck /> Verified</span>
        ) : (
          <span className="trust">Community</span>
        )}
        <span className="sep">·</span>
        <span>v{agent.version}</span>
        <span className="sep">·</span>
        <span><Download size={10} style={{ display: "inline", marginRight: 3 }} />{formatDownloads(agent.downloads)} installs</span>
        <span className="sep">·</span>
        <span><Star size={10} style={{ display: "inline", marginRight: 2 }} />{agent.rating.toFixed(1)}</span>
        <span className="author">by @{author.handle}</span>
      </div>

      <div className="pkg-card-foot">
        <InstallButton pkg={agent} size="sm" label="Install" />
        <Link to={routeFor(agent)} className="view-link">
          View <ArrowRight size={13} />
        </Link>
      </div>
    </article>
  );
}
