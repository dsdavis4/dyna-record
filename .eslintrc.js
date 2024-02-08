module.exports = {
  env: {
    es2021: true,
    node: true
  },
  extends: ["standard-with-typescript", "prettier"],
  overrides: [
    {
      env: {
        node: true
      },
      files: [".eslintrc.{js,cjs}"],
      parserOptions: {
        sourceType: "script"
      }
    },
    {
      files: ["*.test.ts"],
      rules: {
        "@typescript-eslint/no-unsafe-argument": "off"
      }
    }
  ],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    project: ["./tsconfig.eslint.json", "tsconfig.json"]
  },
  rules: {}
};
