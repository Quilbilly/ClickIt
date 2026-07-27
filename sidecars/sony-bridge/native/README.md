# ClickIt Sony CrSDK bridge (Windows x64)

Native HTTP sidecar that links against the **Sony Camera Remote SDK** and speaks the protocol in [`../PROTOCOL.md`](../PROTOCOL.md).

Target body: **ILCE-7RM5** over USB **PC Remote**.

## Prerequisites

1. Extract the official Windows x64 Camera Remote SDK into:

   ```
   vendor/sony-camera-remote-sdk/windows/
   ```

   Typical layout after extract:

   ```
   windows/
     app/CRSDK/CameraRemote_SDK.h
     external/crsdk/Cr_Core.lib
     external/crsdk/Cr_Core.dll
     external/crsdk/CrAdapter/
   ```

   Or set `SONY_SDK_ROOT` to the SDK root.

2. Install **CMake** and **Visual Studio 2022** (Desktop development with C++).

## Build

From the repo root on Windows:

```powershell
npm run sony-bridge:build
# or
powershell -File sidecars/sony-bridge/native/scripts/build.ps1
```

Output:

```
sidecars/sony-bridge/native/dist/clickit-sony-bridge.exe
```

The build copies `Cr_Core.dll` and `CrAdapter/` next to the exe (required by CrSDK).

## Run

```powershell
npm run sony-bridge
# Terminal B
$env:CAMERA_PROVIDER="sony"; npm run dev
```

`npm run sony-bridge` prefers the native exe on Windows and falls back to the Node dev stub otherwise.

## Camera setup (ILCE-7RM5)

1. USB Connection Mode → **PC Remote**
2. PC Remote Settings → Still Img. Save Dest. → **PC+Camera** (or PC only)
3. Connect USB-C cable, power on, close Imaging Edge / other tether apps

## Endpoints

Same as the Node stub: `/status`, `/connect`, `/disconnect`, `/live.jpg`, `/capture`.
