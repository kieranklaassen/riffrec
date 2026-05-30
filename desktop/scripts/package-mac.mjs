import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packager } from "@electron/packager";
import { flipFuses, FuseVersion, FuseV1Options } from "@electron/fuses";

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
await flipFuses(
  appBundlePath,
  {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: process.platform === "darwin" && arch === "arm64",
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true
  }
);
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
