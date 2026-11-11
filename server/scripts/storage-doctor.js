/**
 * Verifies STORAGE_PROVIDER / S3-R2 credentials with a tiny put/head/delete.
 * Usage: npm run storage:doctor
 */
import { config } from "../config.js";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListBucketsCommand,
} from "@aws-sdk/client-s3";

function fail(msg) {
  console.error(`[storage:doctor] FAIL: ${msg}`);
  process.exitCode = 1;
}

async function main() {
  console.log("[storage:doctor] provider=", config.storageProvider);
  console.log("[storage:doctor] publicBaseUrl=", config.publicBaseUrl);

  if (config.storageProvider !== "s3") {
    console.log("[storage:doctor] STORAGE_PROVIDER is not s3 — local disk only.");
    console.log("[storage:doctor] Set STORAGE_PROVIDER=s3 in .env to use Cloudflare R2.");
    return;
  }

  const missing = [];
  if (!config.s3.endpoint) missing.push("S3_ENDPOINT");
  if (!config.s3.bucket) missing.push("S3_BUCKET");
  if (!config.s3.accessKeyId) missing.push("S3_ACCESS_KEY_ID");
  if (!config.s3.secretAccessKey) missing.push("S3_SECRET_ACCESS_KEY");
  if (missing.length) {
    fail(`Missing ${missing.join(", ")} in .env — see CLOUDFLARE.md`);
    return;
  }

  console.log("[storage:doctor] endpoint=", config.s3.endpoint);
  console.log("[storage:doctor] bucket=", config.s3.bucket);
  console.log("[storage:doctor] region=", config.s3.region);
  console.log("[storage:doctor] publicBaseUrl(S3)=", config.s3.publicBaseUrl || "(none — will use signed URLs)");

  const client = new S3Client({
    region: config.s3.region,
    endpoint: config.s3.endpoint,
    forcePathStyle: config.s3.forcePathStyle,
    credentials: {
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey,
    },
  });

  try {
    const listed = await client.send(new ListBucketsCommand({}));
    const names = (listed.Buckets || []).map((b) => b.Name);
    console.log("[storage:doctor] list buckets ok:", names.join(", ") || "(none)");
    if (!names.includes(config.s3.bucket)) {
      console.warn(
        `[storage:doctor] WARNING: bucket "${config.s3.bucket}" not in list — check name / token scope`
      );
    }
  } catch (err) {
    fail(`ListBuckets failed: ${err.message}`);
    return;
  }

  const key = `clickit-doctor/${Date.now()}.txt`;
  const body = Buffer.from(`clickit-r2-ok ${new Date().toISOString()}\n`, "utf8");

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
        Body: body,
        ContentType: "text/plain",
      })
    );
    console.log("[storage:doctor] put ok:", key);

    await client.send(
      new HeadObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
      })
    );
    console.log("[storage:doctor] head ok");

    await client.send(
      new DeleteObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
      })
    );
    console.log("[storage:doctor] delete ok");
    console.log("[storage:doctor] PASS — R2 credentials work. Captures will upload after each session.");
  } catch (err) {
    fail(`Object round-trip failed: ${err.message}`);
  }
}

main().catch((err) => {
  fail(err.message);
});
