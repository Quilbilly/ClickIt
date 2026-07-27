#!/usr/bin/env node
/**
 * Development Sony bridge sidecar.
 * Implements the ClickIt camera protocol with generated frames so the
 * CAMERA_PROVIDER=sony path can be tested before the real SDK binary exists.
 */
import http from "node:http";
import { URL } from "node:url";
import sharp from "sharp";

const port = Number(process.env.SONY_BRIDGE_PORT || 8791);
let connected = false;
let capturing = false;

async function liveJpeg() {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
  <rect width="1280" height="720" fill="#101820"/>
  <text x="640" y="340" fill="#F5A623" font-family="Arial" font-size="64" text-anchor="middle">ILCE-7RM5</text>
  <text x="640" y="420" fill="#d9e2dc" font-family="Arial" font-size="32" text-anchor="middle">Sony bridge sidecar (dev)</text>
  <text x="640" y="480" fill="#7f9188" font-family="Arial" font-size="22" text-anchor="middle">${new Date().toLocaleTimeString()}</text>
</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 75 }).toBuffer();
}

async function captureJpeg({ index, total, sessionId }) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="2400" height="1600" xmlns="http://www.w3.org/2000/svg">
  <rect width="2400" height="1600" fill="#18252b"/>
  <text x="1200" y="720" fill="#f3f0e8" font-family="Georgia" font-size="110" text-anchor="middle">Sony Capture</text>
  <text x="1200" y="860" fill="#F5A623" font-family="Arial" font-size="54" text-anchor="middle">Photo ${index}/${total}</text>
  <text x="1200" y="980" fill="#9aada4" font-family="Arial" font-size="34" text-anchor="middle">${sessionId || ""}</text>
</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  try {
    if (req.method === "GET" && url.pathname === "/status") {
      return sendJson(res, 200, {
        connected,
        capturing,
        model: "ILCE-7RM5",
        batteryPercent: connected ? 87 : null,
        message: connected ? "Ready" : "Disconnected",
        bridge: "sony-dev-sidecar",
      });
    }

    if (req.method === "POST" && url.pathname === "/connect") {
      connected = true;
      return sendJson(res, 200, {
        connected: true,
        model: "ILCE-7RM5",
        message: "Ready",
      });
    }

    if (req.method === "POST" && url.pathname === "/disconnect") {
      connected = false;
      return sendJson(res, 200, { connected: false, message: "Disconnected" });
    }

    if (req.method === "GET" && url.pathname === "/live.jpg") {
      if (!connected) return sendJson(res, 503, { error: "Not connected", code: "NOT_CONNECTED" });
      const jpeg = await liveJpeg();
      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store",
        "Content-Length": jpeg.length,
      });
      return res.end(jpeg);
    }

    if (req.method === "POST" && url.pathname === "/capture") {
      if (!connected) return sendJson(res, 503, { error: "Not connected", code: "NOT_CONNECTED" });
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
      capturing = true;
      await new Promise((r) => setTimeout(r, 160));
      const jpeg = await captureJpeg(body);
      capturing = false;
      return sendJson(res, 200, { jpegBase64: jpeg.toString("base64") });
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    capturing = false;
    return sendJson(res, 500, { error: err.message });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Sony bridge sidecar on http://127.0.0.1:${port}`);
});
