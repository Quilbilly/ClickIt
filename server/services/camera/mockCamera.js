import sharp from "sharp";

/**
 * Development camera that synthesizes booth frames.
 * Swap for Sony Camera Remote SDK provider in production.
 */
export function createMockCamera() {
  let connected = true;
  let capturing = false;

  return {
    id: "mock",
    label: "Mock Camera (dev)",

    async getStatus() {
      return {
        provider: "mock",
        connected,
        capturing,
        model: "Mock ILCE-7RM5",
        batteryPercent: 100,
        message: connected ? "Ready" : "Disconnected",
      };
    },

    async connect() {
      connected = true;
      return this.getStatus();
    },

    async disconnect() {
      connected = false;
      return this.getStatus();
    },

    async getLiveFrame() {
      if (!connected) throw new Error("Camera not connected");
      const svg = liveSvg();
      return sharp(Buffer.from(svg)).jpeg({ quality: 70 }).toBuffer();
    },

    async capturePhoto({ sessionId, index, total }) {
      if (!connected) throw new Error("Camera not connected");
      capturing = true;
      try {
        // Simulate shutter lag of a real tethered body.
        await sleep(180);
        const svg = captureSvg({ sessionId, index, total });
        return sharp(Buffer.from(svg))
          .jpeg({ quality: 92 })
          .toBuffer();
      } finally {
        capturing = false;
      }
    },
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function liveSvg() {
  const t = new Date().toLocaleTimeString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="g" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="#2a3b40"/>
      <stop offset="100%" stop-color="#0d1417"/>
    </radialGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#g)"/>
  <circle cx="640" cy="300" r="120" fill="#1c2a2f" stroke="#F5A623" stroke-width="4"/>
  <text x="640" y="310" fill="#f4f1ea" font-family="Georgia, serif" font-size="42" text-anchor="middle">LIVE</text>
  <text x="640" y="520" fill="#c7d0cb" font-family="Arial, sans-serif" font-size="28" text-anchor="middle">ClickIt preview · ${t}</text>
  <text x="640" y="565" fill="#7f9188" font-family="Arial, sans-serif" font-size="20" text-anchor="middle">Mock feed — replace with Sony ILCE-7RM5 tether</text>
</svg>`;
}

function captureSvg({ sessionId, index, total }) {
  const hue = 160 + ((index || 0) * 35) % 120;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="2400" height="1600" viewBox="0 0 2400 1600" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue}, 28%, 18%)"/>
      <stop offset="100%" stop-color="hsl(${hue + 40}, 34%, 10%)"/>
    </linearGradient>
  </defs>
  <rect width="2400" height="1600" fill="url(#bg)"/>
  <rect x="80" y="80" width="2240" height="1440" fill="none" stroke="#F5A623" stroke-width="8" opacity="0.55"/>
  <text x="1200" y="700" fill="#f4f1ea" font-family="Georgia, serif" font-size="120" text-anchor="middle">ClickIt</text>
  <text x="1200" y="820" fill="#F5A623" font-family="Arial, sans-serif" font-size="56" text-anchor="middle">Photo ${index} / ${total}</text>
  <text x="1200" y="940" fill="#9aada4" font-family="Arial, sans-serif" font-size="36" text-anchor="middle">Session ${sessionId}</text>
  <text x="1200" y="1400" fill="#6f837a" font-family="Arial, sans-serif" font-size="28" text-anchor="middle">${new Date().toISOString()}</text>
</svg>`;
}
