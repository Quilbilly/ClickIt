#!/usr/bin/env node
/**
 * Copy Cr_Core.dll + CrAdapter next to clickit-sony-bridge.exe.
 * Fixes EnumCameraObjects failures when the build only linked the .lib.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");
const sdkRoot =
  process.env.SONY_SDK_ROOT ||
  path.join(repoRoot, "vendor", "sony-camera-remote-sdk", "windows");
const distDir = path.join(repoRoot, "sidecars", "sony-bridge", "native", "dist");

function walkFind(dir, predicate, { dirs = false, depth = 0, maxDepth = 8 } = {}) {
  if (!fs.existsSync(dir) || depth > maxDepth) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (!dirs && ent.isFile() && predicate(full, ent.name)) return full;
    if (dirs && ent.isDirectory() && predicate(full, ent.name)) return full;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name === "node_modules" || ent.name === ".git") continue;
    const hit = walkFind(path.join(dir, ent.name), predicate, {
      dirs,
      depth: depth + 1,
      maxDepth,
    });
    if (hit) return hit;
  }
  return null;
}

function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) copyRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
}

if (!fs.existsSync(distDir)) {
  console.error(`Missing dist folder: ${distDir}`);
  console.error("Build first with: npm run sony-bridge:build");
  process.exit(1);
}

const dll = walkFind(sdkRoot, (_p, name) => name === "Cr_Core.dll");
const adapter =
  walkFind(sdkRoot, (_p, name) => name === "CrAdapter", { dirs: true }) ||
  (() => {
    const marker = walkFind(sdkRoot, (_p, name) => name === "Cr_PTP_USB.dll");
    return marker ? path.dirname(marker) : null;
  })();

console.log(`SDK:      ${sdkRoot}`);
console.log(`Dist:     ${distDir}`);
console.log(`DLL:      ${dll || "NOT FOUND"}`);
console.log(`Adapter:  ${adapter || "NOT FOUND"}`);

if (!dll || !adapter) {
  console.error("\nCould not find Cr_Core.dll and/or CrAdapter under the SDK tree.");
  process.exit(1);
}

fs.copyFileSync(dll, path.join(distDir, "Cr_Core.dll"));
const destAdapter = path.join(distDir, "CrAdapter");
fs.rmSync(destAdapter, { recursive: true, force: true });
copyRecursive(adapter, destAdapter);

console.log("\nStaged runtime into dist.");
console.log("Restart the bridge:");
console.log("  (stop Window A, then) npm run sony-bridge");
