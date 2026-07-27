# Sony sidecar protocol

ClickIt talks to a local process that owns the Sony Camera Remote SDK.

Default base URL: `http://127.0.0.1:8791` (`SONY_SIDECAR_URL`)

## Endpoints

### `GET /status`
```json
{
  "connected": true,
  "capturing": false,
  "model": "ILCE-7RM5",
  "batteryPercent": 84,
  "message": "Ready"
}
```

### `POST /connect`
Claim the USB camera and start live view.

### `POST /disconnect`
Release the camera.

### `GET /live.jpg`
Returns `image/jpeg` live-view frame.

### `POST /capture`
Body:
```json
{ "sessionId": "abc", "index": 1, "total": 3 }
```

Response (one of):
```json
{ "jpegBase64": "<base64 jpeg bytes>" }
```
or
```json
{ "path": "C:/absolute/path/to/capture.jpg" }
```

## Reference implementations

- **Windows x64 (production):** `native/` — C++ binary linked to Sony Camera Remote SDK (`clickit-sony-bridge.exe`). Build with `npm run sony-bridge:build` after dropping the SDK into `vendor/sony-camera-remote-sdk/windows`. See [`native/README.md`](./native/README.md).
- **Dev stub:** `server.js` — generated frames so the booth can be tested without a camera.
- **Launcher:** `launch.js` (via `npm run sony-bridge`) prefers the native exe on Windows, otherwise starts the Node stub.
