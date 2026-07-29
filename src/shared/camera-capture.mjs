export const MAX_CAMERA_FRAME_DATA_URL_LENGTH = 32 * 1024 * 1024;
export const MAX_CAMERA_FRAME_DIMENSION = 8192;
export const MAX_CAMERA_FRAME_PIXELS = 36_000_000;

export function cameraPermissionRequestAllowed({ trustedWindow, permission, mediaTypes }) {
  return Boolean(
    trustedWindow
    && permission === "media"
    && Array.isArray(mediaTypes)
    && mediaTypes.length > 0
    && mediaTypes.every((type) => type === "video" || type === "audio"),
  );
}

export function cameraPermissionCheckAllowed({ trustedWindow, permission, mediaType }) {
  return Boolean(trustedWindow && permission === "media" && (mediaType === "video" || mediaType === "audio"));
}

export function validateCameraFrameDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") throw new TypeError("Camera frame must be a PNG data URL");
  if (dataUrl.length > MAX_CAMERA_FRAME_DATA_URL_LENGTH) throw new RangeError("Camera frame is too large");
  if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) throw new TypeError("Camera frame must be a PNG data URL");
  return dataUrl;
}

export function validateCameraFrameSize(size) {
  const width = size?.width;
  const height = size?.height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new RangeError("Camera frame has invalid dimensions");
  if (width > MAX_CAMERA_FRAME_DIMENSION || height > MAX_CAMERA_FRAME_DIMENSION || width * height > MAX_CAMERA_FRAME_PIXELS) throw new RangeError("Camera frame dimensions are too large");
  return { width, height };
}
