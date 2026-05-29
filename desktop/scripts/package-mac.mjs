import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packager } from "@electron/packager";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = path.join(root, "out");
const arch = process.arch === "arm64" ? "arm64" : "x64";

await rm(output, { recursive: true, force: true });

const [appPath] = await packager({
  dir: root,
  out: output,
  overwrite: true,
  platform: "darwin",
  arch,
  name: "Riffrec",
  executableName: "Riffrec",
  appBundleId: "com.riffrec.desktop",
  appCategoryType: "public.app-category.developer-tools",
  icon: path.join(root, "assets", "Riffrec.icns"),
  asar: true,
  prune: true,
  extendInfo: {
    NSMicrophoneUsageDescription:
      "Riffrec records microphone narration when you enable voice feedback.",
    NSScreenCaptureUsageDescription:
      "Riffrec records its browser window so you can share a website reproduction."
  },
  ignore: [
    /^\/src/,
    /^\/tests/,
    /^\/assets/,
    /^\/scripts/,
    /^\/out/,
    /^\/coverage/,
    /^\/tsconfig\.json$/,
    /^\/tsup\.config\.ts$/
  ]
});

const appBundlePath = path.join(appPath, "Riffrec.app");
const archivePath = path.join(output, `Riffrec-${process.platform}-${arch}.zip`);
execFileSync("/usr/bin/ditto", [
  "-c",
  "-k",
  "--sequesterRsrc",
  "--keepParent",
  appBundlePath,
  archivePath
]);

console.log(`Packaged application: ${appBundlePath}`);
console.log(`Distributable archive: ${archivePath}`);
