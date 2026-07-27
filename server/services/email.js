import nodemailer from "nodemailer";
import { config } from "../config.js";
import { getSettings } from "../settings.js";

let transporterPromise = null;

async function getTransporter() {
  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    if (config.emailTransport === "smtp") {
      if (!config.smtp.host) {
        throw Object.assign(new Error("SMTP_HOST is not configured"), {
          code: "SMTP_NOT_CONFIGURED",
        });
      }
      return nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure || config.smtp.port === 465,
        auth: config.smtp.user
          ? { user: config.smtp.user, pass: config.smtp.pass }
          : undefined,
      });
    }

    return nodemailer.createTransport({ jsonTransport: true });
  })();

  return transporterPromise;
}

export async function verifyEmailTransport() {
  const transport = await getTransporter();
  if (typeof transport.verify === "function" && config.emailTransport === "smtp") {
    await transport.verify();
  }
  return { transport: config.emailTransport, ok: true };
}

export async function sendDownloadEmail({ to, session, downloadUrl }) {
  const settings = await getSettings();
  const transport = await getTransporter();
  const subject = settings.emailSubject || "Your ClickIt photos are ready";
  const count = session.photos?.length || 0;
  const accent = settings.brandAccent || "#F5A623";

  const text = [
    `Thanks for using ClickIt at ${settings.eventName}!`,
    "",
    `Your ${count} photo${count === 1 ? "" : "s"} ${count === 1 ? "is" : "are"} ready.`,
    `Download: ${downloadUrl}`,
    "",
    "This link will expire after a while — save your favorites.",
    "",
    "— ClickIt",
  ].join("\n");

  const html = `
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#142018;">
      <h1 style="font-size:28px;margin:0 0 8px;">ClickIt</h1>
      <p style="font-size:16px;line-height:1.5;">Thanks for stopping by <strong>${escapeHtml(settings.eventName)}</strong>.</p>
      <p style="font-size:16px;line-height:1.5;">Your ${count} photo${count === 1 ? "" : "s"} ${count === 1 ? "is" : "are"} ready to download.</p>
      <p style="margin:28px 0;">
        <a href="${downloadUrl}" style="background:${accent};color:#142018;text-decoration:none;padding:14px 22px;border-radius:999px;font-weight:700;display:inline-block;">
          Download your photos
        </a>
      </p>
      <p style="font-size:13px;color:#5a6b62;">Link: ${escapeHtml(downloadUrl)}</p>
    </div>
  `;

  const info = await transport.sendMail({
    from: config.emailFrom,
    to,
    subject,
    text,
    html,
  });

  return {
    messageId: info.messageId,
    preview: typeof info.message === "string" ? info.message : null,
    accepted: info.accepted || [to],
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
