import { defineConfig } from "tsup";

export default defineConfig({
  entry: { pingfyr: "src/index.ts" },
  outDir: "dist/bin",
  format: ["esm"],
  target: "es2020",
  banner: { js: "#!/usr/bin/env node" },
  declaration: false,
  sourcemap: false,
  minify: false,
  clean: true,
});
