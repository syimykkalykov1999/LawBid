import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import PDFKitDocument from 'pdfkit';
import sharp from 'sharp';
import {
  BRIEF_MAX_PHOTOS,
  briefHeadline,
  contactLines,
  renderAttorneyBriefPdf,
  type RenderAttorneyBriefInput,
} from './attorney-brief.pdf';
import { briefFileIdOf, uuidV5 } from './attorney-brief.service';

/** A solid-colour PNG with alpha (the hard case for reproducible bytes). */
const png = (r: number, g: number, b: number): Promise<Buffer> =>
  sharp({
    create: {
      width: 40,
      height: 30,
      channels: 4,
      background: { r, g, b, alpha: 0.6 },
    },
  })
    .png()
    .toBuffer();

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

async function base(photoCount: number): Promise<RenderAttorneyBriefInput> {
  const photos: Buffer[] = [];
  for (let i = 0; i < photoCount; i++)
    photos.push(await png(i * 20, 90, 200 - i * 10));
  return {
    caseTitle: 'Speeding ticket in Trenton — штраф (ң ө ү)',
    caseCode: 'AB12CD34',
    attorneyName: 'John Smith',
    contact: {
      name: 'Анна Петрова',
      phone: '+12015550123',
      email: 'anna@example.com',
      preferredMethod: 'sms',
      preferredNote: 'After 6 pm',
    },
    terms: {
      feeType: 'fixed',
      amountCents: 60_000,
      percentBps: null,
      paymentTerms: {
        version: 1,
        currency: 'USD',
        type: 'mixed',
        flatCents: 60_000,
        retainerCents: 20_000,
      },
    },
    photos,
    acceptedAt: new Date('2026-11-09T10:00:00.000Z'),
    lang: 'ru',
  };
}

async function drawn(
  input: RenderAttorneyBriefInput,
): Promise<{ text: string[]; images: number }> {
  const text: string[] = [];
  let images = 0;
  const proto = PDFKitDocument.prototype as unknown as {
    text: (...a: unknown[]) => unknown;
    image: (...a: unknown[]) => unknown;
  };
  const realText = proto.text;
  const realImage = proto.image;
  const t = jest.spyOn(proto, 'text').mockImplementation(function (
    this: unknown,
    ...a: unknown[]
  ) {
    if (typeof a[0] === 'string') text.push(a[0]);
    return realText.apply(this, a);
  });
  const i = jest.spyOn(proto, 'image').mockImplementation(function (
    this: unknown,
    ...a: unknown[]
  ) {
    images += 1;
    return realImage.apply(this, a);
  });
  try {
    await renderAttorneyBriefPdf(input);
  } finally {
    t.mockRestore();
    i.mockRestore();
  }
  return { text, images };
}

describe('attorney brief PDF (sweep A-c1)', () => {
  it('renders a valid PDF with the client contacts, the accepted terms and the photos', async () => {
    const input = await base(3);
    const pdf = await renderAttorneyBriefPdf(input);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    const { text, images } = await drawn(input);
    const all = text.join('\n');
    expect(all).toContain('Анна Петрова');
    expect(all).toContain('+12015550123');
    expect(all).toContain('anna@example.com');
    expect(all).toContain('Text message');
    expect(all).toContain('After 6 pm');
    expect(all).toContain('Flat fee $600.00');
    expect(all).toContain('Retainer $200.00.');
    expect(images).toBe(3);
  });

  it('prints at most 9 photos', async () => {
    const { images } = await drawn(await base(12));
    expect(images).toBe(BRIEF_MAX_PHOTOS);
  });

  it('is byte-for-byte the same for the same case (photos with alpha included)', async () => {
    const input = await base(9);
    const a = await renderAttorneyBriefPdf(input);
    const b = await renderAttorneyBriefPdf(input);
    expect(sha(a)).toBe(sha(b));
  });

  it('skips a file that is not an image instead of failing', async () => {
    const input = await base(1);
    input.photos.push(Buffer.from('not an image'));
    const { images } = await drawn(input);
    expect(images).toBe(1);
  });

  it('without photos or contacts still renders, with a dash and a note', async () => {
    const input = await base(0);
    input.contact = {
      name: null,
      phone: null,
      email: null,
      preferredMethod: null,
      preferredNote: null,
    };
    const { text } = await drawn(input);
    expect(text).toContain('—');
    expect(text).toContain('No photos in this case.');
  });

  it('headline and contact lines follow the data only', () => {
    expect(
      briefHeadline({
        feeType: 'hourly',
        amountCents: 25_000,
        percentBps: null,
        paymentTerms: null,
      }),
    ).toBe('Hourly rate $250.00 per hour');
    expect(
      briefHeadline({
        feeType: 'contingency',
        amountCents: 0,
        percentBps: 3_350,
        paymentTerms: null,
      }),
    ).toBe('Contingency fee 33.5 %');
    expect(
      contactLines({
        name: 'A',
        phone: null,
        email: null,
        preferredMethod: 'in_app_chat',
        preferredNote: null,
      }),
    ).toEqual([
      ['Name', 'A'],
      ['Preferred contact', 'In-app chat'],
    ]);
  });

  it('the brief file id is one per bid (RFC 4122 v5)', () => {
    // The RFC 4122 / uuid-package reference vector: v5("www.example.com", DNS).
    expect(
      uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'),
    ).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
    const a = briefFileIdOf('8d2f1b6e-1111-4c2a-9a0e-000000000001');
    expect(a).toBe(briefFileIdOf('8d2f1b6e-1111-4c2a-9a0e-000000000001'));
    expect(a).not.toBe(briefFileIdOf('8d2f1b6e-1111-4c2a-9a0e-000000000002'));
    expect(a[14]).toBe('5');
  });
});
