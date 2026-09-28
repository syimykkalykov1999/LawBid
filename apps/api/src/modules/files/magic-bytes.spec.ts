import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectMime } from './magic-bytes';

describe('detectMime (docs/03 §2.2 magic bytes)', () => {
  const ftyp = (major: string, compat: string[]): Buffer => {
    const size = 16 + compat.length * 4;
    const b = Buffer.alloc(size + 8);
    b.writeUInt32BE(size, 0);
    b.write('ftyp', 4, 'latin1');
    b.write(major, 8, 'latin1');
    compat.forEach((c, i) => b.write(c, 16 + i * 4, 'latin1'));
    return b;
  };

  it('recognises JPEG, PNG, PDF', () => {
    expect(detectMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe(
      'image/jpeg',
    );
    expect(
      detectMime(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
      ),
    ).toBe('image/png');
    expect(detectMime(Buffer.from('%PDF-1.7\n'))).toBe('application/pdf');
  });

  it('recognises a real iPhone-style HEIC and HEVC-branded mif1', () => {
    const heic = readFileSync(
      join(__dirname, '../../../test/fixtures/sample.heic'),
    );
    expect(detectMime(heic)).toBe('image/heic');
    expect(detectMime(ftyp('mif1', ['mif1', 'heic']))).toBe('image/heic');
  });

  it('rejects AVIF, text, extension tricks and truncated data', () => {
    expect(detectMime(ftyp('avif', ['mif1', 'avif']))).toBeNull();
    expect(detectMime(ftyp('mif1', ['avif']))).toBeNull();
    expect(detectMime(Buffer.from('GIF89a....'))).toBeNull();
    expect(detectMime(Buffer.from('hello.pdf'))).toBeNull();
    expect(detectMime(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(detectMime(Buffer.alloc(0))).toBeNull();
  });
});
