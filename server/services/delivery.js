import { config } from "../config.js";
import { getSettings } from "../settings.js";
import { getSession, saveSession } from "./store.js";
import { enqueueSessionUpload, enqueueSessionEmail } from "./queue.js";
import { uploadSessionPhotos } from "./storage.js";
import { sendDownloadEmail } from "./email.js";
import { makeDownloadQr } from "./qr.js";

function downloadUrlFor(session) {
  return `${config.publicBaseUrl}/d/${session.token}`;
}

export async function ensureSessionExpiry(session) {
  if (session.expiresAt) return session;
  const settings = await getSettings();
  session.expiresAt = new Date(
    Date.now() + (settings.downloadLinkHours || config.downloadLinkHours) * 3600 * 1000
  ).toISOString();
  return saveSession(session);
}

/**
 * After capture: keep local files, try cloud upload, queue on failure.
 */
export async function afterCapture(session) {
  await ensureSessionExpiry(session);
  try {
    const result = await uploadSessionPhotos(session);
    session.cloud = {
      provider: result.provider,
      uploadedAt: new Date().toISOString(),
      objects: result.uploaded,
    };
    await saveSession(session);
  } catch (err) {
    session.cloud = {
      provider: config.storageProvider,
      uploadedAt: null,
      error: err.message,
    };
    session.status = session.status === "review" ? "review" : session.status;
    await saveSession(session);
    await enqueueSessionUpload(session.id);
  }
  return session;
}

/**
 * Deliver photos: always return QR + download URL.
 * Email is optional. Network failures queue email for retry.
 */
export async function deliverSession(session, { email = null, consent = false, qrOnly = false } = {}) {
  const settings = await getSettings();
  await ensureSessionExpiry(session);

  if (!session.photos?.length) {
    throw Object.assign(new Error("No photos to deliver"), { status: 400 });
  }

  if (!qrOnly) {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw Object.assign(new Error("Enter a valid email address"), { status: 400 });
    }
    if (settings.requireEmailConsent && !consent) {
      throw Object.assign(new Error("Consent is required to send photos"), { status: 400 });
    }
    session.email = email;
    session.consent = consent;
  } else if (!settings.allowQrOnly) {
    throw Object.assign(new Error("QR-only delivery is disabled"), { status: 400 });
  }

  const downloadUrl = downloadUrlFor(session);
  const qrDataUrl = await makeDownloadQr(downloadUrl);

  // Best-effort cloud upload now; queue if needed.
  try {
    const result = await uploadSessionPhotos(session);
    session.cloud = {
      provider: result.provider,
      uploadedAt: new Date().toISOString(),
      objects: result.uploaded,
    };
  } catch (err) {
    session.cloud = {
      provider: config.storageProvider,
      uploadedAt: null,
      error: err.message,
    };
    await enqueueSessionUpload(session.id);
  }

  let emailResult = null;
  if (!qrOnly && session.email) {
    session.status = "delivering";
    await saveSession(session);
    try {
      emailResult = await sendDownloadEmail({
        to: session.email,
        session,
        downloadUrl,
      });
      session.status = "delivered";
      session.emailedAt = new Date().toISOString();
      session.emailError = null;
    } catch (err) {
      session.status = "queued_email";
      session.emailError = err.message;
      await enqueueSessionEmail(session.id);
      emailResult = { queued: true, error: err.message };
    }
  } else {
    session.status = "delivered";
  }

  await saveSession(session);

  return {
    ok: true,
    downloadUrl,
    qrDataUrl,
    queuedEmail: session.status === "queued_email",
    emailPreview: emailResult?.preview || null,
    session,
  };
}
