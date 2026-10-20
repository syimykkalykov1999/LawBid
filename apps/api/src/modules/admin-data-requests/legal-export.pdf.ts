import { existsSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';

const FONT_PATH = [3, 4]
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

export interface LegalReportInput {
  referenceNumber: string;
  agency: string;
  requestType: string;
  scope: string;
  exportId: string;
  requestedBy: string;
  generatedAt: Date;
  subject: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
  };
  period: string;
  counts: Record<string, number>;
  truncated: string[];
  /** Readable body: [heading, lines[]] per section, already capped. */
  sections: { title: string; lines: string[] }[];
}

/** The readable half of the archive: who asked, when, on what basis, what is
 * inside, then the content. The JSON files stay the complete record. */
export function renderLegalReportPdf(input: LegalReportInput): Promise<Buffer> {
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
    doc.fillColor('#0B1B3F').fontSize(18).text('LawBid — Records disclosure');
    doc.moveDown(0.4).fillColor('#000').fontSize(10);
    const head: [string, string][] = [
      ['Request', `${input.requestType} · ${input.referenceNumber}`],
      ['Agency', input.agency],
      ['Scope as written', input.scope],
      ['Prepared by (admin id)', input.requestedBy],
      ['Prepared at (UTC)', input.generatedAt.toISOString()],
      ['Archive id', input.exportId],
      [
        'Subject',
        [
          input.subject.name,
          input.subject.phone,
          input.subject.email,
          input.subject.id,
        ]
          .filter(Boolean)
          .join(' · '),
      ],
      ['Period', input.period],
    ];
    for (const [k, v] of head) doc.text(`${k}: ${v}`);
    doc.moveDown().fontSize(12).text('Contents');
    doc.fontSize(10);
    for (const [k, v] of Object.entries(input.counts)) doc.text(`${k}: ${v}`);
    if (input.truncated.length) {
      doc
        .moveDown(0.3)
        .text(`Truncated at the size limit: ${input.truncated.join(', ')}`);
    }
    doc
      .moveDown(0.3)
      .fillColor('#5B6475')
      .text(
        'The complete data is in the data/*.json files; SHA256SUMS.txt lists the SHA-256 of every file.',
      );
    for (const s of input.sections) {
      doc.addPage().fillColor('#0B1B3F').fontSize(13).text(s.title);
      doc.moveDown(0.3).fillColor('#000').fontSize(8.5);
      for (const line of s.lines) doc.text(line, { lineGap: 1 });
    }
    doc.end();
  });
}
