import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Desktop shell reuses the forge design system via the @forge alias.
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@forge": fileURLToPath(new URL("../forge/src", import.meta.url)),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
  },
});
