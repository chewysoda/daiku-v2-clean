import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { createReadStream, existsSync } from "node:fs";
import { basename, join } from "node:path";
import type { Plugin } from "vite";

/** In the browser preview only: the model files live outside the web root, and ship beside the app when built. */
const serveModels = (): Plugin => ({
  name: "daiku-serve-models",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use("/models/mfr", (req, res, next) => {
      const file = join(__dirname, "src-tauri", "models", "mfr", basename((req.url ?? "").split("?")[0]));
      if (!existsSync(file)) return next();
      createReadStream(file).pipe(res);
    });
  },
});

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), serveModels()],
  // The math reader's worker loads its runtime with dynamic imports, which need module workers.
  worker: { format: "es" as const },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    // 3. tell Vite to ignore watching `src-tauri`
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: { chunkSizeWarningLimit: 2000 },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
}));
