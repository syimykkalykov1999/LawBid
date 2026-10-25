import { headerWantsAvif, imageFormatContext } from './image-format-context';

describe('image format negotiation (owner 2026-10-25)', () => {
  it('reads X-Image-Formats', () => {
    expect(headerWantsAvif('avif')).toBe(true);
    expect(headerWantsAvif('WebP, AVIF')).toBe(true);
    expect(headerWantsAvif(['webp', 'avif'])).toBe(true);
    expect(headerWantsAvif('webp')).toBe(false);
    expect(headerWantsAvif('avifx')).toBe(false);
    expect(headerWantsAvif(undefined)).toBe(false);
  });

  it('is on only inside run()', async () => {
    expect(imageFormatContext.wantsAvif()).toBe(false);
    await imageFormatContext.run(true, async () => {
      await Promise.resolve();
      expect(imageFormatContext.wantsAvif()).toBe(true);
    });
    expect(imageFormatContext.wantsAvif()).toBe(false);
  });
});
