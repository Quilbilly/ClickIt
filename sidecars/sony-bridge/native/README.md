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

## Camera setup (ILCE-7RM5 / a7R V)

1. MENU → Setup → USB → USB Connection Mode → **Remote Shooting**  
   (or Sel. When Connect, then pick Remote Shooting when plugging in)
2. MENU → Network → Cnct./Remote Sht. → Remote Shoot Function → **On**
3. MENU → Network → Cnct./Remote Sht. → Remote Shoot Setting → **Still Img. Save Dest.** →
   **Dest.+Camera** or **Destination Only** (not Camera Only)
4. Access Authentication = **Off** for first bring-up
5. Connect USB-C and choose **Remote Shooting** if prompted

### Windows USB driver (required)

After connecting, Device Manager normally shows the camera under **Portable Devices**.  
Sony’s CrSDK then requires **libusbK** so it appears under **libusbK USB Devices**:

1. Install **libusbK v3.0.7.0** (Sony’s verified version), or use [Zadig](https://zadig.akeo.ie/)
2. In Zadig: Options → List All Devices → select ILCE-7RM5 → install **libusbK**
3. Confirm Device Manager: **libusbK USB Devices → ILCE-7RM5**
4. Then connect via the bridge (`POST /connect`)

## Endpoints

Same as the Node stub: `/status`, `/connect`, `/disconnect`, `/live.jpg`, `/capture`.
