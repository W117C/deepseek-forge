import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { AnyPackage } from "../../types";
import { formatDownloads, routeFor, typeLabel } from "../../lib/registry";
import { TypeIcon } from "../icons";
import { TrustBadge } from "../badges";

export function PackageRow({ pkg }: { pkg: AnyPackage }) {
  return (
    <Link to={routeFor(pkg)} className="list-row">
      <span className={"pkg-icon" + (pkg.type === "agent" ? " pkg-icon--agent" : "")} style={{ width: 32, height: 32 }}>
        <TypeIcon type={pkg.type} size={15} />
      </span>
      <span className="lr-main">
        <span className="lr-name">{pkg.name}</span>
        <span className="lr-desc">{pkg.description}</span>
      </span>
      <span className="lr-meta">
        v{pkg.version} · {formatDownloads(pkg.downloads)} installs · @{pkg.authorId}
      </span>
      <span className="lr-badges">
        <span className="type-tag">{typeLabel(pkg.type)}</span>
        <TrustBadge security={pkg.security} />
        <ChevronRight size={15} style={{ color: "var(--muted)" }} />
      </span>
    </Link>
  );
}
