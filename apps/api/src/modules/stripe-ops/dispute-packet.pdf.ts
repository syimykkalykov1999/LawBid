import PDFDocument from 'pdfkit';
import { FONT_PATH } from '../case-payments/payment-receipt.pdf';

/** A plain text PDF (US Letter, 12 pt: Stripe's evidence rules) for the
 * dispute evidence packet. Small by construction (a few KB). */
export function renderDisputePacketPdf(lines: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 54 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    if (FONT_PATH) {
      doc.registerFont('Inter', FONT_PATH);
      doc.font('Inter');
    }
    doc.fontSize(12);
    lines.forEach((line, i) => {
      if (i === 0) doc.fontSize(16).text(line).fontSize(12);
      else doc.text(line, { lineGap: 2 });
    });
    doc.end();
  });
}
