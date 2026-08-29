import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.database.test.ts"],
    environment: "node",
    fileParallelism: false,
    coverage: { reporter: ["text", "html"] },
  },
});
