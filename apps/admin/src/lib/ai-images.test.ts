import { describe, expect, it } from 'vitest';
import { parseDays } from '@/components/ai/retention-panel';
import { imagesOf, refuseAiImage } from './ai-images';

/** Owner 2026-11-12 (rows 48, 49): what the AI image control lets through. */
describe('AI images: before any upload', () => {
  it('only JPEG / PNG / GIF / WebP; no size cap of ours (the server applies the chat photo limit)', () => {
    expect(refuseAiImage(new File(['x'], 'a.png', { type: 'image/png' }))).toBeNull();
    expect(refuseAiImage(new File(['x'], 'a.webp', { type: 'image/webp' }))).toBeNull();
    expect(refuseAiImage(new File(['x'], 'a.svg', { type: 'image/svg+xml' }))).toMatch(/JPEG/);
    expect(refuseAiImage(new File(['x'], 'a.pdf', { type: 'application/pdf' }))).toMatch(/JPEG/);
    const big = new File([new Uint8Array(20 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' });
    expect(refuseAiImage(big)).toBeNull();
  });

  it('a paste / drop keeps the pictures only', () => {
    const files = [
      new File(['x'], 'shot.png', { type: 'image/png' }),
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
    ];
    expect(imagesOf(files as unknown as FileList).map((f) => f.name)).toEqual(['shot.png']);
    expect(imagesOf(null)).toEqual([]);
  });
});

describe('«Хранить N дней»', () => {
  it('0-36500 whole days; anything else is not saved', () => {
    expect(parseDays('15')).toBe(15);
    expect(parseDays('0')).toBe(0);
    expect(parseDays('365')).toBe(365);
    expect(parseDays('366')).toBe(366);
    expect(parseDays('36500')).toBe(36500);
    expect(parseDays('36501')).toBeNull();
    expect(parseDays('-1')).toBeNull();
    expect(parseDays('1.5')).toBeNull();
    expect(parseDays('')).toBeNull();
  });
});
