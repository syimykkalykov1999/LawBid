// Owner 2026-10-25: WebP vs AVIF size and decode time on real photos.
// Usage: node apps/api/bench/image-avif.mjs <folder-with-jpgs> [avifQuality]
import { readdirSync } from 'node:fs';
import sharp from 'sharp';

const dir = process.argv[2];
const quality = Number(process.argv[3] ?? 55);
const files = readdirSync(dir)
  .filter((f) => /\.jpe?g$/i.test(f))
  .slice(0, 8);

for (const px of [320, 1080, 2048]) {
  for (const effort of [2, 4]) {
    let w = 0,
      a = 0,
      tw = 0,
      ta = 0,
      dw = 0,
      da = 0;
    for (const f of files) {
      const raw = await sharp(`${dir}/${f}`)
        .rotate()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const { width, height, channels } = raw.info;
      const mk = () =>
        sharp(raw.data, { raw: { width, height, channels } })
          .resize(px, px, { fit: 'inside', withoutEnlargement: true })
          .flatten({ background: '#ffffff' });
      let t = performance.now();
      const bw = await mk().webp({ quality: 88, effort: 4 }).toBuffer();
      tw += performance.now() - t;
      t = performance.now();
      const ba = await mk().avif({ quality, effort }).toBuffer();
      ta += performance.now() - t;
      t = performance.now();
      await sharp(bw).raw().toBuffer();
      dw += performance.now() - t;
      t = performance.now();
      await sharp(ba).raw().toBuffer();
      da += performance.now() - t;
      w += bw.length;
      a += ba.length;
    }
    const n = files.length;
    console.log(
      `px=${px} effort=${effort} n=${n} webp=${(w / n / 1024).toFixed(0)}KB ` +
        `avif=${(a / n / 1024).toFixed(0)}KB (-${(100 - (100 * a) / w).toFixed(0)}%) ` +
        `encode webp ${(tw / n).toFixed(0)}ms avif ${(ta / n).toFixed(0)}ms ` +
        `decode webp ${(dw / n).toFixed(1)}ms avif ${(da / n).toFixed(1)}ms`,
    );
  }
}
