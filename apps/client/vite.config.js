import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
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
