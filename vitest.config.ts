import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // pool: "forks" so process.env.TZ propagates from the parent at fork time
    // (test.env is applied post-init in worker pools, after Node's Intl/Date
    // caches have already initialized — forks-mode inherits the parent's TZ
    // before any caching can happen).
    pool: "forks",
    env: {
      TZ: "UTC"
    },
    include: ["**/*.test.ts"],
    // Pin fake-timer behavior to a Jest-compatible subset. Vitest's default
    // toFake list also mocks queueMicrotask, process.nextTick, performance —
    // Jest's modern timers do NOT mock those. The repo has 95+ setSystemTime
    // sites in Create.test.ts / Update.test.ts / Delete.test.ts that depend
    // on timestamp-derived PK/SK assertions; matching Jest's subset keeps
    // those assertions deterministic post-migration.
    fakeTimers: {
      toFake: ["setTimeout", "setInterval", "Date", "performance"]
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json"],
      include: ["src/**/*.ts"],
      exclude: [
        "**/node_modules/**",
        "dist/**",
        "tests/integration/mockModels.ts",
        "**/*.test.ts",
        "**/*.d.ts"
      ],
      thresholds: {
        branches: 85,
        functions: 60,
        lines: 85,
        statements: 85
      }
    }
  }
});
