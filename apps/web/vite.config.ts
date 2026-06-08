import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const API_PREFIXES = [
  "/connect.json",
  "/health",
  "/projects",
  "/tasks",
  "/epics",
  "/inbox",
  "/libraries",
  "/library-documents",
  "/workflow-templates",
  "/worker",
];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, "../.."), "");
  const backend = env.VITE_BACKEND_URL?.trim() || "http://127.0.0.1:3000";
  const proxy = Object.fromEntries(
    API_PREFIXES.map((prefix) => [prefix, { target: backend, changeOrigin: true }]),
  );

  return {
  base: "/app/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  };
});
