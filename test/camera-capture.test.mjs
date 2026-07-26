import assert from "node:assert/strict";
import test from "node:test";
import {
  cameraPermissionCheckAllowed,
  cameraPermissionRequestAllowed,
  validateCameraFrameDataUrl,
  validateCameraFrameSize,
} from "../src/shared/camera-capture.mjs";

test("camera permission request allows video only from the trusted main window", () => {
  assert.equal(cameraPermissionRequestAllowed({ trustedWindow: true, permission: "media", mediaTypes: ["video"] }), true);
  assert.equal(cameraPermissionRequestAllowed({ trustedWindow: true, permission: "media", mediaTypes: ["video", "audio"] }), false);
  assert.equal(cameraPermissionRequestAllowed({ trustedWindow: false, permission: "media", mediaTypes: ["video"] }), false);
  assert.equal(cameraPermissionRequestAllowed({ trustedWindow: true, permission: "notifications", mediaTypes: ["video"] }), false);
});

test("camera permission checks allow only trusted video checks", () => {
  assert.equal(cameraPermissionCheckAllowed({ trustedWindow: true, permission: "media", mediaType: "video" }), true);
  assert.equal(cameraPermissionCheckAllowed({ trustedWindow: true, permission: "media", mediaType: "audio" }), false);
  assert.equal(cameraPermissionCheckAllowed({ trustedWindow: false, permission: "media", mediaType: "video" }), false);
});

test("camera frame validation accepts PNG data and rejects other or oversized input", () => {
  assert.equal(validateCameraFrameDataUrl("data:image/png;base64,iVBORw0KGgo="), "data:image/png;base64,iVBORw0KGgo=");
  assert.throws(() => validateCameraFrameDataUrl("data:image/jpeg;base64,abcd"), /PNG/);
  assert.throws(() => validateCameraFrameDataUrl({}), /PNG/);
});

test("camera frame dimensions are bounded", () => {
  assert.deepEqual(validateCameraFrameSize({ width: 1920, height: 1080 }), { width: 1920, height: 1080 });
  assert.throws(() => validateCameraFrameSize({ width: 0, height: 1080 }), /invalid/);
  assert.throws(() => validateCameraFrameSize({ width: 8192, height: 8192 }), /too large/);
});
