import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { config } from "../config.js";
import { getSession, saveSession } from "./store.js";
import { uploadSessionPhotos } from "./storage.js";
import { sendDownloadEmail } from "./email.js";

let timer = null;
let processing = false;

async function ensureQueueDir() {
  await fs.mkdir(config.paths.queue, { recursive: true });
}

function jobPath(id) {
  return path.join(config.paths.queue, `${id}.json`);
}

export async function enqueueJob(type, payload, { maxAttempts = 8 } = {}) {
  await ensureQueueDir();
  const job = {
    id: nanoid(14),
    type,
    payload,
    status: "pending",
    attempts: 0,
    maxAttempts,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nextAttemptAt: new Date().toISOString(),
    lastError: null,
  };
  await fs.writeFile(jobPath(job.id), JSON.stringify(job, null, 2));
  return job;
}

export async function listJobs() {
  await ensureQueueDir();
  const files = await fs.readdir(config.paths.queue);
  const jobs = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      jobs.push(JSON.parse(await fs.readFile(path.join(config.paths.queue, file), "utf8")));
    } catch {
      // skip
    }
  }
  jobs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return jobs;
}

async function saveJob(job) {
  job.updatedAt = new Date().toISOString();
  await fs.writeFile(jobPath(job.id), JSON.stringify(job, null, 2));
}

function backoffMs(attempts) {
  return Math.min(60_000, 1000 * 2 ** Math.max(0, attempts - 1));
}

async function processJob(job) {
  if (job.type === "upload_session") {
    const session = await getSession(job.payload.sessionId);
    if (!session) throw new Error("Session missing for upload");
    const result = await uploadSessionPhotos(session);
    session.cloud = {
      provider: result.provider,
      uploadedAt: new Date().toISOString(),
      objects: result.uploaded,
    };
    if (session.status === "queued_upload" || session.status === "delivering") {
      // leave delivery status to email job
    }
    await saveSession(session);
    return result;
  }

  if (job.type === "send_email") {
    const session = await getSession(job.payload.sessionId);
    if (!session) throw new Error("Session missing for email");
    if (!session.email) throw new Error("Session has no email");
    const downloadUrl = `${config.publicBaseUrl}/d/${session.token}`;
    const mail = await sendDownloadEmail({
      to: session.email,
      session,
      downloadUrl,
    });
    session.status = "delivered";
    session.emailedAt = new Date().toISOString();
    session.emailError = null;
    await saveSession(session);
    return { messageId: mail.messageId };
  }

  throw new Error(`Unknown job type: ${job.type}`);
}

export async function processQueueOnce() {
  if (processing) return { skipped: true };
  processing = true;
  try {
    const jobs = await listJobs();
    const now = Date.now();
    let handled = 0;

    for (const job of jobs) {
      if (job.status === "done" || job.status === "dead") continue;
      if (new Date(job.nextAttemptAt).getTime() > now) continue;

      job.status = "running";
      job.attempts += 1;
      await saveJob(job);

      try {
        await processJob(job);
        job.status = "done";
        job.lastError = null;
        await saveJob(job);
        handled += 1;
      } catch (err) {
        job.lastError = err.message;
        if (job.attempts >= job.maxAttempts) {
          job.status = "dead";
        } else {
          job.status = "pending";
          job.nextAttemptAt = new Date(Date.now() + backoffMs(job.attempts)).toISOString();
        }
        await saveJob(job);

        if (job.type === "send_email") {
          const session = await getSession(job.payload.sessionId);
          if (session) {
            session.status = job.status === "dead" ? "error" : "queued_email";
            session.emailError = err.message;
            await saveSession(session);
          }
        }
      }
    }

    return { handled };
  } finally {
    processing = false;
  }
}

export function startQueueWorker() {
  if (timer) return;
  timer = setInterval(() => {
    processQueueOnce().catch((err) => console.error("[queue]", err));
  }, config.queuePollMs);
  // kick once on boot
  processQueueOnce().catch((err) => console.error("[queue]", err));
}

export function stopQueueWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

export async function enqueueSessionUpload(sessionId) {
  return enqueueJob("upload_session", { sessionId });
}

export async function enqueueSessionEmail(sessionId) {
  return enqueueJob("send_email", { sessionId });
}
