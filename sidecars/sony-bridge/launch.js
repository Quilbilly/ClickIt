#!/usr/bin/env node
/**
 * Starts the Sony tether bridge.
 *
 * Windows x64: prefer the CrSDK-linked native binary when present.
 * Otherwise (or on other platforms): fall back to the Node protocol stub.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = process.env.SONY_BRIDGE_PORT || "8791";
const forceDev = String(process.env.SONY_BRIDGE_DEV || "").toLowerCase() === "true";

const nativeExe = path.join(__dirname, "native", "dist", "clickit-sony-bridge.exe");
const useNative = !forceDev && process.platform === "win32" && fs.existsSync(nativeExe);

function run(command, args, opts = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    env: { ...process.env, SONY_BRIDGE_PORT: String(port) },
    ...opts,
  });
  const shutdown = () => {
    if (!child.killed) child.kill("SIGTERM");
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  child.on("exit", (code, signal) => {
    if (signal) process.exit(1);
    process.exit(code ?? 0);
  });
}

if (useNative) {
  console.log(`[sony-bridge] starting native CrSDK bridge: ${nativeExe}`);
  console.log(`[sony-bridge] protocol http://127.0.0.1:${port}`);
  run(nativeExe, [], { windowsHide: true });
} else {
  if (process.platform === "win32" && !forceDev) {
    console.warn(
      "[sony-bridge] native clickit-sony-bridge.exe not found — using Node stub.\n" +
        "  Build it with: npm run sony-bridge:build\n" +
        "  (requires vendor/sony-camera-remote-sdk/windows + VS 2022 + CMake)"
    );
  } else if (!forceDev && process.platform !== "win32") {
    console.warn(
      "[sony-bridge] native CrSDK bridge is Windows x64 only for now — using Node stub."
    );
  } else {
    console.log("[sony-bridge] SONY_BRIDGE_DEV=true — using Node stub.");
  }
  run(process.execPath, [path.join(__dirname, "server.js")]);
}
