import { dangerousContent } from './content-guard';
import { FILE_MIME } from './files.policy';

/** A minimal ZIP: one local header + one central directory entry per
 * name (contents empty). Enough for the entry-name check. */
function zip(names: string[]): Buffer {
  const parts: Buffer[] = [];
  for (const n of names) {
    const name = Buffer.from(n, 'latin1');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name);
  }
  for (const n of names) {
    const name = Buffer.from(n, 'latin1');
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(name.length, 28);
    parts.push(central, name);
  }
  return Buffer.concat(parts);
}

describe('dangerousContent (owner 2026-10-07: no programs in documents)', () => {
  const docx = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml'];

  it('a normal Word / Excel file passes', () => {
    expect(dangerousContent(zip(docx), FILE_MIME.docx)).toBeNull();
    expect(
      dangerousContent(
        zip(['[Content_Types].xml', 'xl/workbook.xml', 'xl/media/image1.png']),
        FILE_MIME.xlsx,
      ),
    ).toBeNull();
  });

  it.each([
    ['an Android app', ['AndroidManifest.xml', 'classes.dex']],
    ['an APK inside', ['word/embeddings/app.apk']],
    ['a Windows program', ['word/media/setup.exe']],
    ['a script', ['word/run.js']],
    ['Word macros', ['word/vbaProject.bin']],
    ['an archive inside', ['word/embeddings/files.zip']],
  ])('refuses %s hidden in a .docx', (_, extra) => {
    expect(
      dangerousContent(zip([...docx, ...extra]), FILE_MIME.docx),
    ).not.toBeNull();
  });

  it('refuses macros in an old .doc / .xls', () => {
    const ole = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.alloc(100),
      Buffer.from('_VBA_PROJECT', 'utf16le'),
    ]);
    expect(dangerousContent(ole, FILE_MIME.doc)).toBe('macros');
    expect(
      dangerousContent(
        Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
        FILE_MIME.xls,
      ),
    ).toBeNull();
  });

  it.each([
    '<< /S /JavaScript /JS (app.alert(1)) >>',
    '<< /Type /Action /S /Launch /F (cmd.exe) >>',
    '<< /Names << /EmbeddedFiles 5 0 R >> >>',
    '<< /S /J#61vaScript >>',
  ])('refuses a PDF with %s', (dict) => {
    const pdf = Buffer.from(`%PDF-1.7\n1 0 obj ${dict} endobj\n%%EOF`);
    expect(dangerousContent(pdf, FILE_MIME.pdf)).toBe('pdf-active-content');
  });

  it('a plain PDF and photos pass', () => {
    const pdf = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj');
    expect(dangerousContent(pdf, FILE_MIME.pdf)).toBeNull();
    expect(
      dangerousContent(Buffer.from([0xff, 0xd8, 0xff]), FILE_MIME.jpeg),
    ).toBeNull();
  });
});
