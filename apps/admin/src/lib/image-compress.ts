import imageCompression from 'browser-image-compression';

/**
 * Admin uploads of stickers and gifts (speed matrix 2026-11-09 §SM #8):
 * the picture is shrunk in the browser before it goes to storage —
 * `browser-image-compression` (MIT, canvas + Web Worker), the library the
 * web uses for exactly this. Rules that keep the quality the owner asked for:
 *  - the side is capped at STICKER_MAX_SIDE (Telegram's sticker size), the
 *    format stays (PNG stays PNG with its transparency, WEBP stays WEBP);
 *  - GIF and animated WEBP are sent as they are (a canvas keeps one frame);
 *  - the result is used only when it is really smaller than the original.
 */
export const STICKER_MAX_SIDE = 512;
export const STICKER_MAX_MB = 1;

export interface CompressOptions {
  maxWidthOrHeight?: number;
  maxSizeMB?: number;
  /** Test seam: the compressor (default `browser-image-compression`). */
  compress?: (file: File, opts: { maxWidthOrHeight: number; maxSizeMB: number; useWebWorker: boolean; initialQuality: number; fileType: string }) => Promise<Blob>;
}

export interface CompressResult {
  file: File;
  /** False when the original was kept (animation, no gain, or a failure). */
  compressed: boolean;
  originalBytes: number;
}

/** WEBP: RIFF + 'WEBP' + 'VP8X' chunk whose flags byte has the animation bit. */
export function isAnimatedWebp(head: Uint8Array): boolean {
  if (head.length < 21) return false;
  const tag = (o: number) => String.fromCharCode(head[o], head[o + 1], head[o + 2], head[o + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP' || tag(12) !== 'VP8X') return false;
  return (head[20] & 0x02) !== 0;
}

export async function compressSticker(file: File, opts: CompressOptions = {}): Promise<CompressResult> {
  const keep: CompressResult = { file, compressed: false, originalBytes: file.size };
  const mime = file.type;
  if (mime === 'image/gif') return keep;
  if (mime === 'image/webp') {
    const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
    if (isAnimatedWebp(head)) return keep;
  }
  if (!['image/png', 'image/webp', 'image/jpeg'].includes(mime)) return keep;
  const compress = opts.compress ?? ((f, o) => imageCompression(f, o));
  try {
    const out = await compress(file, {
      maxWidthOrHeight: opts.maxWidthOrHeight ?? STICKER_MAX_SIDE,
      maxSizeMB: opts.maxSizeMB ?? STICKER_MAX_MB,
      useWebWorker: true,
      initialQuality: 0.92,
      fileType: mime,
    });
    if (out.size >= file.size) return keep;
    const named = out instanceof File && out.name === file.name ? out : new File([out], file.name, { type: mime, lastModified: file.lastModified });
    return { file: named, compressed: true, originalBytes: file.size };
  } catch {
    return keep;
  }
}
