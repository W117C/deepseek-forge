// Logs — append-only JSONL install / security / harness log timeline.
import { useEffect, useState } from "react";
import { PackagePlus, ScrollText, ShieldCheck, TerminalSquare } from "lucide-react";
import { logsList } from "../ipc";
import { useI18n } from "../i18n";
import type { LogEntry } from "../ipc";
import { EmptyState, ErrorCard, RowSkeleton } from "../components/ui";

type State =
  | { status: "loading" }
  | { status: "error"; message: unknown }
  | { status: "ready"; entries: LogEntry[] };

export default function Logs() {
  const { t } = useI18n();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    logsList()
      .then((entries) => setState({ status: "ready", entries }))
      .catch((err: unknown) => setState({ status: "error", message: err }));
  }, []);

  if (state.status === "loading") {
    return (
      <div className="page">
        <RowSkeleton rows={6} />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="page">
        <ErrorCard error={state.message} title={t("nav.logs")} />
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-heading">{t("nav.logs")}</h1>
          <p className="page-sub">{t("lg.subtitle")}</p>
        </div>
      </header>

      {state.entries.length === 0 ? (
        <EmptyState icon={ScrollText} title={t("lg.emptyTitle")} body={t("lg.emptyBody")} />
      ) : (
        <div className="list">
          {state.entries.map((e, i) => {
            const Icon =
              e.kind === "install" ? PackagePlus : e.kind === "security" ? ShieldCheck : TerminalSquare;
            return (
              <div key={i} className="act-row">
                <span className="act-time">{e.ts}</span>
                <span className="act-ico">
                  <Icon size={12} />
                </span>
                <span className="act-text">
                  <span className="act-pkg">
                    {e.id} v{e.version}
                  </span>
                  {e.code ? (
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)", marginLeft: 8 }}>
                      {e.kind === "security" ? "score " + e.code : e.code}
                    </span>
                  ) : null}
                </span>
                {e.ok ? (
                  <span className="act-status ok">{t("lg.ok")}</span>
                ) : (
                  <span className="act-status bad">{t("lg.failed")}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
