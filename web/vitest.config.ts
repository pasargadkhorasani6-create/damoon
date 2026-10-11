import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    // تست‌ها روی یک دیتابیس مشترک کار می‌کنند
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
