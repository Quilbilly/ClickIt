import fs from "node:fs/promises";
import { config } from "./config.js";

const DEFAULTS = {
  eventName: config.defaults.eventName,
  countdownSeconds: config.defaults.countdownSeconds,
  photoCount: config.defaults.photoCount,
  intervalMs: config.defaults.intervalMs,
  brandAccent: config.defaults.brandAccent,
  allowRetake: config.defaults.allowRetake,
  requireEmailConsent: config.defaults.requireEmailConsent,
  allowQrOnly: config.defaults.allowQrOnly,
  attractTagline: config.defaults.attractTagline,
  emailSubject: "Your ClickIt photos are ready",
  downloadLinkHours: config.downloadLinkHours,
};

let cache = null;

async function ensure() {
  try {
    await fs.access(config.paths.settings);
  } catch {
    await fs.writeFile(config.paths.settings, JSON.stringify(DEFAULTS, null, 2));
  }
}

export async function getSettings() {
  if (cache) return { ...cache };
  await ensure();
  const raw = await fs.readFile(config.paths.settings, "utf8");
  cache = { ...DEFAULTS, ...JSON.parse(raw) };
  return { ...cache };
}

export async function updateSettings(patch) {
  const current = await getSettings();
  const next = {
    ...current,
    ...patch,
  };

  if (next.countdownSeconds < 0 || next.countdownSeconds > 30) {
    throw new Error("countdownSeconds must be between 0 and 30");
  }
  if (next.photoCount < 1 || next.photoCount > 12) {
    throw new Error("photoCount must be between 1 and 12");
  }
  if (next.intervalMs < 250 || next.intervalMs > 10000) {
    throw new Error("intervalMs must be between 250 and 10000");
  }

  cache = next;
  await fs.writeFile(config.paths.settings, JSON.stringify(next, null, 2));
  return { ...next };
}
