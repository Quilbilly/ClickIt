# ClickIt kiosk (Electron)

## Run

```bash
cd clickit
cp .env.example .env
npm install
npm run kiosk
```

This starts the ClickIt API inside Electron and opens the booth UI fullscreen.

### Staff shortcuts
- `Ctrl/Cmd + Shift + Q` — quit kiosk
- `Ctrl/Cmd + Shift + A` — open admin
- `Ctrl/Cmd + Shift + B` — return to booth

## Windows auto-start
1. Win + R → `shell:startup`
2. Create a shortcut to:
   `C:\path\to\clickit\node_modules\electron\dist\electron.exe C:\path\to\clickit`
   or a small `.bat`:
   ```bat
   cd /d C:\path\to\clickit
   npm run kiosk
   ```

## macOS auto-start
- System Settings → General → Login Items → add a script/app that runs `npm run kiosk` from the ClickIt folder
- Or use `launchd` with a LaunchAgent calling Electron

## Tips
- Set `PUBLIC_BASE_URL` to a LAN/public URL guests can reach for QR downloads
- For Sony: run `npm run sony-bridge` (dev) or your SDK binary, then `CAMERA_PROVIDER=sony`
