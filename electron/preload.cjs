const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("clickitDesktop", {
  isElectron: true,
  platform: process.platform,
});
