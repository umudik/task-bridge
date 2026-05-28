import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  base: "/app/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/connect.json": "http://127.0.0.1:3001",
      "/health": "http://127.0.0.1:3001",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
