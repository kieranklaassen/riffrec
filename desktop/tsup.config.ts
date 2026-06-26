import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      main: "src/main.ts",
      "control-preload": "src/control-preload.ts",
      "guest-preload": "src/guest-preload.ts"
    },
    format: ["cjs"],
    platform: "node",
    target: "node20",
    outDir: "dist/process",
    external: ["electron"],
    sourcemap: true
  },
  {
    entry: {
      renderer: "src/renderer.ts"
    },
    format: ["iife"],
    platform: "browser",
    target: "chrome124",
    outDir: "dist/ui",
    globalName: "RiffrecDesktop",
    sourcemap: true
  }
]);
