import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(root, ".env") });

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function list(name, fallback = []) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function bool(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
}

export const config = {
  root,
  port: int("PORT", 8787),
  host: process.env.HOST || "0.0.0.0",
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || "http://localhost:8787").replace(/\/$/, ""),
  cameraProvider: process.env.CAMERA_PROVIDER || "mock",
  sonySidecarUrl: (process.env.SONY_SIDECAR_URL || "http://127.0.0.1:8791").replace(/\/$/, ""),
  storageProvider: process.env.STORAGE_PROVIDER || "local",
  s3: {
    endpoint: process.env.S3_ENDPOINT || "",
    region: process.env.S3_REGION || "auto",
    bucket: process.env.S3_BUCKET || "",
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
    publicBaseUrl: (process.env.S3_PUBLIC_BASE_URL || "").replace(/\/$/, ""),
    forcePathStyle: bool("S3_FORCE_PATH_STYLE", true),
  },
  emailTransport: process.env.EMAIL_TRANSPORT || "json",
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: int("SMTP_PORT", 587),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    secure: bool("SMTP_SECURE", false),
  },
  emailFrom: process.env.EMAIL_FROM || "ClickIt <noreply@example.com>",
  adminTokens: list("ADMIN_TOKENS", ["dev-admin-token"]),
  downloadLinkHours: int("DOWNLOAD_LINK_HOURS", 168),
  queuePollMs: int("QUEUE_POLL_MS", 5000),
  kiosk: {
    fullscreen: bool("KIOSK_FULLSCREEN", true),
    frame: bool("KIOSK_FRAME", false),
  },
  paths: {
    data: path.join(root, "data"),
    sessions: path.join(root, "data", "sessions"),
    uploads: path.join(root, "data", "uploads"),
    tmp: path.join(root, "data", "tmp"),
    queue: path.join(root, "data", "queue"),
    settings: path.join(root, "data", "settings.json"),
    booth: path.join(root, "booth"),
    public: path.join(root, "public"),
  },
  defaults: {
    countdownSeconds: int("DEFAULT_COUNTDOWN_SECONDS", 3),
    photoCount: int("DEFAULT_PHOTO_COUNT", 3),
    intervalMs: int("DEFAULT_INTERVAL_MS", 1500),
    eventName: process.env.EVENT_NAME || "ClickIt Event",
    brandAccent: "#F5A623",
    allowRetake: true,
    requireEmailConsent: true,
    allowQrOnly: true,
    attractTagline: "Step up. Smile. Walk away with your photos.",
  },
};
