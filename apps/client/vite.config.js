import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Versão exibida na UI — permite confirmar rapidamente qual build está no ar.
const pkgVersion = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;
let gitSha = "nogit";
try { gitSha = execSync("git rev-parse --short HEAD").toString().trim(); } catch { /* build sem git */ }
const buildLabel = `${new Date().toISOString().slice(0, 16).replace("T", " ")}Z · ${gitSha}`;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
    __BUILD_LABEL__: JSON.stringify(buildLabel),
    __GIT_SHA__: JSON.stringify(gitSha),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Dashboard Project",
        short_name: "Dashboard",
        description: "Dashboard Project",
        theme_color: "#3182ce",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/uploads/pwa-icon.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/uploads/pwa-icon.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        navigateFallback: "/",
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        skipWaiting: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024
      }
    })
  ],
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      "/api": "http://localhost:4000",
      "/uploads": "http://localhost:4000"
    }
  },
  test: {
    environment: "node"
  }
});
