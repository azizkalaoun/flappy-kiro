import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Domain modules run in Node without a DOM; shell modules that need a DOM
    // opt into jsdom per-file via a `// @vitest-environment jsdom` comment.
    environment: "node",
    include: ["src/**/*.test.js", "test/**/*.test.js"],
    // No test files exist yet during bootstrap; don't fail the run for that.
    passWithNoTests: true,
  },
});
