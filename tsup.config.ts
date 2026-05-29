import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["index.ts"],
  format: ["esm", "cjs"],
  // target aligns with engines.node (>=22) so esbuild skips downleveling
  // syntax already available on the supported runtime.
  target: "node22",
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: "dist",
  // Bundle to a single ESM and a single CJS file (dist/index.js,
  // dist/index.cjs) with matching .d.ts / .d.cts declaration files.
  // splitting: false keeps the published artifact predictable for the
  // exports map below.
  splitting: false,
  // Keep AWS SDK + zod external — they are runtime deps consumers install
  // alongside dyna-record. Don't inline them into the bundle.
  external: [
    "@aws-sdk/client-dynamodb",
    "@aws-sdk/lib-dynamodb",
    "@aws-sdk/util-dynamodb",
    "zod"
  ]
});
