/// <reference types="node" />
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Get base path from environment variable, default to '/' for local dev
// For GitHub Pages, set VITE_BASE_PATH to your repository name (e.g., '/wallet/')
const base = process.env.VITE_BASE_PATH || "/";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base,
  root: "./src/test",
  plugins: [
    // Automatically resolve TypeScript path aliases from tsconfig.json
    tsconfigPaths({
      root: "../..",
    }),
  ],
  // Ensure the test app imports from the source entrypoint (not dist/) while developing locally.
  // This keeps `import { ... } from "@1shotapi/wallet"` working without needing to rebuild `dist/`.
  resolve: {
    alias: {
      "@1shotapi/wallet": path.resolve(__dirname, "src/index.ts"),
    },
  },
  server: {
    port: 3300,
    open: true,
    allowedHosts: ["1shotpay.com"],
  },
  build: {
    outDir: "../../docs",
    emptyOutDir: true,
  },
  
});

