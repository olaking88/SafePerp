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
      "vite-plugin-node-polyfills/shims/buffer": path.resolve(__dirname, "node_modules/vite-plugin-node-polyfills/shims/buffer/dist/index.js"),
      "vite-plugin-node-polyfills/shims/global": path.resolve(__dirname, "node_modules/vite-plugin-node-polyfills/shims/global/dist/index.js"),
      "vite-plugin-node-polyfills/shims/process": path.resolve(__dirname, "node_modules/vite-plugin-node-polyfills/shims/process/dist/index.js"),
    },
  },
});
