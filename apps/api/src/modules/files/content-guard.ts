import { FILE_MIME, type FileMime } from './files.policy';

/**
 * Owner 2026-10-07: a document on LawBid must never carry a program. The
 * allow-list (files.policy) and magic bytes already refuse APK, EXE,
 * scripts and archives sent as themselves; this looks INSIDE the allowed
 * containers, where one could hide:
 * - Office Open XML / OpenDocument (ZIP): an app (AndroidManifest.xml,
 *   classes.dex), a program or script entry, VBA macros (vbaProject.bin);
 * - legacy Word/Excel/PowerPoint (OLE): VBA macros;
 * - PDF: JavaScript, launch actions, embedded files.
 * ClamAV still scans every file afterwards. Returns why the file is
 * refused, or null when it is fine.
 */
export function dangerousContent(data: Buffer, mime: FileMime): string | null {
  if (ZIP_MIMES.has(mime)) return dangerousZipEntry(data);
  if (OLE_MIMES.has(mime)) {
    return data.includes(VBA_OLE) || data.includes(VBA_OLE_ASCII)
      ? 'macros'
      : null;
  }
  if (mime === FILE_MIME.pdf) {
    const text = data.toString('latin1');
    for (const key of PDF_KEYS) {
      if (key.test(text)) return 'pdf-active-content';
    }
  }
  return null;
}

const ZIP_MIMES = new Set<FileMime>([
  FILE_MIME.docx,
  FILE_MIME.xlsx,
  FILE_MIME.pptx,
  FILE_MIME.odt,
  FILE_MIME.ods,
  FILE_MIME.odp,
]);

const OLE_MIMES = new Set<FileMime>([
  FILE_MIME.doc,
  FILE_MIME.xls,
  FILE_MIME.ppt,
]);

/** "_VBA_PROJECT" — the OLE stream every VBA project has (UTF-16LE in
 * the directory, ASCII in some writers). */
const VBA_OLE = Buffer.from('_VBA_PROJECT', 'utf16le');
const VBA_OLE_ASCII = Buffer.from('_VBA_PROJECT', 'latin1');

/** PDF names that run code or carry files. `#xx` escapes are decoded by
 * readers, so a hex-escaped name counts too. */
const PDF_KEYS = [
  /\/(?:J|#4[aA])(?:a|#61)(?:v|#76)(?:a|#61)(?:S|#53)(?:c|#63)(?:r|#72)(?:i|#69)(?:p|#70)(?:t|#74)/,
  /\/JS[\s/<([]/,
  /\/Launch\b/,
  /\/EmbeddedFiles?\b/,
  /\/RichMedia\b/,
];

const BAD_NAMES = new Set([
  'androidmanifest.xml',
  'classes.dex',
  'vbaproject.bin',
  'manifest.mf',
]);

const BAD_EXTENSIONS = new Set([
  'apk',
  'aab',
  'xapk',
  'dex',
  'exe',
  'dll',
  'com',
  'scr',
  'msi',
  'msp',
  'bat',
  'cmd',
  'ps1',
  'vbs',
  'vbe',
  'js',
  'jse',
  'wsf',
  'wsh',
  'hta',
  'jar',
  'class',
  'sh',
  'so',
  'dylib',
  'elf',
  'lnk',
  'app',
  'ipa',
  'dmg',
  'pkg',
  'deb',
  'rpm',
  'zip',
  'rar',
  '7z',
  'gz',
  'tar',
  'iso',
  'docm',
  'xlsm',
  'pptm',
  'dotm',
  'xlam',
  'ppam',
]);

/** Every entry name of the ZIP — local headers and the central directory
 * (the directory at the end lists all of them). */
function dangerousZipEntry(b: Buffer): string | null {
  for (const [sig, nameLenAt, nameAt] of [
    [LOCAL, 26, 30],
    [CENTRAL, 28, 46],
  ] as const) {
    let i = b.indexOf(sig);
    while (i >= 0 && i + nameAt <= b.length) {
      const len = b.readUInt16LE(i + nameLenAt);
      const name = b
        .subarray(i + nameAt, Math.min(b.length, i + nameAt + len))
        .toString('latin1')
        .toLowerCase();
      const base = name.split('/').pop() ?? '';
      const dot = base.lastIndexOf('.');
      const ext = dot < 0 ? '' : base.slice(dot + 1);
      if (BAD_NAMES.has(base) || BAD_EXTENSIONS.has(ext)) {
        return `entry:${base}`;
      }
      i = b.indexOf(sig, i + 4);
    }
  }
  return null;
}

const LOCAL = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const CENTRAL = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
