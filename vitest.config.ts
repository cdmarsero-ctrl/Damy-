import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tools/**/*.test.ts"],
    // Pure-function unit tests only: anything touching Prisma or the network is
    // covered by scripts/smoke.sh against a live server instead.
    globals: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
