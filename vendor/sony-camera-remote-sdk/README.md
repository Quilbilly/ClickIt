# Sony Camera Remote SDK (local only)

Drop the official Sony Camera Remote SDK packages here.

**Do not commit these files.** They are large, platform-specific, and covered by Sony’s license. This folder is gitignored except for this README.

## Put the zips / extracted SDKs here

```
vendor/sony-camera-remote-sdk/
  README.md                 ← this file (tracked)
  windows/                  ← Windows SDK extract (required for the real tether bridge)
  macos/                    ← macOS SDK extract (not wired yet)
  linux/                    ← Linux SDK extract (not wired yet)
  archives/                 ← optional: original .zip downloads
```

### Suggested layout after you extract each package

Use whatever folder names Sony’s archive uses internally, but keep the platform roots above. Example (Windows):

```
windows/
  app/CRSDK/                # CameraRemote_SDK.h + headers
  external/crsdk/           # Cr_Core.lib / Cr_Core.dll / CrAdapter/
```

If Sony gave you three zip files, either:

1. Extract each into `windows/`, `macos/`, `linux/`, **or**
2. Put the untouched zips in `archives/` and extract beside them.

## Wire the Windows ILCE-7RM5 bridge

ClickIt’s Node app does **not** load the SDK directly. On Windows, build the native sidecar:

```powershell
npm run sony-bridge:build
npm run sony-bridge          # starts clickit-sony-bridge.exe
CAMERA_PROVIDER=sony npm run dev
```

Details: [`sidecars/sony-bridge/native/README.md`](../../sidecars/sony-bridge/native/README.md)

Protocol: [`sidecars/sony-bridge/PROTOCOL.md`](../../sidecars/sony-bridge/PROTOCOL.md)

Until the native binary is built (or on non-Windows), `npm run sony-bridge` uses the Node protocol stub.

## Path env (optional)

```bash
SONY_SDK_ROOT=/absolute/path/to/vendor/sony-camera-remote-sdk/windows
```

Used by the native sidecar CMake build (`FindSonyCrSDK.cmake`).
