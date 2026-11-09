import { describe, expect, it, vi } from 'vitest';
import { STICKER_MAX_PX, isAnimatedImage, shrinkForUpload } from './image-shrink';

/**
 * SPEED_MATRIX 2026-11-09 §3 №8: before, `sticker-uploader.tsx` /
 * `gift-uploader.tsx` sent the picked file as is (a 2000 px PNG of
 * several MB, refused by the 1 MB sticker limit or stored at full size).
 * Now the picture is shrunk to the app's 512 px before the upload;
 * animated pictures and files that would not get smaller pass untouched.
 */
function bytes(...parts: (string | number[])[]): Uint8Array<ArrayBuffer> {
  const out: number[] = [];
  for (const p of parts) {
    if (typeof p === 'string') for (const ch of p) out.push(ch.charCodeAt(0));
    else out.push(...p);
  }
  return new Uint8Array(out);
}

const webp = (flags: number) =>
  new File([bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8X', [0, 0, 0, 0, flags, 0, 0, 0, 0, 0, 0, 0])], 's.webp', { type: 'image/webp' });

describe('isAnimatedImage', () => {
  it('GIF is always treated as animated', async () => {
    expect(await isAnimatedImage(new File([bytes('GIF89a')], 'a.gif'), 'image/gif')).toBe(true);
  });
  it('reads the animation flag of a WEBP header', async () => {
    expect(await isAnimatedImage(webp(0x02), 'image/webp')).toBe(true);
    expect(await isAnimatedImage(webp(0x10), 'image/webp')).toBe(false);
  });
  it('a PNG is never animated', async () => {
    expect(await isAnimatedImage(new File([bytes([137, 80, 78, 71])], 'a.png'), 'image/png')).toBe(false);
  });
});

describe('shrinkForUpload', () => {
  const big = new File([new Uint8Array(3_000_000)], 'big.png', { type: 'image/png' });

  it('shrinks a PNG to the app’s 512 px and keeps its type', async () => {
    const shrink = vi.fn(async (f: File, o: { maxWidthOrHeight: number; fileType: string }) => new File([new Uint8Array(40_000)], f.name, { type: o.fileType }));
    const out = await shrinkForUpload(big, 'image/png', { shrink });
    expect(shrink).toHaveBeenCalledWith(big, expect.objectContaining({ maxWidthOrHeight: STICKER_MAX_PX, fileType: 'image/png' }));
    expect(out.size).toBe(40_000);
    expect(out.type).toBe('image/png');
    expect(out.size / big.size).toBeLessThan(0.02);
  });

  it('keeps the original when shrinking does not make it smaller', async () => {
    const shrink = vi.fn(async (f: File) => new File([new Uint8Array(f.size + 10)], f.name, { type: f.type }));
    expect(await shrinkForUpload(big, 'image/png', { shrink })).toBe(big);
  });

  it('sends animated pictures as they are', async () => {
    const shrink = vi.fn();
    expect(await shrinkForUpload(webp(0x02), 'image/webp', { shrink })).toBeInstanceOf(File);
    const gif = new File([bytes('GIF89a')], 'a.gif', { type: 'image/gif' });
    expect(await shrinkForUpload(gif, 'image/gif', { shrink })).toBe(gif);
    expect(shrink).not.toHaveBeenCalled();
  });

  it('a failing shrinker never blocks the upload', async () => {
    const shrink = vi.fn(async () => {
      throw new Error('no canvas');
    });
    expect(await shrinkForUpload(big, 'image/png', { shrink })).toBe(big);
  });
});
