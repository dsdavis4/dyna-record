/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  globalSetup: "./global-setup.js",
  testMatch: ["**/*.test.ts"],
  globals: {
    "ts-jest": {
      tsconfig: "tsconfig.dev.json"
    }
  },
  coveragePathIgnorePatterns: [
    "README.md",
    "/node_modules/",
    "dist",
    "tests/integration/mockModels.ts"
  ],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 60,
      lines: 85,
      statements: 85
    }
  }
};
