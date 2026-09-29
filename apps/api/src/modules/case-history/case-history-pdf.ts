import { existsSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import type { CaseHistoryDetailDto } from './dto/case-history.dto';

/** Inter (same face as the app, docs/07), covers Latin + Cyrillic.
 * apps/api/assets/fonts: 3 levels up from src/modules/case-history, 4 from
 * dist/src/modules/case-history. */
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

const NAVY = '#0B1B3F';
const GOLD = '#B8860B';
const MUTED = '#5B6475';

function money(cents: number | null): string {
  if (cents === null) return '';
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function date(iso: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : '—';
}

/** docs/04 §12 "Скачать PDF": list of cases + their timelines. */
export function renderCaseHistoryPdf(input: {
  generatedAt: Date;
  cases: CaseHistoryDetailDto[];
  truncated: boolean;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 54 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Without the bundled font pdfkit falls back to Helvetica (Latin only).
    if (FONT_PATH) {
      doc.registerFont('Inter', FONT_PATH);
      doc.font('Inter');
    }

    doc.fillColor(NAVY).fontSize(20).text('LawBid — Case history');
    doc
      .moveDown(0.2)
      .fillColor(MUTED)
      .fontSize(9)
      .text(
        `Generated ${input.generatedAt.toISOString()} · ${input.cases.length} case(s)`,
      );
    if (input.truncated) {
      doc.text('Only the most recent cases are included in this file.');
    }
    doc
      .moveDown(0.5)
      .strokeColor(GOLD)
      .lineWidth(1)
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke();

    for (const c of input.cases) {
      doc.moveDown(1).fillColor(NAVY).fontSize(13).text(c.title);
      const bid = c.acceptedBid
        ? ` · Accepted bid: ${money(c.acceptedBid.amountCents)} (${c.acceptedBid.feeType})`
        : '';
      doc
        .fillColor(MUTED)
        .fontSize(9)
        .text(
          `${c.practiceArea.nameEn} · ${c.primaryStateCode} · Status: ${c.status}` +
            `${c.deleted ? ' (deleted from feed)' : ''} · Created ${date(c.createdAt)}` +
            ` · Closed ${date(c.closedAt)}${bid}`,
        );
      if (c.clientName) doc.text(`Client: ${c.clientName}`);
      doc.moveDown(0.3).fillColor('#000000').fontSize(9);
      for (const e of c.events) {
        const extra = [
          e.amountCents !== null ? money(e.amountCents) : '',
          e.feeType ?? '',
          e.roundNo !== null ? `round ${e.roundNo}` : '',
          e.reason ?? '',
        ]
          .filter(Boolean)
          .join(', ');
        doc.text(
          `${e.createdAt.replace('T', ' ').slice(0, 16)}  ${e.eventType} (${e.actorRole})${extra ? ` — ${extra}` : ''}`,
          { indent: 12 },
        );
      }
    }
    doc.end();
  });
}
