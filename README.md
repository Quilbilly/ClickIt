# ClickIt

Tethered photo booth for a computer paired with a **Sony ILCE-7RM5**.

Guests tap **Take my picture**, ClickIt counts down, captures a set, stores photos (local and/or S3/R2), and delivers a download link by **email** and/or **QR code**.

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

- Booth: [http://localhost:8787/booth/](http://localhost:8787/booth/)
- Admin: [http://localhost:8787/admin](http://localhost:8787/admin) (token `dev-admin-token`)

## The four production pillars

### 1) Electron kiosk shell
```bash
npm run kiosk
```
Fullscreen booth app. See [KIOSK.md](./KIOSK.md) for auto-start.

### 2) Sony ILCE-7RM5 tether bridge
```bash
# Once on the Windows booth PC — extract SDK, then build the CrSDK binary
# vendor/sony-camera-remote-sdk/windows/  ← Windows x64 Camera Remote SDK
npm run sony-bridge:build

# Terminal A — native bridge on Windows (falls back to Node stub otherwise)
npm run sony-bridge

# Terminal B
CAMERA_PROVIDER=sony npm run dev
```
Protocol docs: [sidecars/sony-bridge/PROTOCOL.md](./sidecars/sony-bridge/PROTOCOL.md)  
Native build: [sidecars/sony-bridge/native/README.md](./sidecars/sony-bridge/native/README.md)

### 3) S3/R2 + real SMTP
Set in `.env`:
```bash
STORAGE_PROVIDER=s3
S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com   # or AWS
S3_BUCKET=clickit-photos
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_REGION=auto

EMAIL_TRANSPORT=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
EMAIL_FROM="ClickIt <noreply@yourdomain.com>"
```

### 4) Offline queue + QR download
- Captures always save locally first
- Cloud upload / email failures are queued in `data/queue/` and retried automatically
- Guests can skip email and scan a QR on the thank-you screen
- Admin can “Process queue now”

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | API + booth (nodemon) |
| `npm run sony-bridge` | Sony tether bridge (native CrSDK on Windows, else Node stub) |
| `npm run sony-bridge:build` | Build Windows CrSDK bridge (`clickit-sony-bridge.exe`) |
| `npm run sony-bridge:dev` | Force Node protocol stub |
| `npm run dev:sony` | Sidecar + server together |
| `npm run kiosk` | Electron fullscreen booth |

## Architecture

```
.
  booth/                 # Kiosk + admin UI
  electron/              # Fullscreen desktop shell
  public/download/       # Guest download pages
  sidecars/sony-bridge/  # Camera protocol + Windows CrSDK native bridge
  server/
    services/
      camera/            # mock + sony (sidecar client)
      storage.js         # local + S3/R2
      queue.js           # offline retry worker
      delivery.js        # upload + email + QR
      email.js
      qr.js
```

## Roadmap

See [ROADMAP.md](./ROADMAP.md).
