import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blurhashDataUrl, LazyImg, srcSetOf } from '@/components/ui/lazy-img';

// jsdom has no 2d canvas (it logs «not implemented»): a quiet null here.
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LazyImg (speed matrix §3 #3)', () => {
  it('is lazy, decodes async and keeps the given classes', () => {
    const { container } = render(<LazyImg src="https://m.test/a.jpg" alt="a" className="h-20 w-20 object-cover" />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
    expect(img.className).toBe('h-20 w-20 object-cover');
    expect(img.getAttribute('srcset')).toBeNull();
  });

  it('builds a srcset from the server copies that exist', () => {
    expect(srcSetOf({ url: 'o', previewUrl: 'p', mediumUrl: 'm' })).toBe('p 320w, m 1080w, o 2048w');
    expect(srcSetOf({ url: 'o', previewUrl: 'p' })).toBe('p 320w, o 2048w');
    // a document "preview" that is the original itself is no copy
    expect(srcSetOf({ url: 'o', previewUrl: 'o' })).toBeUndefined();
    expect(srcSetOf({ url: 'o' })).toBeUndefined();
    expect(srcSetOf(null)).toBeUndefined();
    const { container } = render(
      <LazyImg src="o" sources={{ url: 'o', previewUrl: 'p', mediumUrl: 'm' }} sizes="144px" alt="" />,
    );
    const img = container.querySelector('img')!;
    expect(img.getAttribute('srcset')).toBe('p 320w, m 1080w, o 2048w');
    expect(img.getAttribute('sizes')).toBe('144px');
  });

  it('shows the blurhash as background until the picture loaded (no canvas here: nothing, no error)', () => {
    // jsdom has no 2d canvas: the decoder path returns null and the img is plain
    expect(blurhashDataUrl('LEHV6nWB2yk8pyo0adR*.7kCMdnj')).toBeNull();
    const { container } = render(<LazyImg src="o" blurhash="LEHV6nWB2yk8pyo0adR*.7kCMdnj" alt="" />);
    const img = container.querySelector('img')!;
    expect(img.style.backgroundImage).toBe('');
    fireEvent.load(img);
    expect(img.style.backgroundImage).toBe('');
  });

  it('a bad blurhash is ignored', () => {
    expect(blurhashDataUrl('not-a-hash')).toBeNull();
  });
});
