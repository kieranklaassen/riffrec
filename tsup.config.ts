import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      "index.node": "src/noop.tsx"
    },
    format: ["cjs", "esm"],
    dts: true,
    external: ["react", "react-dom"],
    sourcemap: true,
    clean: true
  }
]);
