// Generate a minimal PNG icon for the extension.
// Tiny solid-color 128x128 PNG, encoded manually to avoid extra deps.
import { writeFileSync } from "node:fs";
import { deflateRawSync, crc32 } from "node:zlib";

const SIZE = 128;
// RGB pixels: gradient from deep purple to cyan
const data = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const off = (y * SIZE + x) * 4;
    const t = (x + y) / (2 * SIZE);
    data[off] = Math.round(80 + 80 * (1 - t)); // R
    data[off + 1] = Math.round(40 + 60 * t); // G
    data[off + 2] = Math.round(180 + 70 * t); // B
    data[off + 3] = 255;
  }
}

// Add a simple "C" letter shape via white pixels
function setPixel(x, y, r, g, b) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const off = (y * SIZE + x) * 4;
  data[off] = r;
  data[off + 1] = g;
  data[off + 2] = b;
  data[off + 3] = 255;
}
const cx = SIZE / 2;
const cy = SIZE / 2;
const outer = 42;
const inner = 26;
for (let a = -90; a <= 270; a += 1) {
  const rad = (a * Math.PI) / 180;
  const ox = Math.round(cx + Math.cos(rad) * outer);
  const oy = Math.round(cy + Math.sin(rad) * outer);
  const ix = Math.round(cx + Math.cos(rad) * inner);
  const iy = Math.round(cy + Math.sin(rad) * inner);
  for (let t = 0; t <= 1; t += 0.02) {
    const px = Math.round(ox + (ix - ox) * t);
    const py = Math.round(oy + (iy - oy) * t);
    setPixel(px, py, 255, 255, 255);
  }
}

function pngChunk(type, payload) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(payload.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBuf, payload]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput) >>> 0, 0);
  return Buffer.concat([len, typeBuf, payload, crc]);
}

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

// Add filter byte 0 at start of each scanline
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  data.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const idatPayload = deflateRawSync(raw);
const zlibHeader = Buffer.from([0x78, 0x9c]);
const adler = Buffer.alloc(4);
let a = 1, b = 0;
for (let i = 0; i < raw.length; i++) {
  a = (a + raw[i]) % 65521;
  b = (b + a) % 65521;
}
adler.writeUInt32BE((b << 16) | a, 0);
const idat = Buffer.concat([zlibHeader, idatPayload, adler]);

const png = Buffer.concat([
  signature,
  pngChunk("IHDR", ihdr),
  pngChunk("IDAT", idat),
  pngChunk("IEND", Buffer.alloc(0)),
]);

writeFileSync("assets/icon.png", png);
console.log(`Wrote assets/icon.png (${png.length} bytes)`);