// 安装进度：事件由 forge-core 逐阶段推送（每行对应真实完成的工作），UI 只做展示。
import { useEffect, useMemo, useState } from "react";
import { CircleCheck, LoaderCircle } from "lucide-react";
import { onInstallProgress } from "../ipc";
import type { InstallProgressEvent } from "../ipc";
import { useI18n } from "../i18n";

const PHASE_KEYS: Record<string, string> = {
  resolving: "progress.resolving",
  cloning: "progress.cloning",
  scanning: "progress.scanning",
  registering: "progress.registering",
  installed: "progress.installed",
  component: "progress.component",
  failed: "progress.failed",
};

interface Step {
  key: string;
  label: string;
  done: boolean;
  active: boolean;
}

export default function InstallProgress({ targetId }: { targetId: string }) {
  const { t } = useI18n();
  const [events, setEvents] = useState<InstallProgressEvent[]>([]);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    onInstallProgress((e) => {
      if (e.id !== targetId) return;
      if (e.phase === "failed") setFailed(true);
      setEvents((prev) => {
        const next = prev.filter(
          (x) => !(x.phase === e.phase && x.step === e.step && x.id === e.id)
        );
        next.push(e);
        return next;
      });
      if (e.phase === "installed") setDone(true);
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {
        /* non-tauri context (plain browser) */
      });
    return () => {
      if (unlisten) unlisten();
    };
  }, [targetId]);

  const steps: Step[] = useMemo(() => {
    const out: Step[] = [];
    const seen = new Set<string>();
    const sorted = [...events].sort((a, b) => a.step - b.step);
    for (const e of sorted) {
      const key = e.phase + ":" + (e.meta && typeof e.meta.component === "string" ? e.meta.component : "");
      if (seen.has(key)) continue;
      seen.add(key);
      let label = t(PHASE_KEYS[e.phase] ?? "progress.phase");
      if (e.phase === "component" && e.meta && typeof e.meta.component === "string") {
        label = t("progress.componentOf", { name: e.meta.component });
      }
      out.push({ key, label, done: e.phase !== "component", active: false });
    }
    // 最后一个未完成阶段 = 当前进行中
    if (out.length > 0 && !done && !failed) {
      const last = out[out.length - 1];
      if (!PHASE_KEYS[events[events.length - 1]?.phase] || last.label.startsWith(t("progress.component"))) {
        out[out.length - 1].active = true;
      } else {
        out[out.length - 1].done = true;
        out[out.length - 1].active = true;
      }
    }
    return out;
  }, [events, done, failed, t]);

  if (events.length === 0) return null;

  return (
    <div className="install-progress" style={{ marginTop: 8 }}>
      {steps.map((st) => (
        <div key={st.key} className="field-hint" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {st.done ? (
            <CircleCheck size={12} style={{ color: "var(--success, #3fb950)" }} />
          ) : st.active ? (
            <LoaderCircle size={12} className="spin" />
          ) : (
            <span style={{ width: 12 }} />
          )}
          {st.label}
        </div>
      ))}
      {failed && (
        <div className="field-error" style={{ marginTop: 4 }}>
          {t("progress.failedNote")}
        </div>
      )}
    </div>
  );
}
