function finiteNumber(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be a finite number`);
  return value;
}

function positiveSize(size, label) {
  const width = finiteNumber(size?.width, `${label} width`);
  const height = finiteNumber(size?.height, `${label} height`);
  if (width <= 0 || height <= 0) throw new RangeError(`${label} dimensions must be positive`);
  return { width, height };
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function selectionFromPoints(start, end, bounds) {
  const size = positiveSize(bounds, "Selection bounds");
  const startX = clamp(finiteNumber(start?.x, "Start x"), 0, size.width);
  const startY = clamp(finiteNumber(start?.y, "Start y"), 0, size.height);
  const endX = clamp(finiteNumber(end?.x, "End x"), 0, size.width);
  const endY = clamp(finiteNumber(end?.y, "End y"), 0, size.height);
  return {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
}

export function validateCropRectangle(rect, imageSize, { minimum = 1 } = {}) {
  const image = positiveSize(imageSize, "Image");
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height)) throw new TypeError("Image dimensions must be integers");
  if (!Number.isInteger(minimum) || minimum < 1) throw new RangeError("Minimum crop size must be a positive integer");

  const x = finiteNumber(rect?.x, "Crop x");
  const y = finiteNumber(rect?.y, "Crop y");
  const width = finiteNumber(rect?.width, "Crop width");
  const height = finiteNumber(rect?.height, "Crop height");
  if (![x, y, width, height].every(Number.isInteger)) throw new TypeError("Crop coordinates must be integers");
  if (x < 0 || y < 0 || width < minimum || height < minimum) throw new RangeError(`Crop must be at least ${minimum} × ${minimum} pixels`);
  if (x + width > image.width || y + height > image.height) throw new RangeError("Crop extends beyond the captured image");
  return { x, y, width, height };
}

export function selectionToImage(rect, displayedSize, imageSize) {
  const displayed = positiveSize(displayedSize, "Displayed image");
  const image = positiveSize(imageSize, "Image");
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height)) throw new TypeError("Image dimensions must be integers");

  const selection = {
    x: finiteNumber(rect?.x, "Selection x"),
    y: finiteNumber(rect?.y, "Selection y"),
    width: finiteNumber(rect?.width, "Selection width"),
    height: finiteNumber(rect?.height, "Selection height"),
  };
  if (selection.x < 0 || selection.y < 0 || selection.width <= 0 || selection.height <= 0) throw new RangeError("Select a non-empty region");
  if (selection.x + selection.width > displayed.width || selection.y + selection.height > displayed.height) throw new RangeError("Selection extends beyond the displayed image");

  const x = Math.floor(selection.x * image.width / displayed.width);
  const y = Math.floor(selection.y * image.height / displayed.height);
  const right = Math.ceil((selection.x + selection.width) * image.width / displayed.width);
  const bottom = Math.ceil((selection.y + selection.height) * image.height / displayed.height);
  return validateCropRectangle({ x, y, width: right - x, height: bottom - y }, image);
}
