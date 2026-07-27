import { config } from "../../config.js";

/**
 * Talks to a local Sony Camera Remote SDK sidecar over HTTP JSON.
 * See sidecars/sony-bridge/PROTOCOL.md
 */
export function createSonyCamera() {
  const base = config.sonySidecarUrl;

  async function rpc(pathname, { method = "GET", body } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`${base}${pathname}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || `Sony sidecar error (${res.status})`);
        err.code = data.code || "SONY_SIDECAR_ERROR";
        throw err;
      }
      return data;
    } catch (err) {
      if (err.name === "AbortError") {
        const timeout = new Error("Sony sidecar timed out");
        timeout.code = "SONY_SIDECAR_TIMEOUT";
        throw timeout;
      }
      if (err.code) throw err;
      const wrapped = new Error(
        `Sony sidecar unreachable at ${base}. Start sidecars/sony-bridge or your SDK binary.`
      );
      wrapped.code = "SONY_SIDECAR_UNREACHABLE";
      wrapped.cause = err;
      throw wrapped;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    id: "sony",
    label: "Sony ILCE-7RM5",

    async getStatus() {
      try {
        const status = await rpc("/status");
        return {
          provider: "sony",
          connected: Boolean(status.connected),
          capturing: Boolean(status.capturing),
          model: status.model || "ILCE-7RM5",
          batteryPercent: status.batteryPercent ?? null,
          message: status.message || (status.connected ? "Ready" : "Not connected"),
          sidecar: base,
        };
      } catch (err) {
        return {
          provider: "sony",
          connected: false,
          capturing: false,
          model: "ILCE-7RM5",
          batteryPercent: null,
          message: err.message,
          sidecar: base,
          code: err.code,
        };
      }
    },

    async connect() {
      return rpc("/connect", { method: "POST", body: {} });
    },

    async disconnect() {
      return rpc("/disconnect", { method: "POST", body: {} });
    },

    async getLiveFrame() {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch(`${base}/live.jpg`, { signal: controller.signal });
        if (!res.ok) {
          const err = new Error(`Sony live view failed (${res.status})`);
          err.code = "SONY_LIVE_FAILED";
          throw err;
        }
        const ab = await res.arrayBuffer();
        return Buffer.from(ab);
      } finally {
        clearTimeout(timer);
      }
    },

    async capturePhoto({ sessionId, index, total }) {
      const data = await rpc("/capture", {
        method: "POST",
        body: { sessionId, index, total },
      });

      if (data.jpegBase64) {
        return Buffer.from(data.jpegBase64, "base64");
      }
      if (data.path) {
        const fs = await import("node:fs/promises");
        return fs.readFile(data.path);
      }

      const err = new Error("Sony sidecar capture returned no image");
      err.code = "SONY_CAPTURE_EMPTY";
      throw err;
    },
  };
}
