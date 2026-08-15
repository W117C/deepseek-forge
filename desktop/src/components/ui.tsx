// UI primitives for the DeepSeek Forge desktop shell:
// toast + dialog systems, modal, badges, status dots, segmented control,
// skeletons, empty/error states. All real state; no decorative fake data.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Cable,
  CircleAlert,
  CircleCheck,
  CircleX,
  GitBranch,
  Layers,
  Package,
  Plug,
  Sparkles,
  TriangleAlert,
  Wrench,
  X,
} from "lucide-react";
import { useI18n } from "../i18n";
import { ForgeError } from "../ipc";

/* ============================================================
   Package type → icon (Lucide line icons, uniform 1.5px stroke)
   ============================================================ */
const TYPE_ICONS: Record<string, LucideIcon> = {
  plugin: Plug,
  skill: Sparkles,
  mcp: Cable,
  tool: Wrench,
  agent: Bot,
  bundle: Layers,
  workflow: GitBranch,
};

export function typeIcon(type?: string | null): LucideIcon {
  return (type && TYPE_ICONS[type.toLowerCase()]) || Package;
}

/* ============================================================
   Badge / status
   ============================================================ */
export type BadgeTone =
  | "accent"
  | "verified"
  | "community"
  | "warning"
  | "blocked";

export function Badge({
  tone = "community",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return <span className={"badge badge-" + tone}>{children}</span>;
}

export function StatusDot({ tone }: { tone: "on" | "off" | "warn" | "err" }) {
  return <span className={"status-dot " + tone} aria-hidden="true" />;
}

export function Status({
  tone,
  label,
}: {
  tone: "on" | "off" | "warn" | "err";
  label: ReactNode;
}) {
  return (
    <span className="status">
      <StatusDot tone={tone} />
      {label}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}

/* ============================================================
   Segmented control
   ============================================================ */
export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegOption<T>[];
  ariaLabel?: string;
}) {
  return (
    <div className="seg" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          className={"seg-item" + (value === o.value ? " on" : "")}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count !== undefined && <span className="count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ============================================================
   Toasts (bottom-right, transient)
   ============================================================ */
export type ToastKind = "success" | "error" | "warning";
export interface ToastMsg {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
}
type ToastFn = (kind: ToastKind, title: string, body?: string) => void;

const ToastCtx = createContext<ToastFn>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastMsg[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((kind: ToastKind, title: string, body?: string) => {
    const id = ++idRef.current;
    setItems((prev) => [...prev.slice(-3), { id, kind, title, body }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== id));
    }, 4200);
  }, []);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((m) => (
          <div
            key={m.id}
            className={"toast " + (m.kind === "error" ? "error" : m.kind === "warning" ? "warn" : "")}
            role="status"
          >
            <span className="toast-ico">
              {m.kind === "error" ? (
                <CircleX size={15} />
              ) : m.kind === "warning" ? (
                <TriangleAlert size={15} />
              ) : (
                <CircleCheck size={15} />
              )}
            </span>
            <div className="toast-main">
              <div className="toast-title">{m.title}</div>
              {m.body && <div className="toast-body">{m.body}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastFn {
  return useContext(ToastCtx);
}

/* ============================================================
   Dialogs (confirmation) — replaces window.confirm/alert
   ============================================================ */
export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  list?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface DialogApi {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const DialogCtx = createContext<DialogApi>({
  confirm: () => Promise.resolve(false),
});

type DialogState = ConfirmOptions & { resolve: (v: boolean) => void };

export function DialogProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [state, setState] = useState<DialogState | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...opts, resolve });
    });
  }, []);

  const close = useCallback(
    (value: boolean) => {
      setState((prev) => {
        prev?.resolve(value);
        return null;
      });
    },
    []
  );

  useEffect(() => {
    if (!state) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, close]);

  return (
    <DialogCtx.Provider value={{ confirm }}>
      {children}
      {state && (
        <div className="modal-overlay" onClick={() => close(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <span className="modal-title">{state.title}</span>
              <button
                className="icon-btn"
                aria-label={t("common.cancel")}
                onClick={() => close(false)}
              >
                <X size={14} />
              </button>
            </div>
            <div className="modal-body">
              {state.body}
              {state.list && state.list.length > 0 && (
                <div className="list-block">
                  {state.list.map((l) => (
                    <div key={l}>{l}</div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => close(false)}>
                {state.cancelLabel ?? t("common.cancel")}
              </button>
              <button
                className={"btn " + (state.danger ? "btn-danger" : "btn-primary")}
                onClick={() => close(true)}
              >
                {state.confirmLabel ?? t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogCtx.Provider>
  );
}

export function useDialog(): DialogApi {
  return useContext(DialogCtx);
}

/* ============================================================
   Generic modal (Esc closes, click-outside closes)
   ============================================================ */
export function Modal({
  title,
  onClose,
  children,
  footer,
  width,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        style={width ? { maxWidth: width } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <span className="modal-title">{title}</span>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ============================================================
   Empty state — minimal, actionable
   ============================================================ */
export function EmptyState({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: LucideIcon;
  title: ReactNode;
  body?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-ico">
        <Icon size={15} />
      </div>
      <div className="empty-title">{title}</div>
      {body && <div className="empty-body">{body}</div>}
      {children && <div className="empty-actions">{children}</div>}
    </div>
  );
}

/* ============================================================
   Error card — what happened / why / what to do
   ============================================================ */
export function ErrorCard({
  title,
  error,
  onRetry,
  retryLabel,
  actions,
}: {
  title?: string;
  error: unknown;
  onRetry?: () => void;
  retryLabel?: string;
  actions?: ReactNode;
}) {
  const { t } = useI18n();
  const [showTech, setShowTech] = useState(false);
  const fe = error instanceof ForgeError ? error : null;
  const message = error instanceof Error ? error.message : String(error);

  return (
    <div className="error-state" role="alert">
      <div className="error-head">
        <TriangleAlert size={15} className="error-ico" />
        <span className="error-title">{title ?? t("err.title")}</span>
      </div>
      <div className="error-body">{message}</div>
      {(fe?.technical || fe?.recovery) && (
        <div className="error-reason">
          {fe.recovery && (
            <div>
              <span className="lbl">{t("err.suggestion")}</span> {fe.recovery}
            </div>
          )}
          {showTech && fe.technical && (
            <div style={{ marginTop: 6 }}>
              <span className="lbl">{t("err.reason")}</span> {fe.technical}
            </div>
          )}
        </div>
      )}
      <div className="error-actions">
        {onRetry && (
          <button className="btn btn-outline" onClick={onRetry}>
            {retryLabel ?? t("err.retry")}
          </button>
        )}
        {fe?.technical && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowTech((v) => !v)}
          >
            {showTech ? t("err.hideDetails") : t("err.details")}
          </button>
        )}
        {actions}
      </div>
    </div>
  );
}

/* ============================================================
   Skeletons — keep page structure while loading
   ============================================================ */
export function PkgCardSkeleton() {
  return (
    <div className="skel-card" aria-hidden="true">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div className="skel" style={{ width: 28, height: 28, borderRadius: 6 }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="skel skel-line" style={{ width: "55%" }} />
          <div className="skel skel-line" style={{ width: "35%" }} />
        </div>
        <div className="skel skel-line" style={{ width: 44 }} />
      </div>
      <div className="skel skel-line wide" />
      <div className="skel skel-line" style={{ width: "90%" }} />
      <div className="skel skel-line short" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
        <div className="skel skel-line" style={{ width: 90 }} />
        <div className="skel" style={{ width: 62, height: 26, borderRadius: 6 }} />
      </div>
    </div>
  );
}

export function RowSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="list" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skel-row">
          <div className="skel" style={{ width: 24, height: 24, borderRadius: 6 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="skel skel-line" style={{ width: "34%" }} />
            <div className="skel skel-line" style={{ width: "52%" }} />
          </div>
          <div className="skel skel-line" style={{ width: 64 }} />
          <div className="skel skel-line" style={{ width: 48 }} />
        </div>
      ))}
    </div>
  );
}

/* Small inline spinner + label (kept for tight inline busy states) */
export function InlineLoading({ label }: { label: string }) {
  return (
    <span className="status" style={{ gap: 7 }}>
      <svg
        className="spin lucide"
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" stroke="currentColor" strokeLinecap="round" />
      </svg>
      {label}
    </span>
  );
}

/* Alert note used for warnings inside panels */
export function Note({
  tone = "warn",
  children,
}: {
  tone?: "warn" | "ok";
  children: ReactNode;
}) {
  return (
    <div className="note" data-tone={tone}>
      <CircleAlert size={13} className="note-ico" />
      <span>{children}</span>
    </div>
  );
}
