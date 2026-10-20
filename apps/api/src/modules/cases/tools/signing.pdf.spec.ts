import { PDFDocument } from 'pdf-lib';
import PDFDocumentKit from 'pdfkit';
import { createHash } from 'node:crypto';
import {
  appendPages,
  isSignablePdf,
  pngSize,
  renderSignaturePages,
} from './signing.pdf';
import { renderInvoicePdf } from './invoice.pdf';
import { renderDocumentPdf } from './document.pdf';

// A 1x1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function original(pages: number): Promise<Buffer> {
  const doc = new PDFDocumentKit({ size: 'LETTER' });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((r) =>
    doc.on('end', () => r(Buffer.concat(chunks))),
  );
  for (let i = 0; i < pages; i++) {
    if (i) doc.addPage();
    doc.text(`Contract page ${i + 1}`);
  }
  doc.end();
  return done;
}

const signer = (role: 'client' | 'attorney', method: 'drawn' | 'typed') => ({
  role,
  name: role === 'client' ? 'Анна Петрова' : 'John Smith',
  method,
  image: method === 'drawn' ? PNG : null,
  signedAt: new Date('2026-10-20T10:00:00Z'),
  ip: '203.0.113.9',
  userAgent: 'LawBid/1.0 (Android 14)',
  docSha256: 'a'.repeat(64),
  journalHash: 'b'.repeat(64),
});

describe('signing pdf', () => {
  it('adds a signature page and a protocol page after the original', async () => {
    const src = await original(3);
    const pages = await renderSignaturePages({
      requestId: 'r1',
      caseId: 'c1',
      caseTitle: 'Lease dispute',
      documentTitle: 'Retainer',
      sourceSha256: createHash('sha256').update(src).digest('hex'),
      requestedBy: 'John Smith',
      requestedAt: new Date('2026-10-19T10:00:00Z'),
      signers: [signer('client', 'typed'), signer('attorney', 'drawn')],
    });
    expect((await PDFDocument.load(pages)).getPageCount()).toBe(2);
    const merged = await appendPages(src, pages);
    expect((await PDFDocument.load(merged)).getPageCount()).toBe(5);
    expect(merged.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('falls back to the typed name when the drawn image does not decode', async () => {
    const bad = {
      ...signer('client', 'drawn'),
      image: Buffer.from('not a png'),
    };
    const pages = await renderSignaturePages({
      requestId: 'r1',
      caseId: 'c1',
      caseTitle: 'x',
      documentTitle: 'y',
      sourceSha256: '0'.repeat(64),
      requestedBy: 'z',
      requestedAt: new Date(),
      signers: [bad],
    });
    expect((await PDFDocument.load(pages)).getPageCount()).toBe(2);
  });

  it('accepts only a readable PDF', async () => {
    expect(await isSignablePdf(await original(1))).toBe(true);
    expect(await isSignablePdf(Buffer.from('hello'))).toBe(false);
    expect(await isSignablePdf(Buffer.alloc(0))).toBe(false);
  });

  it('reads a PNG size and refuses anything else or huge', () => {
    expect(pngSize(PNG)).toEqual({ width: 1, height: 1 });
    expect(pngSize(Buffer.from('GIF89a......................'))).toBeNull();
    const big = Buffer.from(PNG);
    big.writeUInt32BE(5000, 16);
    expect(pngSize(big)).toBeNull();
  });
});

describe('other case pdfs', () => {
  it('renders an invoice with time, expenses and a total', async () => {
    const pdf = await renderInvoicePdf({
      number: 'LB-AAAA1111-001',
      issuedAt: new Date('2026-10-20T10:00:00Z'),
      caseTitle: 'Lease dispute',
      attorneyName: 'John Smith',
      clientName: 'Анна Петрова',
      currency: 'USD',
      lines: [
        {
          kind: 'time',
          date: '2026-10-19',
          text: 'Call',
          minutes: 45,
          rateCents: 20000,
          cents: 15000,
        },
        {
          kind: 'expense',
          date: '2026-10-19',
          text: 'Filing fee',
          cents: 4500,
        },
      ],
      minutes: 45,
      timeCents: 15000,
      expensesCents: 4500,
      totalCents: 19500,
      note: null,
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });

  it('spreads a long invoice over pages', async () => {
    const lines = Array.from({ length: 80 }, (_, i) => ({
      kind: 'time' as const,
      date: '2026-10-19',
      text: `Work item ${i}`,
      minutes: 15,
      rateCents: 20000,
      cents: 5000,
    }));
    const pdf = await renderInvoicePdf({
      number: 'LB-AAAA1111-002',
      issuedAt: new Date(),
      caseTitle: 'x',
      attorneyName: 'a',
      clientName: 'c',
      currency: 'USD',
      lines,
      minutes: 1200,
      timeCents: 400000,
      expensesCents: 0,
      totalCents: 400000,
      note: 'Thank you',
    });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(1);
  });

  it('renders a document with headings and paragraphs', async () => {
    const pdf = await renderDocumentPdf({
      title: 'Доверенность',
      text: '# Заголовок\n\nПервая строка\nВторая строка',
    });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });
});
