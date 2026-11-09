import { describe, expect, it, vi } from 'vitest';
import { compressSticker, isAnimatedWebp, STICKER_MAX_SIDE } from './image-compress';

const png = (bytes: number, name = 'a.png') => new File([new Uint8Array(bytes)], name, { type: 'image/png' });

/** RIFF....WEBPVP8X + flags byte (0x02 = animation). */
function webp(animated: boolean): File {
  const b = new Uint8Array(32);
  const put = (o: number, s: string) => [...s].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  put(0, 'RIFF');
  put(8, 'WEBP');
  put(12, 'VP8X');
  b[20] = animated ? 0x02 : 0x00;
  return new File([b], 'w.webp', { type: 'image/webp' });
}

describe('compressSticker (admin speed gaps D-c4, browser-image-compression)', () => {
  it('shrinks a PNG when the result is smaller and keeps the name and type', async () => {
    const compress = vi.fn(() => Promise.resolve(new Blob([new Uint8Array(100)], { type: 'image/png' })));
    const r = await compressSticker(png(1000), { compress });
    expect(r.compressed).toBe(true);
    expect(r.file.size).toBe(100);
    expect(r.file.name).toBe('a.png');
    expect(r.file.type).toBe('image/png');
    expect(r.originalBytes).toBe(1000);
    expect(compress).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ maxWidthOrHeight: STICKER_MAX_SIDE, fileType: 'image/png' }));
  });

  it('keeps the original when compression does not gain anything', async () => {
    const compress = vi.fn(() => Promise.resolve(new Blob([new Uint8Array(1000)], { type: 'image/png' })));
    const r = await compressSticker(png(1000), { compress });
    expect(r.compressed).toBe(false);
    expect(r.file.size).toBe(1000);
  });

  it('never touches a GIF or an animated WEBP (a canvas keeps one frame)', async () => {
    const compress = vi.fn();
    const gif = new File([new Uint8Array(10)], 'g.gif', { type: 'image/gif' });
    expect((await compressSticker(gif, { compress })).compressed).toBe(false);
    expect((await compressSticker(webp(true), { compress })).compressed).toBe(false);
    expect(compress).not.toHaveBeenCalled();
    expect(isAnimatedWebp(new Uint8Array(await webp(true).arrayBuffer()))).toBe(true);
    expect(isAnimatedWebp(new Uint8Array(await webp(false).arrayBuffer()))).toBe(false);
  });

  it('a still WEBP is compressed; a failure falls back to the original', async () => {
    const ok = vi.fn(() => Promise.resolve(new Blob([new Uint8Array(4)], { type: 'image/webp' })));
    expect((await compressSticker(webp(false), { compress: ok })).compressed).toBe(true);
    const bad = vi.fn(() => Promise.reject(new Error('no canvas')));
    const r = await compressSticker(png(1000), { compress: bad });
    expect(r.compressed).toBe(false);
    expect(r.file.size).toBe(1000);
  });
});
