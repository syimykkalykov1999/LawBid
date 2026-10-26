import { deflateSync } from 'node:zlib';

/**
 * Owner 2026-10-05 (demo mode): a PNG for demo people's avatars — a
 * coloured silhouette on a soft background — so the demo world needs no
 * real photos and no image library. Pure Node (zlib + CRC32).
 * Owner 2026-10-18: 512 px with smooth (4×4 supersampled) edges — the old
 * 128 px discs looked pixelated on a Retina screen.
 */
export const DEMO_AVATAR_SIZE = 512;
const SUPERSAMPLE = 4;

const PALETTE: [number, number, number][] = [
  [0x1f, 0x4e, 0x8c],
  [0x2a, 0x7a, 0x5b],
  [0x8c, 0x3f, 0x2a],
  [0x5b, 0x3f, 0x8c],
  [0x1f, 0x6f, 0x8c],
  [0x8c, 0x6a, 0x1f],
  [0x3f, 0x5b, 0x2a],
  [0x8c, 0x2a, 0x5e],
];

let crcTable: Uint32Array | null = null;
function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Deterministic per seed string (a user id): same person, same colours. */
export function renderDemoAvatarPng(seed: string): Buffer {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [r, g, b] = PALETTE[h % PALETTE.length];
  const size = DEMO_AVATAR_SIZE;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const cx = size / 2;
  const cy = size / 2 + size * (6 / 128);
  const headR = size * 0.21;
  const bodyR = size * 0.42;
  const bg: [number, number, number] = [
    Math.min(255, 215 + (r >> 3)),
    Math.min(255, 215 + (g >> 3)),
    Math.min(255, 215 + (b >> 3)),
  ];
  const inside = (x: number, y: number): boolean => {
    const dxh = x - cx;
    const dyh = y - (cy - size * 0.16);
    if (dxh * dxh + dyh * dyh <= headR * headR) return true;
    const dyb = y - size * 1.05;
    return dxh * dxh + dyb * dyb <= bodyR * bodyR;
  };
  const n = SUPERSAMPLE * SUPERSAMPLE;
  let o = 0;
  for (let y = 0; y < size; y += 1) {
    raw[o] = 0; // filter: none
    o += 1;
    for (let x = 0; x < size; x += 1) {
      // Coverage of the pixel by the silhouette → a smooth edge.
      let hits = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          if (
            inside(x + (sx + 0.5) / SUPERSAMPLE, y + (sy + 0.5) / SUPERSAMPLE)
          ) {
            hits += 1;
          }
        }
      }
      const a = hits / n;
      raw[o] = Math.round(r * a + bg[0] * (1 - a));
      raw[o + 1] = Math.round(g * a + bg[1] * (1 - a));
      raw[o + 2] = Math.round(b * a + bg[2] * (1 - a));
      o += 3;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
