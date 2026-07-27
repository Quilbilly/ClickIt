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

export async function getPhotoReadStreamOrPath(session, filename) {
  const safe = path.basename(filename);
  const abs = photoFilePath(session.id, safe);

  try {
    await fs.access(abs);
    return { kind: "file", path: abs, filename: safe };
  } catch {
    // fall through to cloud
  }

  if (config.storageProvider !== "s3") {
    return null;
  }

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

  if (config.s3.publicBaseUrl) {
    return {
      kind: "url",
      url: `${config.s3.publicBaseUrl}/${key}`,
      filename: safe,
    };
  }

  const url = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${safe}"`,
    }),
    { expiresIn: 60 * 30 }
  );

  return { kind: "url", url, filename: safe };
}
