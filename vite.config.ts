import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Get base path from environment variable, default to '/' for local dev
// For GitHub Pages, set VITE_BASE_PATH to your repository name (e.g., '/wallet/')
const base = process.env.VITE_BASE_PATH || "/";

export default defineConfig({
  base,
  root: "./src/test",
  plugins: [
    // Automatically resolve TypeScript path aliases from tsconfig.json
    tsconfigPaths({
      root: "../..",
    }),
  ],
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: "../../docs",
    emptyOutDir: true,
  },
});

