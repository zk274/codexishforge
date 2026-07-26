import assert from "node:assert/strict";
import test from "node:test";
import { selectionFromPoints, selectionToImage, validateCropRectangle } from "../src/shared/capture-region.mjs";

test("selectionFromPoints normalizes reverse drags and clamps to the image", () => {
  assert.deepEqual(
    selectionFromPoints({ x: 90, y: 80 }, { x: -10, y: 25 }, { width: 100, height: 90 }),
    { x: 0, y: 25, width: 90, height: 55 },
  );
});

test("selectionToImage preserves the selected area across display scaling", () => {
  assert.deepEqual(
    selectionToImage(
      { x: 100, y: 50, width: 200, height: 100 },
      { width: 500, height: 250 },
      { width: 2000, height: 1000 },
    ),
    { x: 400, y: 200, width: 800, height: 400 },
  );
});

test("selectionToImage rounds outward so fractional edge pixels are retained", () => {
  assert.deepEqual(
    selectionToImage(
      { x: 0.4, y: 0.4, width: 1.2, height: 1.2 },
      { width: 10, height: 10 },
      { width: 20, height: 20 },
    ),
    { x: 0, y: 0, width: 4, height: 4 },
  );
});

test("validateCropRectangle rejects malformed and out-of-bounds IPC input", () => {
  const size = { width: 1920, height: 1080 };
  assert.throws(() => validateCropRectangle({ x: -1, y: 0, width: 20, height: 20 }, size), /at least/);
  assert.throws(() => validateCropRectangle({ x: 0.5, y: 0, width: 20, height: 20 }, size), /integers/);
  assert.throws(() => validateCropRectangle({ x: 1900, y: 0, width: 30, height: 20 }, size), /beyond/);
  assert.throws(() => validateCropRectangle({ x: 0, y: 0, width: 3, height: 20 }, size, { minimum: 4 }), /at least 4/);
});

test("validateCropRectangle returns a clean crop for Electron", () => {
  assert.deepEqual(
    validateCropRectangle({ x: 12, y: 24, width: 320, height: 180 }, { width: 800, height: 600 }, { minimum: 4 }),
    { x: 12, y: 24, width: 320, height: 180 },
  );
});
