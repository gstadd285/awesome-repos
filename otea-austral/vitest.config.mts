import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": fileURLToPath(new URL("./vitest.server-only.ts", import.meta.url)) },
  },
  test: {
    // Las pruebas de componentes declaran `@vitest-environment jsdom`.
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
