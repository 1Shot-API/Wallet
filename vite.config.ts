import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import basicSsl from "@vitejs/plugin-basic-ssl";

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
    // Enable HTTPS with auto-generated self-signed certificate for localhost
    basicSsl({
      domains: ['localhost'],
      name: 'localhost',
    }),
  ],
  server: {
    port: 3000,
    open: true,
    // HTTPS is enabled automatically by @vitejs/plugin-basic-ssl
  },
  build: {
    outDir: "../../docs",
    emptyOutDir: true,
  },
});

