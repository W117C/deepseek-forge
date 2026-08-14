import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@forge/styles/tokens.css";
import "@forge/styles/globals.css";
import "./styles/app.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { I18nProvider } from "./i18n";

// Enforce the dark theme before first paint to avoid a light flash.
document.documentElement.setAttribute("data-theme", "dark");

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element missing");

createRoot(rootEl).render(
  <StrictMode>
    <I18nProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </I18nProvider>
  </StrictMode>
);
