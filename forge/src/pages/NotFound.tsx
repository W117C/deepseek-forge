import { Link } from "react-router-dom";
import { ArrowRight, SearchX } from "lucide-react";

export function NotFound() {
  return (
    <main className="forge-container" style={{ paddingTop: 72, paddingBottom: 120 }}>
      <div className="error-state">
        <SearchX size={26} style={{ margin: "0 auto 14px", color: "var(--muted)" }} />
        <span className="eyebrow">404</span>
        <h3 style={{ marginTop: 8 }}>Page not found.</h3>
        <p>This route doesn't exist in the marketplace. The package may have been removed or renamed.</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20 }}>
          <Link to="/" className="btn btn-primary">Back to Marketplace</Link>
          <Link to="/explore" className="btn btn-outline">Explore Packages <ArrowRight size={14} /></Link>
        </div>
      </div>
    </main>
  );
}
