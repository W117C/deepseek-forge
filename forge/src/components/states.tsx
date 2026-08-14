import { SearchX, WifiOff } from "lucide-react";

export function PackageCardSkeleton() {
  return (
    <div className="skel-card" aria-hidden="true">
      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        <div className="skel" style={{ width: 36, height: 36, borderRadius: "var(--r-m)" }} />
        <div style={{ flex: 1 }}>
          <div className="skel skel-line" style={{ width: 90, height: 9 }} />
          <div className="skel skel-line title" />
        </div>
      </div>
      <div className="skel skel-line" style={{ width: "92%" }} />
      <div className="skel skel-line" style={{ width: "70%" }} />
      <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
        <div className="skel" style={{ width: 64, height: 20 }} />
        <div className="skel" style={{ width: 52, height: 20 }} />
        <div className="skel" style={{ width: 46, height: 20 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18 }}>
        <div className="skel" style={{ width: 84, height: 30 }} />
        <div className="skel" style={{ width: 60, height: 18 }} />
      </div>
    </div>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid-cards" aria-busy="true" aria-label="Loading packages">
      {Array.from({ length: count }).map((_, i) => (
        <PackageCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading package">
      <div className="detail-hero">
        <div className="forge-container">
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
            <div className="skel" style={{ width: 56, height: 56, borderRadius: "var(--r-l)" }} />
            <div style={{ flex: 1 }}>
              <div className="skel skel-line" style={{ width: 110, height: 10 }} />
              <div className="skel skel-line title" style={{ height: 30, width: "46%" }} />
              <div className="skel skel-line" style={{ width: "60%" }} />
              <div className="skel skel-line short" style={{ marginTop: 18 }} />
            </div>
            <div className="skel" style={{ width: 150, height: 40 }} />
          </div>
        </div>
      </div>
      <div className="forge-container" style={{ paddingTop: 32 }}>
        <div className="skel skel-line" style={{ height: 18, width: "70%" }} />
        <div className="skel skel-line" style={{ height: 18, width: "82%" }} />
        <div className="skel skel-line" style={{ height: 18, width: "55%" }} />
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  message,
  suggestions,
  onClear,
}: {
  title: string;
  message: string;
  suggestions?: string[];
  onClear?: () => void;
}) {
  return (
    <div className="empty-state">
      <SearchX size={22} style={{ margin: "0 auto 12px", color: "var(--muted)" }} />
      <h3>{title}</h3>
      <p>{message}</p>
      {suggestions && suggestions.length > 0 && (
        <div className="try-chips">
          {suggestions.map((s) => (
            <button key={s} className="chip chip--accent" onClick={() => onClear && onClear()}>
              {s}
            </button>
          ))}
        </div>
      )}
      {onClear && (
        <button className="btn btn-outline btn-sm" onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="error-state">
      <WifiOff size={22} className="err-icon" style={{ display: "inline" }} />
      <h3>Unable to load {message ?? "packages"}.</h3>
      <p>The registry did not respond. This can happen when the connection is interrupted.</p>
      {onRetry && (
        <button className="btn btn-outline" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
