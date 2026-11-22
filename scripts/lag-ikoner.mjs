// Generates the PWA icons (public/pwa-192.png, public/pwa-512.png) without extra tools:
// red background with white rings around a centre point (IPP with search rings).
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function ikon(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const c = size / 2;
  const ringer = [0.37, 0.235];
  const bredde = size * 0.055;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      let hvit = d < size * 0.095;
      for (const r of ringer) if (Math.abs(d - r * size) < bredde / 2) hvit = true;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = hvit ? 255 : 0xc8;
      raw[o + 1] = hvit ? 255 : 0x10;
      raw[o + 2] = hvit ? 255 : 0x2e;
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const s of [192, 512]) writeFileSync(new URL(`../public/pwa-${s}.png`, import.meta.url), ikon(s));
console.log('Ikoner skrevet.');
