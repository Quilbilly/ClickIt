const { app, BrowserWindow, globalShortcut, shell } = require("electron");
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

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";

function healthCheck() {
  return new Promise((resolve) => {
    const req = http.get(`http://${HOST}:${PORT}/api/health`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function startBackend() {
  const alreadyUp = await healthCheck();
  if (alreadyUp) {
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
  globalShortcut.register("CommandOrControl+Shift+A", () => {
    mainWindow.loadURL(`http://${HOST}:${PORT}/admin`);
  });
  globalShortcut.register("CommandOrControl+Shift+B", () => {
    mainWindow.loadURL(`http://${HOST}:${PORT}/booth/`);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  process.chdir(ROOT);
  await startBackend();
  createWindow();
});

app.on("window-all-closed", () => {
  if (server) server.close();
  globalShortcut.unregisterAll();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
