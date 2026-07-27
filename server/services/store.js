import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { config } from "../config.js";

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function sessionPath(id) {
  return path.join(config.paths.sessions, `${id}.json`);
}

export async function initStore() {
  await ensureDir(config.paths.sessions);
  await ensureDir(config.paths.uploads);
  await ensureDir(config.paths.tmp);
  await ensureDir(config.paths.queue);
}

export async function createSession(partial = {}) {
  const id = nanoid(12);
  const token = nanoid(24);
  const now = new Date().toISOString();
  const session = {
    id,
    token,
    status: "created",
    email: null,
    consent: false,
    photos: [],
    createdAt: now,
    updatedAt: now,
    emailedAt: null,
    expiresAt: null,
    error: null,
    ...partial,
  };
  await saveSession(session);
  return session;
}

export async function saveSession(session) {
  session.updatedAt = new Date().toISOString();
  await fs.writeFile(sessionPath(session.id), JSON.stringify(session, null, 2));
  return session;
}

export async function getSession(id) {
  try {
    const raw = await fs.readFile(sessionPath(id), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function getSessionByToken(token) {
  const sessions = await listSessions();
  return sessions.find((s) => s.token === token) || null;
}

export async function listSessions() {
  await ensureDir(config.paths.sessions);
  const files = await fs.readdir(config.paths.sessions);
  const sessions = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(config.paths.sessions, file), "utf8");
      sessions.push(JSON.parse(raw));
    } catch {
      // skip corrupt
    }
  }
  sessions.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return sessions;
}

export function photoFilePath(sessionId, filename) {
  return path.join(config.paths.uploads, sessionId, filename);
}

export async function ensureSessionUploadDir(sessionId) {
  const dir = path.join(config.paths.uploads, sessionId);
  await ensureDir(dir);
  return dir;
}
