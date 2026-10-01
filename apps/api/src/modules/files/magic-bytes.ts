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
export function detectMime(
  buf: Uint8Array,
  /** OQ-047: what the client declared — picks the member of a family the
   * bytes can't tell apart (legacy .doc/.xls/.ppt; .txt vs .csv). */
  declared?: string,
): FileMime | null {
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
  const family = detectFamily(b);
  if (family) {
    return declared && (family as readonly string[]).includes(declared)
      ? (declared as FileMime)
      : family[0];
  }
  return null;
}

const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** OQ-047 formats; null when [b] is none of them (the older checks run
 * then). A family lists the types sharing one signature. */
function detectFamily(b: Buffer): readonly FileMime[] | null {
  if (
    b.length >= 12 &&
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return [FILE_MIME.webp];
  }
  if (b.length >= 6) {
    const sig = b.subarray(0, 6).toString('latin1');
    if (sig === 'GIF87a' || sig === 'GIF89a') return [FILE_MIME.gif];
  }
  if (b.length >= 8 && OLE.every((v, i) => b[i] === v)) {
    return [FILE_MIME.doc, FILE_MIME.xls, FILE_MIME.ppt];
  }
  if (b.length >= 5 && b.subarray(0, 5).toString('latin1') === '{\\rtf') {
    return [FILE_MIME.rtf];
  }
  if (isZip(b)) {
    const head = b
      .subarray(0, Math.min(b.length, 64 * 1024))
      .toString('latin1');
    if (head.includes('[Content_Types].xml') || head.includes('_rels/')) {
      if (head.includes('xl/')) return [FILE_MIME.xlsx];
      if (head.includes('ppt/')) return [FILE_MIME.pptx];
    }
    // ODF: the first entry is "mimetype", stored, holding the type.
    if (
      head.startsWith('PK') &&
      head.includes('mimetypeapplication/vnd.oasis.opendocument.')
    ) {
      if (head.includes('opendocument.text')) return [FILE_MIME.odt];
      if (head.includes('opendocument.spreadsheet')) return [FILE_MIME.ods];
      if (head.includes('opendocument.presentation')) return [FILE_MIME.odp];
    }
    return null;
  }
  if (looksLikeText(b)) return [FILE_MIME.txt, FILE_MIME.csv];
  return null;
}

function isZip(b: Buffer): boolean {
  return (
    b.length >= 30 &&
    b[0] === 0x50 &&
    b[1] === 0x4b &&
    b[2] === 0x03 &&
    b[3] === 0x04
  );
}

/** Plain text: strictly valid UTF-8 (a multi-byte sequence cut at the
 * 64 KB sample edge is fine), no NUL, few control bytes. */
function looksLikeText(b: Buffer): boolean {
  if (b.length === 0) return false;
  const head = b.subarray(0, Math.min(b.length, 64 * 1024));
  if (head.includes(0)) return false;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const valid = (buf: Buffer) => {
    try {
      decoder.decode(buf);
      return true;
    } catch {
      return false;
    }
  };
  const cut = b.length > head.length;
  if (
    !valid(head) &&
    !(cut && [1, 2, 3].some((n) => valid(head.subarray(0, head.length - n))))
  ) {
    return false;
  }
  let control = 0;
  for (const byte of head) {
    if (byte < 9 || (byte > 13 && byte < 32)) control++;
  }
  return control / head.length < 0.01;
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
