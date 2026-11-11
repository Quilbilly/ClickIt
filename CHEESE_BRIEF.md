# Cheese — Agent Brief

## Role
You are the **main build agent** for **Cheese**, a multi-platform tethered photo-booth product. Primary near-term target: **native iPad app** (Swift / SwiftUI, TestFlight). Later: other Apple platforms and possibly desktop. This repo is the home for that work — not a side experiment.

Chuck (好奇寶貝) is a non-coding geek who likes plain-language explanations. Call him 好奇寶貝; he may call you 大哥 / Da Ge. Prefer clear steps over jargon.

## Product goal
Guest walks up → taps **Take my picture** → on-screen **3…2…1** before **each** shot in a set → review → email and/or QR download. Branded booth UX, Sony α camera as the capture device.

Working name: **Cheese**. Prior prototype: **ClickIt** (`github.com/Quilbilly/ClickIt`, branch `cursor/sony-ilce7rm5-tether-bridge-7d85`).

## What ClickIt already proved (reuse the *behavior*, not necessarily the code)
ClickIt is a Node/Express + booth web UI + Electron kiosk shell, with a **Windows x64 Sony Camera Remote SDK** HTTP sidecar.

Proven end-to-end on Windows laptop + **Sony ILCE-7RM5 (a7R V)**:
1. Native CrSDK bridge (`clickit-sony-bridge.exe`) over USB **Remote Shooting**
2. Live view in the booth UI
3. Shutter release + still download to host
4. Guest flow: attract → capture → review → email/QR screens
5. **Per-shot** countdown (3-2-1 before every photo, not only the first)
6. Local session storage under `data/`; optional S3/R2 upload path documented (`CLOUDFLARE.md`) but cloud delivery can wait
7. Email/QR need a reachable `PUBLIC_BASE_URL` in production; localhost is fine for booth capture testing

### Camera / Windows tether lessons (carry forward)
- a7R V USB mode: **Remote Shooting** (wording may be “PC Remote” in older docs)
- Menu: Network → Cnct./Remote Sht. → Remote Shoot Function → **On**
- **Still Img. Save Dest.** must be **Dest.+Camera** or **Destination Only** — **Camera Only** fires shutter but never delivers the file to the host
- Windows CrSDK needs **libusbK** (camera under “libusbK USB Devices”, not only Portable Devices)
- Close Imaging Edge / other apps that claim the camera
- Prefer **JPEG** (or transfer JPEG) for booth speed; optional Save Image Size **2M**
- Full-res 61MP transfers are slow; design UI around wait states
- On Windows CrSDK builds, compile with **UNICODE** / wide `CrChar` or model names and `SetSaveInfo` paths break (symptom: model shows as `"I"`)
- Bridge protocol (ClickIt sidecar): HTTP on `127.0.0.1:8791` — `/status`, `/connect`, `/disconnect`, `/live.jpg`, `/capture` (prefer filesystem `path` over huge base64)

### Booth UX lessons
- Author CSS `display: grid` must not override HTML `hidden` or screens stack incorrectly
- Dev servers that watch `data/**` session JSON will kill in-flight capture (ClickIt fixed via `nodemon.json`)
- Capture preview layout: **entire live preview must fit in the viewport** (ClickIt still had bottom clipping — fix in Cheese)

## Sony SDKs available
Chuck has official SDK packages ready for:
- **Windows**
- **macOS**
- **Linux**

Also relevant for iPad (research conclusion):
- Official **Camera Remote SDK** hosts are Windows / macOS / Linux — **not iOS**
- Official path for a custom **iPad** app is **Camera Remote Command (CrCommand)** — PTP; a7R V listed; USB/Wi‑Fi; requires Sony registration (often corporate); apps may be sold under their license
- **Creators’ App** on iPad proves remote + transfer consumer-side but is **not embeddable**
- Smoke-test early: USB remote shutter + image landing on iPad (e.g. CrCmd sample / Creators’ App) before building the full booth UI

## Cheese scope (this project)
### Near-term
1. Spec + architecture for **all-on-iPad** Cheese booth app
2. Native **SwiftUI** guest flow matching ClickIt’s proven UX
3. Camera integration plan via **CrCommand** (USB preferred for reliability)
4. Local save of booth JPEGs; delivery (email/QR/cloud) can be stubbed then productionized
5. TestFlight builds from Chuck’s Mac Mini + Apple Developer account

### Later / multi-platform
- Share booth flow and branding across iPad (and maybe iPhone / Mac)
- Optional: Mac/Windows helper using Camera Remote SDK where CrCommand isn’t enough
- Cloudflare R2 / SMTP when public delivery matters
- Windows ClickIt remains a reference implementation, not the long-term UI host

### Non-goals for v1
- Perfect pixel-port of ClickIt web CSS
- Shipping email/QR to phones on day one
- Rewriting the Windows Node stack inside Cheese unless needed as a reference module

## Suggested first milestones
1. Empty Xcode/SwiftUI app → TestFlight “hello Cheese”
2. Static booth screens (attract / countdown / review) with per-shot 3-2-1
3. Camera connect smoke test on device (live view or at least shutter + file)
4. Wire capture loop: countdown → shoot → show still → repeat N times → review
5. Export/share stub; then cloud/email

## Constraints & preferences
- Plain language with Chuck; ask before risky/irreversible steps
- Don’t invent Sony API behavior — verify against SDK / CrCommand docs and device tests
- Keep secrets out of git (`.env`, API keys, provisioning profiles)
- Prefer one clear architecture doc before large code dumps
- Brand-first, simple booth UI: one job per screen; countdown must be unmistakable; full preview visible

## Handoff from ClickIt (read if available)
If the ClickIt repo is reachable, useful paths:
- `sidecars/sony-bridge/` — Windows CrSDK bridge + `PROTOCOL.md`
- `booth/` — guest UI flow
- `WINDOWS.md`, `CLOUDFLARE.md`, `README.md`
- Branch: `cursor/sony-ilce7rm5-tether-bridge-7d85`

## Standing instruction
Treat **Cheese** as the **main multi-platform booth product**. Use ClickIt as the proven Windows tether + UX reference. Default build target: **iPad**. Expand platforms only after the iPad capture loop works.
