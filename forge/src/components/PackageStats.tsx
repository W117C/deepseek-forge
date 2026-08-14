import { Download, Star } from "lucide-react";
import type { AnyPackage } from "../types";
import { authorOf, formatDownloads } from "../lib/registry";
import { Link } from "react-router-dom";

/** Meta row: version · installs · rating · author. */
export function PackageStats({ pkg, className = "" }: { pkg: AnyPackage; className?: string }) {
  const author = authorOf(pkg);
  return (
    <div className={"detail-stats " + className}>
      <span className="stat mono">v{pkg.version}</span>
      <span className="stat">
        <Download />
        {formatDownloads(pkg.downloads)} installs
      </span>
      <span className="stat rating">
        <Star />
        {pkg.rating.toFixed(1)}
      </span>
      <span className="stat">by</span>
      <Link to="#" className="author-link" onClick={(e) => e.preventDefault()}>
        @{author.handle}
      </Link>
    </div>
  );
}

/** Small author chip used on cards. */
export function AuthorChip({ pkg }: { pkg: AnyPackage }) {
  const author = authorOf(pkg);
  return (
    <span className="author">
      {author.verified && <BadgeDot />}@{author.handle}
    </span>
  );
}

function BadgeDot() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ display: "inline", verticalAlign: "-1px", marginRight: 3 }}>
      <path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 7.7l5.4-.8L12 2z" />
    </svg>
  );
}

/** Star rating row. */
export function Stars({ rating, size = 13 }: { rating: number; size?: number }) {
  return (
    <span className="stars" aria-label={"Rated " + rating + " out of 5"}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} className={i <= Math.round(rating) ? "star-on" : "star-off"} />
      ))}
    </span>
  );
}
