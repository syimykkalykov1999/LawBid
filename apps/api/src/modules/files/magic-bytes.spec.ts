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
    // OQ-047: GIF and plain text are allowed types now; a text file named
    // .pdf is text, never a PDF (the declared type must match).
    expect(detectMime(Buffer.from('hello.pdf'), 'application/pdf')).toBe(
      'text/plain',
    );
    expect(detectMime(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(detectMime(Buffer.alloc(0))).toBeNull();
  });

  it('OQ-047: office, ODF, RTF, text, WEBP, GIF', () => {
    const ole = Buffer.from([
      0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0,
    ]);
    expect(detectMime(ole)).toBe('application/msword');
    expect(detectMime(ole, 'application/vnd.ms-excel')).toBe(
      'application/vnd.ms-excel',
    );
    expect(detectMime(ole, 'application/pdf')).toBe('application/msword');
    const zip = (body: string) =>
      Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        Buffer.from(body.padEnd(40, ' ')),
      ]);
    expect(detectMime(zip('[Content_Types].xml xl/workbook.xml'))).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(detectMime(zip('[Content_Types].xml ppt/presentation.xml'))).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    expect(detectMime(zip('[Content_Types].xml word/document.xml'))).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(
      detectMime(zip('mimetypeapplication/vnd.oasis.opendocument.text')),
    ).toBe('application/vnd.oasis.opendocument.text');
    expect(detectMime(Buffer.from('{\\rtf1\\ansi hello}'))).toBe(
      'application/rtf',
    );
    expect(detectMime(Buffer.from('a,b\n1,2\n'), 'text/csv')).toBe('text/csv');
    expect(detectMime(Buffer.from('Привет, мир'))).toBe('text/plain');
    expect(detectMime(Buffer.from('GIF89a....'))).toBe('image/gif');
    expect(detectMime(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(detectMime(Buffer.from([1, 2, 0, 3, 4, 5]))).toBeNull();
  });
});
