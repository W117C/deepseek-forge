// macOS titlebar strip. With Tauri's Overlay titlebar the native traffic
// lights float above the webview; the strip reserves their space and provides
// real window dragging + double-click zoom via the Tauri window API.
import { Search } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useI18n } from "../i18n";

export default function Titlebar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const { t } = useI18n();

  function onMouseDown(e: React.MouseEvent<HTMLElement>) {
    if (e.button !== 0) return;
    const el = e.target as HTMLElement;
    if (el.closest("button, input, select, a")) return;
    try {
      void getCurrentWindow().startDragging();
    } catch {
      /* browser preview: no native window */
    }
  }

  function onDoubleClick() {
    try {
      void getCurrentWindow().toggleMaximize();
    } catch {
      /* browser preview */
    }
  }

  return (
    <header
      className="titlebar"
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
    >
      <div className="traffic-lights" aria-hidden="true">
        <span className="tl close" />
        <span className="tl min" />
        <span className="tl max" />
      </div>
      <span className="titlebar-title">DeepSeek Forge</span>
      <button className="titlebar-search" onClick={onOpenPalette}>
        <Search size={12} />
        <span>{t("titlebar.search")}</span>
        <span className="kbd">⌘K</span>
      </button>
    </header>
  );
}
