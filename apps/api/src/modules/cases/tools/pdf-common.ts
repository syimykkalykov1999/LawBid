import { existsSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';

/** Inter (the app's face), covers Latin + Cyrillic. 4 levels up from
 * src/modules/cases/tools, 5 from dist/src/modules/cases/tools. */
const FONT_PATH = [4, 5]
  .map((up) =>
    join(
      __dirname,
      ...Array<string>(up).fill('..'),
      'assets',
      'fonts',
      'Inter-Variable.ttf',
    ),
  )
  .find((p) => existsSync(p));

export const NAVY = '#0B1B3F';
export const GOLD = '#B8860B';
export const MUTED = '#5B6475';

/** A Letter page with the app font; [done] gets the finished bytes. */
export function startPdf(info: { title: string }): {
  doc: PDFKit.PDFDocument;
  done: Promise<Buffer>;
} {
  const doc = new PDFDocument({
    size: 'LETTER',
    margin: 54,
    info: { Title: info.title, Producer: 'LawBid', Creator: 'LawBid' },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  if (FONT_PATH) {
    doc.registerFont('Inter', FONT_PATH);
    doc.font('Inter');
  }
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
