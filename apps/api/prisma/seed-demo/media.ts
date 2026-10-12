/**
 * Demo seed media: tiny generated files, so the seed needs no downloads, no
 * licences and no image library. Pure Node (zlib).
 *  - scenePng: a soft gradient with a few translucent circles (a "photo").
 *  - samplePdf: a one-page PDF with a line of text (a post's document).
 */
import { deflateSync } from 'node:zlib';

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
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

/** Navy / gold / teal / plum ... pairs of [from, to] RGB. */
const PALETTES: [[number, number, number], [number, number, number]][] = [
  [
    [16, 33, 78],
    [198, 162, 84],
  ],
  [
    [28, 94, 112],
    [236, 214, 160],
  ],
  [
    [88, 40, 92],
    [240, 170, 120],
  ],
  [
    [24, 70, 52],
    [190, 220, 170],
  ],
  [
    [120, 40, 40],
    [250, 214, 170],
  ],
  [
    [40, 52, 120],
    [150, 190, 240],
  ],
  [
    [60, 60, 70],
    [220, 200, 150],
  ],
  [
    [20, 84, 98],
    [250, 190, 110],
  ],
];

function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic per `seed`: the same picture after every run. */
export function scenePng(seed: number, width: number, height: number): Buffer {
  const rnd = mulberry(seed * 7919 + 13);
  const [a, b] = PALETTES[seed % PALETTES.length];
  const circles = Array.from({ length: 5 }, () => ({
    x: rnd() * width,
    y: rnd() * height,
    r: (0.12 + rnd() * 0.3) * Math.min(width, height),
    shade: rnd() < 0.5 ? 255 : 0,
    alpha: 0.1 + rnd() * 0.18,
  }));
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  const px = Buffer.alloc(stride);
  let o = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const t = (x / width + y / height) / 2;
      let r = a[0] + (b[0] - a[0]) * t;
      let g = a[1] + (b[1] - a[1]) * t;
      let bl = a[2] + (b[2] - a[2]) * t;
      for (const c of circles) {
        const dx = x - c.x;
        const dy = y - c.y;
        if (dx * dx + dy * dy <= c.r * c.r) {
          r += (c.shade - r) * c.alpha;
          g += (c.shade - g) * c.alpha;
          bl += (c.shade - bl) * c.alpha;
        }
      }
      px[x * 3] = r;
      px[x * 3 + 1] = g;
      px[x * 3 + 2] = bl;
    }
    // PNG filter 1 (Sub): smooth gradients compress to almost nothing.
    raw[o] = 1;
    o += 1;
    for (let i = 0; i < stride; i += 1) {
      raw[o + i] = (px[i] - (i >= 3 ? px[i - 3] : 0)) & 0xff;
    }
    o += stride;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A valid one-page PDF (ASCII text only). */
export function samplePdf(title: string): Buffer {
  const safe = title.replace(/[^\x20-\x7e]/g, '?').replace(/[()\\]/g, ' ');
  const stream = `BT /F1 18 Tf 72 720 Td (${safe}) Tj 0 -28 Td /F1 12 Tf (LawBid demo document. Invented content, not legal advice.) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets)
    out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
