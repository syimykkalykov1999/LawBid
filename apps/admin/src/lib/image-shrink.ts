import imageCompression from 'browser-image-compression';

/**
 * SPEED_MATRIX 2026-11-09 §3 №8 (admin stickers / gifts): the picture is
 * shrunk in the browser before it leaves the admin's computer, exactly as
 * the app does on the phone (`sticker_widgets.dart`: `maxWidth: 512,
 * maxHeight: 512`; the server keeps stickers as uploaded,
 * `files.policy.ts` «sticker … kept as uploaded»). The work is done by
 * browser-image-compression 2.0.2 (MIT, canvas in a Web Worker); PNG and
 * WEBP keep their transparency, nothing is re-encoded to JPEG. A GIF or an
 * animated WEBP is sent as is: a canvas frame would drop the animation.
 */
export const STICKER_MAX_PX = 512;

/** True for a GIF, or a WEBP whose header carries the animation flag. */
export async function isAnimatedImage(file: Blob, mime: string): Promise<boolean> {
  if (mime === 'image/gif') return true;
  if (mime !== 'image/webp') return false;
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const tag = (at: number) => String.fromCharCode(...head.subarray(at, at + 4));
  // RIFF….WEBP VP8X <flags>: bit 1 (0x02) = animation (WebP container spec).
  if (head.length < 21 || tag(0) !== 'RIFF' || tag(8) !== 'WEBP') return false;
  return tag(12) === 'VP8X' && (head[20] & 0x02) !== 0;
}

export type Shrinker = (file: File, options: { maxWidthOrHeight: number; fileType: string; useWebWorker: boolean; initialQuality: number }) => Promise<File | Blob>;

/**
 * The file to upload: shrunk to fit [maxPx] on its longer side, or the
 * original when it is animated, not a raster picture we re-encode, or
 * when shrinking did not make it smaller. Never throws: a browser without
 * canvas/worker support just sends the original.
 */
export async function shrinkForUpload(
  file: File,
  mime: string,
  { maxPx = STICKER_MAX_PX, shrink = imageCompression as unknown as Shrinker }: { maxPx?: number; shrink?: Shrinker } = {},
): Promise<File> {
  if (!['image/png', 'image/webp', 'image/jpeg'].includes(mime)) return file;
  try {
    if (await isAnimatedImage(file, mime)) return file;
    const out = await shrink(file, { maxWidthOrHeight: maxPx, fileType: mime, useWebWorker: true, initialQuality: 0.92 });
    if (out.size >= file.size) return file;
    return out instanceof File ? out : new File([out], file.name, { type: mime, lastModified: file.lastModified });
  } catch {
    return file;
  }
}
