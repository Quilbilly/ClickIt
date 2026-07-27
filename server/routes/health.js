import { Router } from "express";
import { getCameraStatus } from "../services/camera/index.js";
import { getSettings } from "../settings.js";
import { storageStatus } from "../services/storage.js";
import { listJobs } from "../services/queue.js";
import { config } from "../config.js";

const router = Router();

router.get("/health", async (_req, res) => {
  const [camera, settings, jobs] = await Promise.all([
    getCameraStatus(),
    getSettings(),
    listJobs(),
  ]);
  const pendingJobs = jobs.filter((j) => j.status === "pending" || j.status === "running").length;
  res.json({
    ok: true,
    app: "ClickIt",
    version: "0.2.0",
    camera,
    storage: storageStatus(),
    email: config.emailTransport,
    queue: { pending: pendingJobs },
    eventName: settings.eventName,
  });
});

export default router;
