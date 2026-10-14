import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';

// Draw an original pixel star icon using only Node's standard library.
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type, bytes) {
  const tag = Buffer.from(type), size = Buffer.alloc(4), crc = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length); crc.writeUInt32BE(crc32(Buffer.concat([tag, bytes])));
  return Buffer.concat([size, tag, bytes, crc]);
}
function icon(size) {
  const stride = size * 4 + 1, pixels = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = Math.floor(x * 64 / size), py = Math.floor(y * 64 / size);
    const dx = Math.abs(px - 31.5), dy = Math.abs(py - 31.5);
    const rounded = Math.max(0, dx - 21.5) ** 2 + Math.max(0, dy - 21.5) ** 2 <= 100;
    const star = (dx + 3 * dy < 24 || 3 * dx + dy < 24) && dx + dy < 24;
    const rim = dx + dy > 28 && dx + dy < 30;
    const sparkle = (px === 12 && py > 11 && py < 16) || (py === 13 && px > 10 && px < 15) || (px === 51 && py > 47 && py < 52) || (py === 49 && px > 49 && px < 54);
    const color = star ? [219, 238, 175] : sparkle ? [166, 198, 139] : rim ? [69, 100, 72] : [12 + Math.floor((1-dy/32)*10), 29 + Math.floor((1-dy/32)*10), 25];
    const i = y * stride + 1 + x * 4;
    pixels[i] = color[0]; pixels[i+1] = color[1]; pixels[i+2] = color[2]; pixels[i+3] = rounded ? 255 : 0;
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8]=8; header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
const directory = new URL('./assets/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('icon.png', directory), icon(512));
const png = icon(256), ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4); ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
await writeFile(new URL('icon.ico', directory), Buffer.concat([ico, png]));
