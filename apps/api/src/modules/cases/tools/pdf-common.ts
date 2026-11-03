import PDFDocument from 'pdfkit';
import { applyPdfFonts } from '../../../common/pdf-fonts/pdf-fonts';

export const NAVY = '#0B1B3F';
export const GOLD = '#B8860B';
export const MUTED = '#5B6475';

/** A Letter page with the app font; [done] gets the finished bytes.
 * Deal record 2026-10-27: [bufferPages] keeps pages open for a second pass
 * ("Page N of M" footers), [bottomMargin] reserves room for that footer,
 * [creationDate] fixes the Info date so the same input gives the same bytes. */
export function startPdf(info: {
  title: string;
  bufferPages?: boolean;
  bottomMargin?: number;
  creationDate?: Date;
  /** Document language (BCP-47), picks the Han font for CJK text. */
  lang?: string;
}): {
  doc: PDFKit.PDFDocument;
  done: Promise<Buffer>;
} {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: {
      top: 54,
      left: 54,
      right: 54,
      bottom: info.bottomMargin ?? 54,
    },
    bufferPages: info.bufferPages ?? false,
    info: {
      Title: info.title,
      Producer: 'LawBid',
      Creator: 'LawBid',
      ...(info.creationDate ? { CreationDate: info.creationDate } : {}),
    },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  applyPdfFonts(doc, { lang: info.lang });
  return { doc, done };
}

/** `$1,234.50` from cents. */
export const money = (cents: number, currency = 'USD'): string => {
  const sign = cents < 0 ? '-' : '';
  const body = (Math.abs(cents) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${currency === 'USD' ? '$' : `${currency} `}${body}`;
};

/** `1 h 05 min` from minutes. */
export const hoursText = (minutes: number): string =>
  `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;

/** `2026-10-20 14:03 UTC`. */
export const stamp = (d: Date): string =>
  `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
