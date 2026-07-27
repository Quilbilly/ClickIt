import { config } from "../../config.js";
import { createMockCamera } from "./mockCamera.js";
import { createSonyCamera } from "./sonyCamera.js";

let camera = null;

export function getCamera() {
  if (camera) return camera;

  if (config.cameraProvider === "sony") {
    camera = createSonyCamera();
  } else {
    camera = createMockCamera();
  }

  return camera;
}

export async function getCameraStatus() {
  return getCamera().getStatus();
}
