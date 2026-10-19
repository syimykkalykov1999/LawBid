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
  // Owner 2026-10-17: an MP4/MOV video shares the `ftyp` box (and brands)
  // with an .m4a voice note — the declared video type picks it.
  if (
    (declared === FILE_MIME.mp4 || declared === FILE_MIME.mov) &&
    isVideoFtyp(b)
  ) {
    return declared;
  }
  if (isM4a(b)) return FILE_MIME.m4a;
  // Owner 2026-10-19: a WebM video (declared so) — the same container as
  // a browser voice note, with a VP8 / VP9 / AV1 picture track.
  if (declared === FILE_MIME.webmVideo && isWebmVideo(b)) {
    return FILE_MIME.webmVideo;
  }
  if (isWebmOpus(b)) return FILE_MIME.webm;
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

// MPEG-4 audio brands the iOS/Android recorders write (AAC in .m4a), plus
// what browsers' MediaRecorder writes for audio/mp4 (Safari, Chrome ≥ 126:
// fragmented MP4 with iso5/iso6/mp4a-style brands).
const M4A_BRANDS = new Set([
  'M4A ',
  'mp42',
  'mp41',
  'isom',
  'iso2',
  'iso5',
  'iso6',
  'mp4a',
  'dash',
]);

const EBML_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];
const EBML_DOCTYPE_ID = 0x4282;

/** An EBML variable-length integer at [off]: its byte length and value
 * (with the length marker kept for element IDs, stripped for sizes). */
function readVint(
  b: Buffer,
  off: number,
  maxLen: number,
  keepMarker: boolean,
): { len: number; value: number } | null {
  if (off >= b.length) return null;
  const first = b[off];
  if (first === 0) return null;
  const len = Math.clz32(first) - 23; // leading zeros in the byte + 1
  if (len > maxLen || off + len > b.length) return null;
  let value = keepMarker ? first : first & (0xff >> len);
  for (let i = 1; i < len; i++) value = value * 256 + b[off + i];
  return { len, value };
}

/**
 * Browser voice note: a WebM file (EBML magic 1A 45 DF A3 whose header's
 * DocType is exactly "webm" — plain Matroska is refused) carrying an Opus
 * audio track (CodecID "A_OPUS" in the Tracks element, which
 * MediaRecorder writes before the first cluster).
 */
function isWebmOpus(b: Buffer): boolean {
  const end = webmHeaderEnd(b);
  if (end === null) return false;
  const head = b.subarray(end, Math.min(b.length, 64 * 1024));
  return head.includes('A_OPUS', 0, 'latin1');
}

/** A WebM file whose tracks carry a VP8, VP9 or AV1 picture. */
function isWebmVideo(b: Buffer): boolean {
  const end = webmHeaderEnd(b);
  if (end === null) return false;
  const head = b.subarray(end, Math.min(b.length, 256 * 1024));
  return ['V_VP8', 'V_VP9', 'V_AV1'].some((c) => head.includes(c, 0, 'latin1'));
}

/** Where the EBML header of a file with DocType exactly "webm" ends, or
 * null (not EBML, plain Matroska, broken header). */
function webmHeaderEnd(b: Buffer): number | null {
  if (b.length < 8 || !EBML_MAGIC.every((v, i) => b[i] === v)) return null;
  const size = readVint(b, 4, 8, false);
  if (!size) return null;
  const start = 4 + size.len;
  const end = start + size.value;
  if (end > b.length) return null;
  let docType: string | null = null;
  for (let off = start; off < end;) {
    const id = readVint(b, off, 4, true);
    if (!id) return null;
    const len = readVint(b, off + id.len, 8, false);
    if (!len) return null;
    const data = off + id.len + len.len;
    if (data + len.value > end) return null;
    if (id.value === EBML_DOCTYPE_ID) {
      docType = b
        .subarray(data, data + len.value)
        .toString('latin1')
        .replace(/\0+$/, '');
    }
    off = data + len.value;
  }
  return docType === 'webm' ? end : null;
}

/** An ISO-BMFF file with an audio brand (checked after HEIC, which shares
 * the `ftyp` box). */
function isM4a(b: Buffer): boolean {
  if (b.length < 12 || b.subarray(4, 8).toString('latin1') !== 'ftyp') {
    return false;
  }
  return M4A_BRANDS.has(b.subarray(8, 12).toString('latin1'));
}

// Brands of MP4 / QuickTime videos the iOS and Android cameras and the
// app's compressor write.
const VIDEO_BRANDS = new Set([
  'isom',
  'iso2',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'avc1',
  'M4V ',
  'qt  ',
  '3gp4',
  '3gp5',
  '3gp6',
]);

/** An ISO-BMFF / QuickTime file with a video brand. */
function isVideoFtyp(b: Buffer): boolean {
  if (b.length < 12 || b.subarray(4, 8).toString('latin1') !== 'ftyp') {
    return false;
  }
  return VIDEO_BRANDS.has(b.subarray(8, 12).toString('latin1'));
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
