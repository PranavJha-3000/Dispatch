import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/globalSetup.ts"],
    setupFiles: ["./test/setup.ts"],
    fileParallelism: false,
    hookTimeout: 120000,
    testTimeout: 20000,
  },
});
