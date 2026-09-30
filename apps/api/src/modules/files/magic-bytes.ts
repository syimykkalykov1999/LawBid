import { FILE_MIME, type FileMime } from './files.policy';

// ISO-BMFF brands of HEIF files carrying HEVC images (what iPhones
// produce). `mif1`/`msf1` are generic HEIF brands — accepted only when a
// HEVC brand is among the compatible brands (AVIF also uses mif1).
const HEVC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis']);
const GENERIC_HEIF_BRANDS = new Set(['mif1', 'msf1']);

/**
 * Real file type from the leading bytes (docs/03 §2.2 "Сервер проверяет
 * реальный MIME (magic bytes)"), never from the extension or the
 * client's Content-Type. Returns null for anything outside the allow-list.
 */
export function detectMime(buf: Uint8Array): FileMime | null {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return FILE_MIME.jpeg;
  }
  if (
    b.length >= 8 &&
    b
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return FILE_MIME.png;
  }
  if (b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-') {
    return FILE_MIME.pdf;
  }
  if (isHeic(b)) return FILE_MIME.heic;
  if (isDocx(b)) return FILE_MIME.docx;
  if (isM4a(b)) return FILE_MIME.m4a;
  return null;
}

// MPEG-4 audio brands the iOS/Android recorders write (AAC in .m4a).
const M4A_BRANDS = new Set(['M4A ', 'mp42', 'mp41', 'isom', 'iso2', 'dash']);

/** An ISO-BMFF file with an audio brand (checked after HEIC, which shares
 * the `ftyp` box). */
function isM4a(b: Buffer): boolean {
  if (b.length < 12 || b.subarray(4, 8).toString('latin1') !== 'ftyp') {
    return false;
  }
  return M4A_BRANDS.has(b.subarray(8, 12).toString('latin1'));
}

/** OOXML Word document: a ZIP (local file header "PK\x03\x04") whose
 * entries include the Word part. Checked on the leading bytes only — a
 * .docx written by Word/Pages/Google Docs lists "[Content_Types].xml" and
 * "word/" within its first entries. */
function isDocx(b: Buffer): boolean {
  if (b.length < 30) return false;
  if (!(b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04)) {
    return false;
  }
  const head = b.subarray(0, Math.min(b.length, 64 * 1024)).toString('latin1');
  return head.includes('[Content_Types].xml') && head.includes('word/');
}

function isHeic(b: Buffer): boolean {
  if (b.length < 16 || b.subarray(4, 8).toString('latin1') !== 'ftyp') {
    return false;
  }
  const boxSize = b.readUInt32BE(0);
  if (boxSize < 16 || boxSize > b.length) return false;
  const major = b.subarray(8, 12).toString('latin1');
  if (HEVC_BRANDS.has(major)) return true;
  if (!GENERIC_HEIF_BRANDS.has(major)) return false;
  for (let off = 16; off + 4 <= boxSize; off += 4) {
    if (HEVC_BRANDS.has(b.subarray(off, off + 4).toString('latin1'))) {
      return true;
    }
  }
  return false;
}
