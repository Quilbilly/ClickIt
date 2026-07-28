#!/usr/bin/env node
/**
 * Checks that the Sony Camera Remote SDK is findable for the Windows bridge build.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// scripts/ -> native/ -> sony-bridge/ -> sidecars/ -> repo root
const repoRoot = path.resolve(__dirname, "../../../..");

const sdkRoot =
  process.env.SONY_SDK_ROOT ||
  path.join(repoRoot, "vendor", "sony-camera-remote-sdk", "windows");

function walkFind(dir, predicate, depth = 0, maxDepth = 6) {
  if (!fs.existsSync(dir) || depth > maxDepth) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isFile() && predicate(full, ent.name)) return full;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name === "node_modules" || ent.name === ".git") continue;
    const hit = walkFind(path.join(dir, ent.name), predicate, depth + 1, maxDepth);
    if (hit) return hit;
  }
  return null;
}

console.log(`Repo:     ${repoRoot}`);
console.log(`SDK root: ${sdkRoot}`);

if (!fs.existsSync(sdkRoot)) {
  console.error("\nMISSING: SDK folder does not exist.");
  console.error("Extract the Windows Camera Remote SDK to:");
  console.error(`  ${path.join(repoRoot, "vendor", "sony-camera-remote-sdk", "windows")}`);
  console.error("Or set SONY_SDK_ROOT to the extracted SDK root.");
  process.exit(1);
}

const header = walkFind(sdkRoot, (_p, name) => name === "CameraRemote_SDK.h");
const lib = walkFind(sdkRoot, (_p, name) => name === "Cr_Core.lib" || name === "libCr_Core.lib");
const dll = walkFind(sdkRoot, (_p, name) => name === "Cr_Core.dll");
const adapter = walkFind(sdkRoot, (_p, name) => name === "Cr_PTP_USB.dll" || name === "CrAdapter");

console.log(`Header:   ${header || "NOT FOUND"}`);
console.log(`Import:   ${lib || "NOT FOUND"}`);
console.log(`Runtime:  ${dll || "NOT FOUND"}`);
console.log(`Adapter:  ${adapter || "NOT FOUND (optional probe)"}`);

const nativeExe = path.join(
  repoRoot,
  "sidecars",
  "sony-bridge",
  "native",
  "dist",
  "clickit-sony-bridge.exe"
);
console.log(`Bridge:   ${fs.existsSync(nativeExe) ? nativeExe : "not built yet"}`);

const ok = Boolean(header && lib);
if (!ok) {
  console.error("\nSDK layout looks incomplete.");
  console.error("Inside vendor/sony-camera-remote-sdk/windows you need at least:");
  console.error("  - CameraRemote_SDK.h  (usually under app/CRSDK/)");
  console.error("  - Cr_Core.lib         (usually under external/crsdk/)");
  console.error("  - Cr_Core.dll + CrAdapter/ for runtime");
  process.exit(1);
}

console.log("\nSDK looks usable. Next:");
if (!fs.existsSync(nativeExe)) {
  console.log("  npm run sony-bridge:build");
}
console.log("  npm run sony-bridge");
console.log('  $env:CAMERA_PROVIDER="sony"; npm run dev');
process.exit(0);
