import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const API = "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Dev only: the API's CSRF guard requires Origin to match Host, so present the API's own origin.
    proxy: { "/api": { target: API, changeOrigin: true, configure: (p) => p.on("proxyReq", (r) => r.setHeader("origin", API)) } },
  },
  build: { outDir: "dist", sourcemap: false },
});
