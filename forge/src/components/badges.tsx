import { BadgeCheck, ShieldCheck, Users, AlertTriangle } from "lucide-react";
import type { SecurityReport } from "../types";
import { trustLabel } from "../lib/registry";

export function TrustBadge({ security, label }: { security: SecurityReport; label?: string }) {
  const level = security.level;
  const cls =
    level === "verified" ? "badge-verified"
    : level === "scanned" ? "badge-scanned"
    : level === "community" ? "badge-community"
    : "badge-unverified";
  const Icon =
    level === "verified" ? BadgeCheck
    : level === "scanned" ? ShieldCheck
    : level === "community" ? Users
    : AlertTriangle;
  return (
    <span className={"badge " + cls} title="Community trust status">
      <Icon />
      {label ?? trustLabel(level)}
    </span>
  );
}

export function VerifiedBadge() {
  return (
    <span className="badge badge-verified">
      <BadgeCheck />
      Verified
    </span>
  );
}

export function ScannedBadge() {
  return (
    <span className="badge badge-scanned">
      <ShieldCheck />
      Security Scanned
    </span>
  );
}
