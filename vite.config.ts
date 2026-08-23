import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    cloudflare(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "3M Platform",
        short_name: "3M",
        description:
          "地域のオープンデータと市民投稿を地図で共有するサービスです。",
        lang: "ja",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f8fafc",
        theme_color: "#1d9d8d",
        categories: ["maps", "productivity", "utilities"],
        icons: [
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "3m-page-cache",
              networkTimeoutSeconds: 4,
              plugins: [
                {
                  handlerDidError: async () => {
                    const offlineResponse = await (
                      globalThis as unknown as {
                        caches: {
                          match: (
                            request: string,
                          ) => Promise<Response | undefined>;
                        };
                      }
                    ).caches.match("/offline.html");

                    return offlineResponse ?? Response.error();
                  },
                },
              ],
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "3m-api-cache",
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 5 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/[a-c]\.tile\.openstreetmap\.org\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "3m-map-tile-cache",
              expiration: {
                maxEntries: 240,
                maxAgeSeconds: 24 * 60 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.hostname === "3m-platform-photos.r2.dev",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "3m-photo-cache",
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 7 * 24 * 60 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
});
