import { defineConfig } from "vitest/config";

// Pinned to vitest 3.x: vitest 4.x (4.1.7 as of mid-2026) has a regression
// that fails to parse TC39 Stage 3 decorators in test files, surfacing as
// an opaque `SyntaxError: Invalid or unexpected token` for any file using
// `@Entity`, `@Table`, `@Attribute`, etc. Track upstream:
//   https://github.com/vitest-dev/vitest/issues
// Test for fix by dropping a minimal decorator file into tests/ and running
// it under the candidate vitest version; if it passes, the pin can move.
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
    // Conservative pin: 95+ setSystemTime sites in Create.test.ts /
    // Update.test.ts / Delete.test.ts depend on timestamp-derived PK/SK
    // assertions. The suite uses none of queueMicrotask, process.nextTick,
    // setImmediate, clearTimeout/Interval, or hrtime under fake timers, so
    // we pin to the minimum surface that the suite actually exercises —
    // future timer-touching tests just need to add what they need here.
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
