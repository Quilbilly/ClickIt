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

- `server.js` in this folder: development bridge that mimics the protocol with generated frames
- Replace it with a C++/C#/Python binary linked to Sony Camera Remote SDK for production ILCE-7RM5 tether
