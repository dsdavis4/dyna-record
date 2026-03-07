import globals from "globals";
import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default defineConfig(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "docs/**",
      ".debug/**",
      "eslint.config.mjs",
      "global-setup.js",
      "jest.config.js"
    ]
  },
  eslint.configs.recommended,
  // Strict for non-test TypeScript files
  {
    files: ["**/*.ts"],
    ignores: ["**/*.test.ts"],
    // TODO use strict type checked also?
    extends: tseslint.configs.strict
  },
  // Recommended for test files
  {
    files: ["**/*.test.ts"],
    extends: tseslint.configs.recommended,
    rules: {
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-explicit-any": "off"
    }
  },
  // Shared languageOptions and rules for all TypeScript files
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node
      },
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        project: ["tsconfig.eslint.json", "tsconfig.json"]
      }
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_"
        }
      ]
    }
  },
  eslintConfigPrettier
);
