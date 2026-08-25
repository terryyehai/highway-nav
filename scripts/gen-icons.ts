// 產生 PWA PNG 圖示（免外部工具）：深底 + 綠色高速公路徽章意象。
// 用法：npx tsx scripts/gen-icons.ts

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set([...type].map((c) => c.charCodeAt(0)), 4);
  out.set(data, 8);
  const crcBuf = out.subarray(4, 8 + data.length);
  dv.setUint32(8 + data.length, crc32(crcBuf));
  return out;
}

function makePng(size: number): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.38;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const d = Math.hypot(x - cx, y - cy);
      // 深色背景
      let r = 10, g = 10, b = 10;
      if (d < R) {
        // 綠色盾牌圓 + 中央白色公路雙線
        r = 16; g = 185; b = 129;
        const laneW = size * 0.045;
        const dx = Math.abs(x - cx);
        if ((dx > laneW * 0.6 && dx < laneW * 1.8) && Math.abs(y - cy) < R * 0.72) {
          r = 250; g = 250; b = 250;
        }
      } else if (d < R + size * 0.02) {
        r = 240; g = 240; b = 240; // 白邊
      }
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
    }
  }
  // 加 filter byte（每列前綴 0）
  const raw = new Uint8Array(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw.set(px.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, size);
  dv.setUint32(4, size);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

const pub = resolve(__dirname, '../public');
mkdirSync(pub, { recursive: true });
for (const size of [192, 512, 180]) {
  const name = size === 180 ? 'apple-touch-icon.png' : `pwa-${size}.png`;
  writeFileSync(resolve(pub, name), makePng(size));
  console.log(`public/${name}`);
}
