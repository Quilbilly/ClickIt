const {
  app,
  BrowserWindow,
  globalShortcut,
  shell,
  Tray,
  Menu,
  nativeImage,
} = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const http = require("node:http");

try {
  if (require("electron-squirrel-startup")) app.quit();
} catch {
  // optional
}

let mainWindow = null;
let server = null;
let tray = null;
let healthTimer = null;
let lastHealthy = null;

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const HEALTH_POLL_MS = Number(process.env.HEALTH_POLL_MS || 5000);

function healthCheck() {
  return new Promise((resolve) => {
    const req = http.get(`http://${HOST}:${PORT}/api/health`, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode !== 200) {
          resolve({ ok: false, detail: `HTTP ${res.statusCode}` });
          return;
        }
        try {
          const data = JSON.parse(body);
          const cameraOk = Boolean(data.camera?.connected);
          resolve({
            ok: Boolean(data.ok),
            cameraOk,
            detail: cameraOk
              ? `${data.camera?.model || "Camera"} ready`
              : data.camera?.message || "Camera offline",
            queuePending: data.queue?.pending || 0,
          });
        } catch {
          resolve({ ok: true, cameraOk: false, detail: "Health OK" });
        }
      });
    });
    req.on("error", () => resolve({ ok: false, detail: "Server unreachable" }));
    req.setTimeout(800, () => {
      req.destroy();
      resolve({ ok: false, detail: "Health timeout" });
    });
  });
}

function trayIcon(kind) {
  const file = path.join(__dirname, "icons", `tray-${kind}.png`);
  const img = nativeImage.createFromPath(file);
  if (!img.isEmpty()) return img;
  return nativeImage.createFromPath(path.join(__dirname, "icons", "tray-warn.png"));
}

function openBooth() {
  if (!mainWindow) createWindow();
  mainWindow.loadURL(`http://${HOST}:${PORT}/booth/`);
  mainWindow.show();
  mainWindow.focus();
}

function openAdmin() {
  if (!mainWindow) createWindow();
  mainWindow.loadURL(`http://${HOST}:${PORT}/admin`);
  mainWindow.show();
  mainWindow.focus();
}

function updateTray(status) {
  if (!tray) return;
  const kind = !status.ok ? "bad" : status.cameraOk ? "ok" : "warn";
  tray.setImage(trayIcon(kind));
  const queueBit = status.queuePending ? ` · queue ${status.queuePending}` : "";
  tray.setToolTip(`ClickIt · ${status.detail || (status.ok ? "OK" : "Down")}${queueBit}`);

  const template = [
    { label: "ClickIt booth", enabled: false },
    { type: "separator" },
    {
      label: status.ok ? `Status: ${status.detail}` : `Status: ${status.detail}`,
      enabled: false,
    },
    { type: "separator" },
    { label: "Open booth", click: () => openBooth() },
    { label: "Open admin", click: () => openAdmin() },
    {
      label: "Check health now",
      click: async () => {
        const next = await healthCheck();
        lastHealthy = next.ok;
        updateTray(next);
      },
    },
    { type: "separator" },
    {
      label: "Quit ClickIt",
      click: () => app.quit(),
    },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

function createTray() {
  tray = new Tray(trayIcon("warn"));
  tray.setToolTip("ClickIt · starting…");
  tray.on("double-click", () => openBooth());
  updateTray({ ok: false, cameraOk: false, detail: "Starting…" });
}

async function pollHealth() {
  const status = await healthCheck();
  if (lastHealthy !== null && lastHealthy !== status.ok && mainWindow) {
    // Soft notify via title when health flips.
    mainWindow.setTitle(status.ok ? "ClickIt" : "ClickIt — server issue");
  }
  lastHealthy = status.ok;
  updateTray(status);
}

async function startBackend() {
  const alreadyUp = await healthCheck();
  if (alreadyUp.ok) {
    console.log(`Using existing ClickIt server on http://${HOST}:${PORT}`);
    return;
  }

  const mod = await import(pathToFileURL(path.join(ROOT, "server", "createApp.js")).href);
  const expressApp = await mod.createApp();
  server = await mod.listen(expressApp, { port: PORT, host: HOST });
}

function createWindow() {
  const fullscreen = String(process.env.KIOSK_FULLSCREEN || "true").toLowerCase() !== "false";
  const frame = String(process.env.KIOSK_FRAME || "false").toLowerCase() === "true";

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    fullscreen,
    frame,
    autoHideMenuBar: true,
    backgroundColor: "#0b1214",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://${HOST}:${PORT}/booth/`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  globalShortcut.register("Alt+F4", () => {});
  globalShortcut.register("CommandOrControl+W", () => {});
  globalShortcut.register("CommandOrControl+Shift+Q", () => app.quit());
  globalShortcut.register("CommandOrControl+Shift+A", () => openAdmin());
  globalShortcut.register("CommandOrControl+Shift+B", () => openBooth());

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  process.chdir(ROOT);
  createTray();
  await startBackend();
  createWindow();
  await pollHealth();
  healthTimer = setInterval(pollHealth, HEALTH_POLL_MS);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (healthTimer) clearInterval(healthTimer);
  if (server) server.close();
  globalShortcut.unregisterAll();
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
