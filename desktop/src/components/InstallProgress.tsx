// Installation progress — driven by real forge-core events (install-progress).
// Each pipeline step is rendered as pending ○ / running ● / success ✓ / failed ×.
// Nothing is fabricated: steps only appear from actual emitted phases.
//
// Two modes:
//  · single package  — the resolving→cloning→scanning→registering→installed pipeline;
//  · bundle (recipe) — one step per real "component" event; completion is reported
//    by the caller (forceDone) because bundle installs never emit "installed".
import { useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, CircleX } from "lucide-react";
import { onInstallProgress } from "../ipc";
import type { InstallProgressEvent } from "../ipc";
import { useI18n } from "../i18n";

const PHASE_ORDER = ["resolving", "cloning", "scanning", "registering", "installed"];

const PHASE_KEYS: Record<string, string> = {
  resolving: "progress.resolving",
  cloning: "progress.cloning",
  scanning: "progress.scanning",
  registering: "progress.registering",
  installed: "progress.installed",
};

export type StepStatus = "pending" | "active" | "done" | "failed";
export interface PipelineStep {
  key: string;
  label: string;
  status: StepStatus;
  note?: string;
}

export default function InstallProgress({
  targetId,
  onDone,
  onFailed,
  forceDone = false,
  failedAt,
}: {
  targetId: string;
  onDone?: () => void;
  onFailed?: () => void;
  /** Caller-side completion (bundle installs report success via the invoke result). */
  forceDone?: boolean;
  /** 0-based index of the failing component step (from the bundle result). */
  failedAt?: number;
}) {
  const { t } = useI18n();
  const [events, setEvents] = useState<InstallProgressEvent[]>([]);
  const doneRef = useRef(false);
  const failRef = useRef(false);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    onInstallProgress((e) => {
      if (e.id !== targetId) return;
      setEvents((prev) => {
        const next = prev.filter((x) => !(x.phase === e.phase && x.step === e.step));
        next.push(e);
        return next;
      });
      if (e.phase === "failed") {
        failRef.current = true;
        onFailed?.();
      }
      if (e.phase === "installed" && !failRef.current) {
        if (!doneRef.current) {
          doneRef.current = true;
          onDone?.();
        }
      }
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {
        /* non-tauri context (plain browser preview) */
      });
    return () => {
      if (unlisten) unlisten();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  const steps: PipelineStep[] = useMemo(() => {
    const emitted = new Set(events.map((e) => e.phase));
    if (emitted.size === 0) return [];
    const isFailed = emitted.has("failed");
    const failedEvent = events.find((e) => e.phase === "failed");

    // Bundle / recipe mode: one step per emitted component.
    if (emitted.has("component")) {
      const comps: string[] = [];
      for (const e of [...events].sort((a, b) => a.step - b.step)) {
        const name = typeof e.meta?.component === "string" ? String(e.meta.component) : null;
        if (e.phase === "component" && name && !comps.includes(name)) comps.push(name);
      }
      if (comps.length === 0) return [];
      return comps.map((c, i) => {
        let status: StepStatus = "active";
        if (forceDone) status = "done";
        else if (failedAt !== undefined && i === failedAt) status = "failed";
        else if (isFailed && i === comps.length - 1) status = "failed";
        else if (i < comps.length - 1) status = "done";
        return { key: "c:" + c, label: t("progress.componentOf", { name: c }), status };
      });
    }

    // Single-package mode: the phase pipeline.
    const isDone = forceDone || emitted.has("installed");
    const emittedOrder = PHASE_ORDER.filter((p) => emitted.has(p));
    const lastEmitted = emittedOrder.length > 0 ? emittedOrder[emittedOrder.length - 1] : null;
    const lastIdx = lastEmitted ? PHASE_ORDER.indexOf(lastEmitted) : -1;
    const failIdx = failedEvent
      ? Math.min(Math.max((failedEvent.step ?? 1) - 1, 0), PHASE_ORDER.length - 1)
      : lastIdx;
    return PHASE_ORDER.map((p, i) => {
      let status: StepStatus = "pending";
      if (isDone) {
        status = "done";
      } else if (isFailed) {
        status = i < failIdx ? "done" : i === failIdx ? "failed" : "pending";
      } else if (i < lastIdx) {
        status = "done";
      } else if (i === lastIdx) {
        status = "active";
      }
      return { key: p, label: t(PHASE_KEYS[p] ?? "progress.phase"), status };
    });
  }, [events, t, forceDone, failedAt]);

  if (steps.length === 0) return null;

  return (
    <div className="steps" role="list" aria-label={t("progress.phase")}>
      {steps.map((s) => (
        <div
          key={s.key}
          role="listitem"
          className={
            "step " +
            (s.status === "done"
              ? "is-done"
              : s.status === "active"
                ? "is-active"
                : s.status === "failed"
                  ? "is-failed"
                  : "")
          }
        >
          <span className="step-icon" aria-hidden="true">
            {s.status === "done" ? (
              <CircleCheck size={14} />
            ) : s.status === "failed" ? (
              <CircleX size={14} />
            ) : s.status === "active" ? (
              "●"
            ) : (
              "○"
            )}
          </span>
          <span className="step-label">{s.label}</span>
          {s.note && <span className="step-note">{s.note}</span>}
        </div>
      ))}
    </div>
  );
}
