#!/usr/bin/env node
/**
 * Quick local checks for Windows Sony bridge runtime layout.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const dist = path.join(repoRoot, "sidecars", "sony-bridge", "native", "dist");

function exists(p) {
  return fs.existsSync(p);
}

const checks = [
  path.join(dist, "clickit-sony-bridge.exe"),
  path.join(dist, "clickit-sony-bridge.exe.local"),
  path.join(dist, "Cr_Core.dll"),
  path.join(dist, "CrAdapter"),
  path.join(dist, "CrAdapter", "Cr_PTP_USB.dll"),
];

console.log(`Dist: ${dist}`);
let ok = true;
for (const p of checks) {
  const hit = exists(p);
  console.log(`${hit ? "OK " : "MISS"}  ${p}`);
  if (!hit) ok = false;
}

if (exists(path.join(dist, "CrAdapter"))) {
  const files = fs.readdirSync(path.join(dist, "CrAdapter"));
  console.log(`\nCrAdapter contents (${files.length}):`);
  for (const f of files.slice(0, 40)) console.log(`  - ${f}`);
}

process.exit(ok ? 0 : 1);
