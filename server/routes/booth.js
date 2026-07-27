import { Router } from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { getSettings } from "../settings.js";
import { getCamera, getCameraStatus } from "../services/camera/index.js";
import {
  createSession,
  getSession,
  saveSession,
  ensureSessionUploadDir,
  photoFilePath,
} from "../services/store.js";
import { afterCapture, deliverSession } from "../services/delivery.js";

const router = Router();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

router.get("/booth/config", async (_req, res) => {
  const [settings, camera] = await Promise.all([getSettings(), getCameraStatus()]);
  res.json({
    eventName: settings.eventName,
    countdownSeconds: settings.countdownSeconds,
    photoCount: settings.photoCount,
    intervalMs: settings.intervalMs,
    brandAccent: settings.brandAccent,
    allowRetake: settings.allowRetake,
    requireEmailConsent: settings.requireEmailConsent,
    allowQrOnly: settings.allowQrOnly !== false,
    attractTagline: settings.attractTagline,
    camera,
  });
});

router.get("/booth/camera/status", async (_req, res) => {
  res.json(await getCameraStatus());
});

router.get("/booth/camera/live.jpg", async (_req, res) => {
  try {
    const frame = await getCamera().getLiveFrame();
    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "no-store");
    res.send(frame);
  } catch (err) {
    res.status(503).json({ error: err.message, code: err.code || "CAMERA_ERROR" });
  }
});

router.post("/booth/sessions", async (_req, res) => {
  const session = await createSession({ status: "ready" });
  res.status(201).json({ id: session.id, status: session.status });
});

router.get("/booth/sessions/:id", async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  return res.json(publicSession(session));
});

/**
 * Runs the full capture sequence server-side using current settings.
 * Body may override countdown/photoCount/interval for this session.
 */
router.post("/booth/sessions/:id/capture", async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });

  const settings = await getSettings();
  const countdownSeconds = clamp(
    Number(req.body?.countdownSeconds ?? settings.countdownSeconds),
    0,
    30
  );
  const photoCount = clamp(Number(req.body?.photoCount ?? settings.photoCount), 1, 12);
  const intervalMs = clamp(Number(req.body?.intervalMs ?? settings.intervalMs), 250, 10000);

  session.status = "capturing";
  session.photos = [];
  session.error = null;
  await saveSession(session);

  const camera = getCamera();
  const dir = await ensureSessionUploadDir(session.id);
  const photos = [];

  try {
    // Countdown is primarily client-rendered; brief settle before first shutter.
    if (countdownSeconds > 0) await sleep(Math.min(countdownSeconds, 1) * 200);

    for (let i = 1; i <= photoCount; i += 1) {
      const buffer = await camera.capturePhoto({
        sessionId: session.id,
        index: i,
        total: photoCount,
      });
      const filename = `photo-${String(i).padStart(2, "0")}.jpg`;
      const abs = path.join(dir, filename);
      await fs.writeFile(abs, buffer);
      photos.push({
        filename,
        index: i,
        bytes: buffer.length,
        url: `/api/booth/sessions/${session.id}/photos/${filename}`,
        capturedAt: new Date().toISOString(),
      });
      if (i < photoCount) await sleep(intervalMs);
    }

    session.photos = photos;
    session.status = "review";
    await saveSession(session);
    await afterCapture(session);
    return res.json(publicSession(await getSession(session.id)));
  } catch (err) {
    session.status = "error";
    session.error = err.message;
    await saveSession(session);
    return res.status(500).json({ error: err.message, code: err.code || "CAPTURE_FAILED" });
  }
});

router.get("/booth/sessions/:id/photos/:filename", async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  const safe = path.basename(req.params.filename);
  const abs = photoFilePath(session.id, safe);
  try {
    await fs.access(abs);
    res.set("Cache-Control", "private, max-age=3600");
    return res.sendFile(abs);
  } catch {
    return res.status(404).json({ error: "Photo not found" });
  }
});

router.post("/booth/sessions/:id/retake", async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  const settings = await getSettings();
  if (!settings.allowRetake) {
    return res.status(400).json({ error: "Retakes are disabled for this event" });
  }

  // Clear prior photos from disk.
  for (const photo of session.photos || []) {
    try {
      await fs.unlink(photoFilePath(session.id, photo.filename));
    } catch {
      // ignore
    }
  }

  session.photos = [];
  session.status = "ready";
  session.error = null;
  await saveSession(session);
  return res.json(publicSession(session));
});

router.post("/booth/sessions/:id/email", async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });

  try {
    const result = await deliverSession(session, {
      email: String(req.body?.email || "").trim().toLowerCase(),
      consent: Boolean(req.body?.consent),
      qrOnly: false,
    });
    return res.json({
      ok: true,
      session: publicSession(result.session),
      downloadUrl: result.downloadUrl,
      qrDataUrl: result.qrDataUrl,
      queuedEmail: result.queuedEmail,
      emailPreview: result.emailPreview,
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

router.post("/booth/sessions/:id/qr", async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });

  try {
    const result = await deliverSession(session, { qrOnly: true });
    return res.json({
      ok: true,
      session: publicSession(result.session),
      downloadUrl: result.downloadUrl,
      qrDataUrl: result.qrDataUrl,
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

function publicSession(session) {
  return {
    id: session.id,
    status: session.status,
    photos: session.photos || [],
    email: session.email,
    expiresAt: session.expiresAt,
    error: session.error,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export default router;
