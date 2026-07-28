# Run ClickIt on Windows with a Sony ILCE-7RM5

## 0) Use the tether-bridge branch

The real CrSDK bridge lives on this branch (not `main` yet):

```powershell
cd $env:USERPROFILE\Documents\ClickIt
git fetch origin
git checkout cursor/sony-ilce7rm5-tether-bridge-7d85
git pull
```

## 1) Put the Sony SDK in the right folder

ClickIt looks here:

```
vendor\sony-camera-remote-sdk\windows\
```

After extract you should be able to find a file named `CameraRemote_SDK.h` under that tree, and `Cr_Core.lib` / `Cr_Core.dll` nearby. Typical layout:

```
vendor\sony-camera-remote-sdk\windows\
  app\CRSDK\CameraRemote_SDK.h
  external\crsdk\Cr_Core.lib
  external\crsdk\Cr_Core.dll
  external\crsdk\CrAdapter\
```

If you dropped files directly in `vendor\`, move/extract the Windows SDK package into
`vendor\sony-camera-remote-sdk\windows\`.

Check:

```powershell
npm run sony-bridge:doctor
```

## 2) Install build tools (once)

- [Node.js 20+](https://nodejs.org/) (you already have this)
- [CMake](https://cmake.org/download/) — add to PATH
- [Visual Studio 2022 Build Tools](https://visualstudio.microsoft.com/downloads/) with workload **Desktop development with C++**

## 3) Install JS deps + build the camera bridge

```powershell
cd $env:USERPROFILE\Documents\ClickIt
npm install
npm run sony-bridge:build
```

You want this file to exist:

```
sidecars\sony-bridge\native\dist\clickit-sony-bridge.exe
```

## 4) Camera body settings (ILCE-7RM5 / a7R V)

1. MENU → Setup → USB → USB Connection Mode → **Remote Shooting**
2. MENU → Network → Cnct./Remote Sht. → Remote Shoot Function → **On**
3. MENU → Network → Cnct./Remote Sht. → **Remote Shoot Setting** → **Still Img. Save Dest.** →
   **Dest.+Camera** or **Destination Only**  
   (**Camera Only will shutter but never send the file to the PC** — booth capture times out)
4. Same Remote Shoot Setting page: **Save Image Size** → **2M** is fine for booth speed
5. Image Quality → File Format → **JPEG** (or RAW & JPEG with RAW+J Save Image = JPEG Only)
6. Plug in USB-C, power on, choose **Remote Shooting** if prompted
7. Quit Imaging Edge / other tether apps that might claim the camera

## 5) Run ClickIt + camera

**Terminal A — camera bridge**

```powershell
cd $env:USERPROFILE\Documents\ClickIt
npm run sony-bridge
```

You want a line like: `starting native CrSDK bridge` (not the Node stub warning).

**Terminal B — booth app**

```powershell
cd $env:USERPROFILE\Documents\ClickIt
copy .env.example .env
# edit .env: set CAMERA_PROVIDER=sony
notepad .env
npm run dev
```

Open http://localhost:8787/booth/

Or one shot:

```powershell
$env:CAMERA_PROVIDER="sony"
npm run dev:sony
```

## If something fails

| Symptom | Fix |
|---|---|
| `sony-bridge` says “using Node stub” | Bridge exe missing — run `npm run sony-bridge:build` |
| CMake / VS errors | Install CMake + VS 2022 C++ workload; reopen PowerShell |
| `EnumCameraObjects failed` / no cameras | PC Remote mode, cable, close Imaging Edge; `CrAdapter` must sit next to the `.exe` |
| Connect fails | Confirm ILCE-7RM5 USB mode is PC Remote, not Mass Storage |
| Booth says sidecar unreachable | Terminal A must stay running on port 8791 |
| `timed out waiting for download` | Still Img. Save Dest. is Camera Only — set Dest.+Camera / Destination Only, then reconnect |
| Shutter clicks, no review photos | Same as above; check Window A for `StillImageStoreDestination` log lines |

Check destination after connect:

```powershell
curl.exe -s http://127.0.0.1:8791/status
```

You want:
- `model` like `ILCE-7RM5` (not just `I`)
- `stillSaveDestLabel` like `Dest.+Camera (PC+card)` or `Destination Only (PC)`, not `Camera Only`

If `model` is `I` or status has no `stillSaveDestLabel`, your bridge exe is stale — rebuild:

```powershell
# stop Window A first
npm run sony-bridge:build
npm run sony-bridge
curl.exe -s -X POST http://127.0.0.1:8791/connect
curl.exe -s http://127.0.0.1:8791/status
```
