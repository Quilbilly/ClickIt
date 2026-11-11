#!/usr/bin/env node
/**
 * npm entry for building the Windows CrSDK bridge.
 * On non-Windows hosts this prints instructions and exits non-zero.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.platform !== "win32") {
  console.error(
    "sony-bridge:build requires Windows x64 (Visual Studio 2022 + CMake).\n" +
      "Extract the Sony Camera Remote SDK into vendor/sony-camera-remote-sdk/windows\n" +
      "then run this command on the booth PC."
  );
  process.exit(1);
}

const ps1 = path.join(__dirname, "build.ps1");
const result = spawnSync(
  "powershell",
  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1],
  { stdio: "inherit" }
);
process.exit(result.status ?? 1);
