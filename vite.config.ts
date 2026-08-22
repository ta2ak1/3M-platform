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
      manifest: {
        icons: [
          {
            src: "/favicon.png",
            sizes: "1000x1000",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
});
