import react from "@vitejs/plugin-react";
import tailwind from "tailwindcss";
import { defineConfig } from "vite";
import path from "path";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    nodePolyfills({
      include: ["buffer", "process", "util", "stream", "crypto"],
      globals: { Buffer: true, process: true },
      protocolImports: true,
    }),
    react(),
  ],
  publicDir: "./static",
  base: "./",
  css: { postcss: { plugins: [tailwind()] } },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    proxy: {
      "/coingecko": {
        target: "https://api.coingecko.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/coingecko/, ""),
      },
    },
  },
  build: {
    rollupOptions: {
      external: ["fs", "os"],
    },
  },
});
