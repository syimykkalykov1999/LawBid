import { PDFDocument } from 'pdf-lib';
import { GOLD, MUTED, NAVY, startPdf, stamp } from './pdf-common';

export interface SignedBy {
  role: 'client' | 'attorney';
  name: string;
  method: 'drawn' | 'typed';
  image: Buffer | null;
  signedAt: Date;
  ip: string | null;
  userAgent: string | null;
  docSha256: string;
  /** row_hash of the case journal record of this signature. */
  journalHash: string | null;
}

export interface ProtocolInput {
  requestId: string;
  caseId: string;
  caseTitle: string;
  documentTitle: string;
  sourceSha256: string;
  requestedBy: string;
  requestedAt: Date;
  signers: SignedBy[];
}

export const CONSENT_EN =
  'Each signer agreed to use electronic records and signatures for this document and to sign it by typing or drawing their name in the LawBid app (ESIGN Act, UETA).';
export const CONSENT_RU =
  'Каждый подписант согласился использовать электронные записи и подписи для этого документа и подписать его, введя или нарисовав своё имя в приложении LawBid (ESIGN Act, UETA).';

const ROLE = { client: 'Client / Клиент', attorney: 'Attorney / Адвокат' };

/**
 * Owner 2026-10-20: the two pages added after the original — a signature
 * page (a field for each side with the drawn or typed signature) and the
 * signing protocol (who, when, from which IP, the SHA-256 of the original,
 * the case journal record of each signature). A PNG that does not decode
 * falls back to the typed name, so a bad image never loses the signature.
 */
export function renderSignaturePages(p: ProtocolInput): Promise<Buffer> {
  const { doc, done } = startPdf({ title: `Signatures — ${p.documentTitle}` });
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;

  doc
    .fillColor(NAVY)
    .fontSize(20)
    .text('Signature page / Страница подписей', left, 54);
  doc
    .fillColor(MUTED)
    .fontSize(10)
    .text(p.documentTitle, left, doc.y + 4, { width });
  doc.moveDown(1.5);
  let y = doc.y;
  for (const s of p.signers) {
    doc.fillColor(GOLD).fontSize(9).text(ROLE[s.role], left, y);
    const boxTop = y + 14;
    doc
      .rect(left, boxTop, width, 90)
      .strokeColor('#B9C0CF')
      .lineWidth(0.8)
      .stroke();
    let drawn = false;
    if (s.method === 'drawn' && s.image) {
      try {
        doc.image(s.image, left + 12, boxTop + 8, {
          fit: [width - 24, 74],
          align: 'center',
          valign: 'center',
        });
        drawn = true;
      } catch {
        drawn = false;
      }
    }
    if (!drawn) {
      doc
        .fillColor(NAVY)
        .fontSize(24)
        .text(s.name, left + 12, boxTop + 28, {
          width: width - 24,
          height: 40,
          ellipsis: true,
        });
    }
    doc
      .fillColor(MUTED)
      .fontSize(9)
      .text(`${s.name} · ${stamp(s.signedAt)}`, left, boxTop + 96, { width });
    y = boxTop + 126;
  }

  doc.addPage();
  doc
    .fillColor(NAVY)
    .fontSize(20)
    .text('Signing protocol / Протокол подписания', left, 54);
  doc.moveDown(0.8);
  const kv = (k: string, v: string) => {
    doc
      .fillColor(MUTED)
      .fontSize(8)
      .text(k, left, doc.y + 4, { width });
    doc
      .fillColor(NAVY)
      .fontSize(10)
      .text(v, left, doc.y + 1, { width });
  };
  kv('Document / Документ', p.documentTitle);
  kv('Case / Кейс', `${p.caseTitle} (${p.caseId})`);
  kv('Request / Запрос', p.requestId);
  kv('Requested by / Запросил', `${p.requestedBy} · ${stamp(p.requestedAt)}`);
  kv('SHA-256 of the original file / SHA-256 исходного файла', p.sourceSha256);
  doc.moveDown(1);
  for (const s of p.signers) {
    doc
      .fillColor(GOLD)
      .fontSize(10)
      .text(`${ROLE[s.role]} — ${s.name}`, left, doc.y + 6, { width });
    kv('Signed at / Подписано', stamp(s.signedAt));
    kv(
      'Method / Способ',
      s.method === 'drawn' ? 'drawn / нарисована' : 'typed / введено имя',
    );
    kv('IP', s.ip ?? '—');
    kv('Device / Устройство', (s.userAgent ?? '—').slice(0, 120));
    kv('Document hash seen / Хэш документа', s.docSha256);
    kv('Case journal record / Запись журнала кейса', s.journalHash ?? '—');
  }
  doc.moveDown(1.2);
  doc.fillColor(MUTED).fontSize(8);
  doc.text(CONSENT_EN, left, doc.y, { width });
  doc.moveDown(0.4).text(CONSENT_RU, left, doc.y, { width });
  doc.moveDown(0.6);
  doc.text(
    'The signed file’s own hash is kept in the case journal and shown in the app (it cannot contain itself). / Хэш самого подписанного файла хранится в журнале кейса и показан в приложении.',
    left,
    doc.y,
    { width },
  );
  doc.end();
  return done;
}

/** The original's pages, then [extra]'s: the signed document. */
export async function appendPages(
  original: Buffer,
  extra: Buffer,
): Promise<Buffer> {
  const out = await PDFDocument.load(original, { ignoreEncryption: false });
  const add = await PDFDocument.load(extra);
  const pages = await out.copyPages(add, add.getPageIndices());
  for (const page of pages) out.addPage(page);
  return Buffer.from(await out.save());
}

export const MAX_SIGN_PAGES = 200;

/** True when [data] is a readable, unencrypted PDF of a sane length. */
export async function isSignablePdf(data: Buffer): Promise<boolean> {
  try {
    const d = await PDFDocument.load(data, { ignoreEncryption: false });
    return d.getPageCount() >= 1 && d.getPageCount() <= MAX_SIGN_PAGES;
  } catch {
    return false;
  }
}

/** PNG magic bytes + a readable size, within [maxPx] a side. */
export function pngSize(
  data: Buffer,
  maxPx = 2400,
): { width: number; height: number } | null {
  if (
    data.length < 24 ||
    data.readUInt32BE(0) !== 0x89504e47 ||
    data.readUInt32BE(4) !== 0x0d0a1a0a
  ) {
    return null;
  }
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (!width || !height || width > maxPx || height > maxPx) return null;
  return { width, height };
}
