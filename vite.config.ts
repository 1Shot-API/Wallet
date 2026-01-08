import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
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
    outDir: "../../dist-test",
    emptyOutDir: true,
  },
});

