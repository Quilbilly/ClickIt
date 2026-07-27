# Sony Camera Remote SDK (local only)

Drop the official Sony Camera Remote SDK packages here.

**Do not commit these files.** They are large, platform-specific, and covered by Sony’s license. This folder is gitignored except for this README.

## Put the zips / extracted SDKs here

```
vendor/sony-camera-remote-sdk/
  README.md                 ← this file (tracked)
  windows/                  ← Windows SDK extract
  macos/                    ← macOS SDK extract
  linux/                    ← Linux SDK extract
  archives/                 ← optional: original .zip downloads
```

### Suggested layout after you extract each package

Use whatever folder names Sony’s archive uses internally, but keep the platform roots above. Example:

```
windows/
  Camera Remote SDK/        # or whatever Sony named the root
    include/
    lib/
    ...
macos/
  ...
linux/
  ...
```

If Sony gave you three zip files, either:

1. Extract each into `windows/`, `macos/`, `linux/`, **or**
2. Put the untouched zips in `archives/` and extract beside them.

## What ClickIt expects next

ClickIt’s Node app does **not** load the SDK directly. A small native sidecar (C++/C#/Python) will link against these SDK libs and speak the HTTP protocol in:

`sidecars/sony-bridge/PROTOCOL.md`

Until that native bridge is built, keep using:

```bash
npm run sony-bridge          # protocol stand-in
CAMERA_PROVIDER=sony npm run dev
```

## Path env (optional)

If you install the SDK somewhere else on the machine, you can point at it later with something like:

```bash
SONY_SDK_ROOT=/absolute/path/to/vendor/sony-camera-remote-sdk/linux
```

(Used by the future native sidecar build, not by the Node booth server today.)
