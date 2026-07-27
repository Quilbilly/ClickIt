import { Router } from "express";
import { getSettings, updateSettings } from "../settings.js";
import { listSessions, getSession, saveSession } from "../services/store.js";
import { getCamera, getCameraStatus } from "../services/camera/index.js";
import { sendDownloadEmail } from "../services/email.js";
import { config } from "../config.js";
import { listJobs, processQueueOnce, enqueueSessionEmail, enqueueSessionUpload } from "../services/queue.js";
import { storageStatus, pruneLocalSessionPhotos } from "../services/storage.js";
import { makeDownloadQr } from "../services/qr.js";

const router = Router();

router.get("/settings", async (_req, res) => {
  res.json(await getSettings());
});

router.put("/settings", async (req, res) => {
  try {
    const updated = await updateSettings(req.body || {});
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/sessions", async (_req, res) => {
  const sessions = await listSessions();
  res.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      status: s.status,
      email: s.email,
      photoCount: s.photos?.length || 0,
      createdAt: s.createdAt,
      emailedAt: s.emailedAt,
      expiresAt: s.expiresAt,
      error: s.error,
      cloudUploaded: Boolean(s.cloud?.uploadedAt),
      localPrunedAt: s.localPrunedAt || null,
    })),
  });
});

router.get("/sessions/:id", async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Not found" });
  return res.json(session);
});

router.post("/sessions/:id/resend", async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Not found" });
  const email = String(req.body?.email || session.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "No email on session" });
  if (!session.photos?.length) return res.status(400).json({ error: "No photos" });

  const downloadUrl = `${config.publicBaseUrl}/d/${session.token}`;
  const mail = await sendDownloadEmail({ to: email, session, downloadUrl });
  session.email = email;
  session.status = "delivered";
  session.emailedAt = new Date().toISOString();
  await saveSession(session);
  res.json({ ok: true, downloadUrl, emailPreview: mail.preview });
});

router.get("/camera", async (_req, res) => {
  res.json(await getCameraStatus());
});

router.post("/camera/connect", async (_req, res) => {
  try {
    res.json(await getCamera().connect());
  } catch (err) {
    res.status(500).json({ error: err.message, code: err.code });
  }
});

router.get("/stats", async (_req, res) => {
  const sessions = await listSessions();
  const jobs = await listJobs();
  const delivered = sessions.filter((s) => s.status === "delivered").length;
  const photos = sessions.reduce((n, s) => n + (s.photos?.length || 0), 0);
  const errors = sessions.filter((s) => s.status === "error").length;
  const queued = sessions.filter((s) => String(s.status).startsWith("queued")).length;
  res.json({
    sessions: sessions.length,
    delivered,
    photos,
    errors,
    queued,
    pendingJobs: jobs.filter((j) => j.status === "pending" || j.status === "running").length,
    conversion: sessions.length ? delivered / sessions.length : 0,
    storage: storageStatus(),
  });
});

router.get("/queue", async (_req, res) => {
  res.json({ jobs: await listJobs() });
});

router.post("/queue/process", async (_req, res) => {
  res.json(await processQueueOnce());
});

router.post("/sessions/:id/requeue", async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Not found" });
  const jobs = [];
  jobs.push(await enqueueSessionUpload(session.id));
  if (session.email) jobs.push(await enqueueSessionEmail(session.id));
  res.json({ ok: true, jobs });
});

router.get("/sessions/:id/qr", async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Not found" });
  const downloadUrl = `${config.publicBaseUrl}/d/${session.token}`;
  const qrDataUrl = await makeDownloadQr(downloadUrl);
  res.json({ downloadUrl, qrDataUrl });
});

router.post("/sessions/:id/prune-local", async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Not found" });
  try {
    const result = await pruneLocalSessionPhotos(session);
    session.localPrunedAt = new Date().toISOString();
    session.localPrune = result;
    await saveSession(session);
    res.json({ ok: true, ...result, sessionId: session.id });
  } catch (err) {
    res.status(err.code === "PRUNE_REQUIRES_S3" || err.code === "PRUNE_NOT_UPLOADED" ? 400 : 500).json({
      error: err.message,
      code: err.code,
    });
  }
});

export default router;
