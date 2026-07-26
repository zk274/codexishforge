import { deflateSync } from "node:zlib";

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type, "ascii");
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  name.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return result;
}

function drawLine(pixels, size, fromX, fromY, toX, toY, color, thickness = 2) {
  const steps = Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY));
  for (let step = 0; step <= steps; step++) {
    const x = Math.round(fromX + (toX - fromX) * step / steps);
    const y = Math.round(fromY + (toY - fromY) * step / steps);
    for (let offsetY = -Math.floor(thickness / 2); offsetY <= Math.floor(thickness / 2); offsetY++) {
      for (let offsetX = -Math.floor(thickness / 2); offsetX <= Math.floor(thickness / 2); offsetX++) {
        const targetX = x + offsetX, targetY = y + offsetY;
        if (targetX < 0 || targetY < 0 || targetX >= size || targetY >= size) continue;
        const index = (targetY * size + targetX) * 4;
        pixels.set(color, index);
      }
    }
  }
}

export function createTrayIconPng(size = 20) {
  if (!Number.isInteger(size) || size < 16 || size > 64) throw new Error("Tray icon size must be between 16 and 64 pixels");
  const pixels = Buffer.alloc(size * size * 4);
  const accent = Buffer.from([156, 240, 196, 255]);
  const foreground = Buffer.from([242, 243, 236, 255]);
  const inset = Math.round(size * 0.22), center = Math.floor(size / 2), lower = size - inset - 1;
  drawLine(pixels, size, inset + 2, inset, inset - 1, center, accent);
  drawLine(pixels, size, inset - 1, center, inset + 2, lower, accent);
  drawLine(pixels, size, lower - 2, inset, lower + 1, center, accent);
  drawLine(pixels, size, lower + 1, center, lower - 2, lower, accent);
  drawLine(pixels, size, center + 2, inset - 1, center - 2, lower + 1, foreground);

  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) pixels.copy(scanlines, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND"),
  ]);
}
