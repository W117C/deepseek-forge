import { Link } from "react-router-dom";
import { ArrowRight, BadgeCheck, Download } from "lucide-react";
import type { Plugin } from "../../types";
import { formatDownloads, routeFor } from "../../lib/registry";
import { TypeIcon } from "../icons";
import { InstallButton } from "../InstallButton";

export function PluginCard({ plugin }: { plugin: Plugin }) {
  return (
    <article className="card">
      <div className="pkg-card-head">
        <div className="pkg-icon">
          <TypeIcon type="plugin" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="type-tag">PLUGIN · {plugin.category.toUpperCase()}</div>
          <div className="pkg-card-name">
            <Link to={routeFor(plugin)}>{plugin.name}</Link>
          </div>
        </div>
      </div>

      <p className="pkg-card-desc">{plugin.description}</p>

      <div className="pkg-tags">
        {plugin.tags.slice(0, 3).map((t) => (
          <span key={t} className="chip">{t}</span>
        ))}
      </div>

      <div className="pkg-meta">
        {plugin.verified ? (
          <span className="trust verified"><BadgeCheck /> Verified</span>
        ) : (
          <span className="trust scanned">Scanned</span>
        )}
        <span className="sep">·</span>
        <span>v{plugin.version}</span>
        <span className="sep">·</span>
        <span><Download size={10} style={{ display: "inline", marginRight: 3 }} />{formatDownloads(plugin.downloads)}</span>
        <span className="author">by @{plugin.authorId}</span>
      </div>

      <div className="pkg-card-foot">
        <InstallButton pkg={plugin} size="sm" label="Install" />
        <Link to={routeFor(plugin)} className="view-link">
          View <ArrowRight size={13} />
        </Link>
      </div>
    </article>
  );
}
