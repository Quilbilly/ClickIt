# ClickIt kiosk (Electron)

## Run

```bash
cp .env.example .env
npm install
npm run kiosk
```

This starts the ClickIt API inside Electron and opens the booth UI fullscreen. A tray icon shows health (green = camera ready, amber = server up / camera offline, red = server down).

### Staff shortcuts
- `Ctrl/Cmd + Shift + Q` — quit kiosk
- `Ctrl/Cmd + Shift + A` — open admin
- `Ctrl/Cmd + Shift + B` — return to booth

### Tray menu
- Open booth / Open admin
- Check health now
- Quit ClickIt

## Windows auto-start
1. Win + R → `shell:startup`
2. Create a shortcut to:
   `C:\path\to\ClickIt\node_modules\electron\dist\electron.exe C:\path\to\ClickIt`
   or a small `.bat`:
   ```bat
   cd /d C:\path\to\ClickIt
   npm run kiosk
   ```

## macOS auto-start
- System Settings → General → Login Items → add a script/app that runs `npm run kiosk` from the ClickIt folder
- Or use `launchd` with a LaunchAgent calling Electron

## Tips
- Set `PUBLIC_BASE_URL` to a LAN/public URL guests can reach for QR downloads
- For Sony: run `npm run sony-bridge` (dev) or your SDK binary, then `CAMERA_PROVIDER=sony`
- After S3/R2 upload, use Admin → **Prune local** to free disk; guests still get signed cloud download URLs
