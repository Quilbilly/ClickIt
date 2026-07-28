# Cloudflare + ClickIt (R2 photo storage)

ClickIt can upload booth photos to **Cloudflare R2** (S3-compatible). Guests still open a ClickIt download page (`/d/...`); that page serves local files first and falls back to R2.

## What R2 does vs what it doesn’t

| Piece | Role |
|---|---|
| **R2 bucket** | Durable photo storage after each capture |
| **`PUBLIC_BASE_URL`** | URL inside email/QR (must be reachable by guest phones) |
| **SMTP** | Actual email sending (optional; leave `json` for now) |

R2 alone does **not** make `localhost` QR codes work on a phone. For that, use a public URL or a quick Cloudflare tunnel (below).

## 1) Create the R2 bucket

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com/) → **R2 Object Storage**
2. Enable R2 if prompted (free tier is enough to try)
3. **Create bucket**, e.g. `clickit-photos`
4. Optional later: bucket **Settings** → **Custom Domains** (e.g. `photos.yourdomain.com`) or **r2.dev** public URL

## 2) Create API token (S3 credentials)

1. R2 → **Overview** → **Account details** → **Manage R2 API Tokens**
2. **Create API token**
3. Permissions: **Object Read & Write**
4. Scope: this bucket (or all buckets while testing)
5. Copy:
   - **Access Key ID**
   - **Secret Access Key** (shown once)
   - **S3 endpoint**: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

Your Account ID is also in the dashboard URL / Workers overview.

## 3) Put values in `.env`

```env
STORAGE_PROVIDER=s3
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=clickit-photos
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=true

# Optional: public CDN/custom domain for direct file links
# (download page still works via signed URLs if this is blank)
# S3_PUBLIC_BASE_URL=https://photos.yourdomain.com
```

Keep camera settings as they are (`CAMERA_PROVIDER=sony`, etc.).

## 4) Verify from the laptop

```powershell
cd C:\Users\chuck\Documents\ClickIt
git pull
npm run storage:doctor
```

You want `PASS — R2 credentials work`.

Then restart **Window B** so the booth server picks up `.env`:

```powershell
# Ctrl+C Window B, then:
npm run dev
```

Take a test session. In admin (`http://localhost:8787/admin`) or session JSON under `data/sessions/`, you should see cloud upload info after capture. Failures are queued in `data/queue/` and retried.

## 5) Optional: phone-reachable QR while still on the laptop

Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/), then:

```powershell
cloudflared tunnel --url http://localhost:8787
```

Copy the `https://….trycloudflare.com` URL into `.env`:

```env
PUBLIC_BASE_URL=https://YOUR-SUBDOMAIN.trycloudflare.com
```

Restart Window B, run a new booth session, scan the QR on your phone.

For a real event, replace the quick tunnel with a stable hostname (Cloudflare Tunnel named tunnel, or host ClickIt behind your domain).

## 6) Email later

Leave this for production:

```env
EMAIL_TRANSPORT=json
```

When ready:

```env
EMAIL_TRANSPORT=smtp
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
EMAIL_FROM="ClickIt <noreply@yourdomain.com>"
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `storage:doctor` ListBuckets failed | Wrong Access Key / Secret / endpoint Account ID |
| Bucket name warning | Token scoped to another bucket, or typo in `S3_BUCKET` |
| Captures work, admin shows upload error | Check Window B logs; run `storage:doctor`; use **Process queue now** in admin |
| QR still opens localhost on phone | `PUBLIC_BASE_URL` not public — use tunnel or LAN IP |
| Huge uploads slow on venue Wi‑Fi | Normal for 61MP; consider Save Image Size **2M** on the a7R V for booth speed |
