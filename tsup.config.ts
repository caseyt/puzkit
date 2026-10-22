import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/node.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  // Share one copy of Puzzle between "puzts" and "puzts/node" in the CJS build too.
  splitting: true,
  keepNames: true,
  target: "es2020",
});
