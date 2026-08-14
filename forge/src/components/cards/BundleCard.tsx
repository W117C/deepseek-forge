import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";
import type { Bundle } from "../../types";
import { formatDownloads, routeFor } from "../../lib/registry";
import { TypeIcon } from "../icons";
import { InstallButton } from "../InstallButton";

export function BundleCard({ bundle }: { bundle: Bundle }) {
  const c = bundle.counts;
  return (
    <article className="card">
      <div className="pkg-card-head">
        <div className="pkg-icon">
          <TypeIcon type="bundle" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="type-tag">BUNDLE · {bundle.category.toUpperCase()}</div>
          <div className="pkg-card-name">
            <Link to={routeFor(bundle)}>{bundle.name}</Link>
          </div>
        </div>
      </div>

      <p className="pkg-card-desc">{bundle.description}</p>

      <div className="bundle-comps">
        <div className="bundle-comp"><b>{c.skills}</b><span>Skills</span></div>
        <div className="bundle-comp"><b>{c.plugins}</b><span>Plugins</span></div>
        <div className="bundle-comp"><b>{c.workflows}</b><span>Workflows</span></div>
        <div className="bundle-comp"><b>{c.profiles}</b><span>Profile</span></div>
      </div>

      <div className="bundle-flow" aria-hidden="true">
        <span className="flow-node">{c.skills} Skills</span>
        <span className="flow-arrow">+</span>
        <span className="flow-node">{c.plugins} Plugins</span>
        <span className="flow-arrow">+</span>
        <span className="flow-node">{c.workflows} Workflows</span>
        <span className="flow-arrow">↓</span>
        <span className="flow-node accent">Bundle</span>
        <span className="flow-arrow">↓</span>
        <span className="flow-node accent">Agent</span>
      </div>

      <div className="pkg-meta">
        <span className="trust scanned"><ShieldCheck /> Security Scanned</span>
        <span className="sep">·</span>
        <span>v{bundle.version}</span>
        <span className="sep">·</span>
        <span>{formatDownloads(bundle.downloads)} installs</span>
        <span className="author">by @{bundle.authorId}</span>
      </div>

      <div className="pkg-card-foot">
        <InstallButton pkg={bundle} size="sm" label="Install" />
        <Link to={routeFor(bundle)} className="view-link">
          View Bundle <ArrowRight size={13} />
        </Link>
      </div>
    </article>
  );
}
