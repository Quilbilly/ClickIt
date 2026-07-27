import fs from "node:fs/promises";
import path from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";
import { photoFilePath } from "./store.js";

let s3Client = null;

function getS3() {
  if (s3Client) return s3Client;
  if (!config.s3.bucket || !config.s3.accessKeyId) {
    const err = new Error("S3/R2 is not configured. Set S3_BUCKET and credentials.");
    err.code = "S3_NOT_CONFIGURED";
    throw err;
  }
  s3Client = new S3Client({
    region: config.s3.region,
    endpoint: config.s3.endpoint || undefined,
    forcePathStyle: config.s3.forcePathStyle,
    credentials: {
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey,
    },
  });
  return s3Client;
}

function objectKey(sessionId, filename) {
  return `sessions/${sessionId}/${filename}`;
}

export function storageStatus() {
  return {
    provider: config.storageProvider,
    bucket: config.storageProvider === "s3" ? config.s3.bucket || null : null,
    configured:
      config.storageProvider !== "s3" ||
      Boolean(config.s3.bucket && config.s3.accessKeyId && config.s3.secretAccessKey),
  };
}

export async function localPhotoExists(sessionId, filename) {
  const safe = path.basename(filename);
  try {
    await fs.access(photoFilePath(sessionId, safe));
    return true;
  } catch {
    return false;
  }
}

export async function uploadSessionPhotos(session) {
  if (config.storageProvider !== "s3") {
    return {
      provider: "local",
      uploaded: (session.photos || []).map((p) => ({
        filename: p.filename,
        key: null,
        local: true,
      })),
    };
  }

  const client = getS3();
  const uploaded = [];

  for (const photo of session.photos || []) {
    const abs = photoFilePath(session.id, photo.filename);
    const body = await fs.readFile(abs);
    const key = objectKey(session.id, photo.filename);
    await client.send(
      new PutObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
        Body: body,
        ContentType: "image/jpeg",
      })
    );
    uploaded.push({ filename: photo.filename, key, bytes: body.length });
  }

  return { provider: "s3", uploaded };
}

/**
 * Resolve a cloud URL for a photo (public base or signed).
 * @param {"inline"|"attachment"} disposition
 */
export async function getCloudPhotoUrl(session, filename, { disposition = "inline", expiresIn = 60 * 30 } = {}) {
  if (config.storageProvider !== "s3") return null;

  const safe = path.basename(filename);
  const client = getS3();
  const key = objectKey(session.id, safe);

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
      })
    );
  } catch {
    return null;
  }

  if (config.s3.publicBaseUrl && disposition === "inline") {
    return `${config.s3.publicBaseUrl}/${key}`;
  }

  const contentDisposition =
    disposition === "attachment"
      ? `attachment; filename="${safe}"`
      : `inline; filename="${safe}"`;

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      ResponseContentDisposition: contentDisposition,
      ResponseContentType: "image/jpeg",
    }),
    { expiresIn }
  );
}

export async function getPhotoReadStreamOrPath(session, filename, { disposition = "inline" } = {}) {
  const safe = path.basename(filename);
  const abs = photoFilePath(session.id, safe);

  try {
    await fs.access(abs);
    return { kind: "file", path: abs, filename: safe, source: "local" };
  } catch {
    // fall through to cloud
  }

  const url = await getCloudPhotoUrl(session, safe, { disposition });
  if (!url) return null;
  return { kind: "url", url, filename: safe, source: "cloud" };
}

/**
 * Guest-page photo descriptors: local proxy URLs when files remain,
 * signed/public cloud URLs when local copies have been pruned.
 */
export async function resolveGuestPhotoLinks(session) {
  const photos = [];
  for (const photo of session.photos || []) {
    const safe = path.basename(photo.filename);
    const local = await localPhotoExists(session.id, safe);
    if (local) {
      const proxy = `/api/download/${session.token}/photos/${encodeURIComponent(safe)}`;
      photos.push({
        filename: safe,
        index: photo.index,
        source: "local",
        previewUrl: proxy,
        downloadUrl: `${proxy}?download=1`,
        url: proxy,
      });
      continue;
    }

    const previewUrl = await getCloudPhotoUrl(session, safe, { disposition: "inline" });
    const downloadUrl = await getCloudPhotoUrl(session, safe, { disposition: "attachment" });
    if (!previewUrl && !downloadUrl) {
      photos.push({
        filename: safe,
        index: photo.index,
        source: "missing",
        previewUrl: null,
        downloadUrl: null,
        url: null,
      });
      continue;
    }

    photos.push({
      filename: safe,
      index: photo.index,
      source: "cloud",
      previewUrl: previewUrl || downloadUrl,
      downloadUrl: downloadUrl || previewUrl,
      url: downloadUrl || previewUrl,
    });
  }
  return photos;
}

/**
 * Delete local JPEGs after confirming cloud copies exist (or provider is local-only skip).
 */
export async function pruneLocalSessionPhotos(session) {
  if (!session?.photos?.length) {
    return { pruned: [], skipped: [], reason: "no_photos" };
  }

  if (config.storageProvider !== "s3") {
    const err = new Error("Local prune is only available when STORAGE_PROVIDER=s3");
    err.code = "PRUNE_REQUIRES_S3";
    throw err;
  }

  if (!session.cloud?.uploadedAt) {
    const err = new Error("Session has not been uploaded to cloud storage yet");
    err.code = "PRUNE_NOT_UPLOADED";
    throw err;
  }

  const client = getS3();
  const pruned = [];
  const skipped = [];

  for (const photo of session.photos) {
    const safe = path.basename(photo.filename);
    const key = objectKey(session.id, safe);
    try {
      await client.send(
        new HeadObjectCommand({
          Bucket: config.s3.bucket,
          Key: key,
        })
      );
    } catch {
      skipped.push({ filename: safe, reason: "missing_in_cloud" });
      continue;
    }

    const abs = photoFilePath(session.id, safe);
    try {
      await fs.unlink(abs);
      pruned.push(safe);
    } catch (err) {
      if (err.code === "ENOENT") {
        skipped.push({ filename: safe, reason: "already_gone" });
      } else {
        skipped.push({ filename: safe, reason: err.message });
      }
    }
  }

  // Remove empty session upload dir when possible.
  try {
    const dir = path.join(config.paths.uploads, session.id);
    const remaining = await fs.readdir(dir);
    if (remaining.length === 0) await fs.rmdir(dir);
  } catch {
    // ignore
  }

  return { pruned, skipped };
}
