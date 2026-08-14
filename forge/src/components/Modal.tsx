import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useBodyLock, useKey } from "../lib/hooks";

interface ModalShellProps {
  onClose: () => void;
  children: ReactNode;
  width?: number;
  dismissable?: boolean;
  escapeClose?: boolean;
  labelledBy?: string;
  className?: string;
}

/** Generic modal shell: overlay + centered panel, Esc to close, focus trap. */
export function ModalShell({
  onClose,
  children,
  width = 560,
  dismissable = true,
  escapeClose = true,
  labelledBy,
  className = "",
}: ModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useBodyLock(true);

  useKey((e) => {
    if (e.key === "Escape" && escapeClose) onClose();
    if (e.key === "Tab") {
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, [onClose, escapeClose]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const t = window.setTimeout(() => {
      const el = panel.querySelector<HTMLElement>("input, button, select, [tabindex]");
      (el ?? panel).focus();
    }, 30);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (dismissable && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={"modal" + (className ? " " + className : "")}
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
