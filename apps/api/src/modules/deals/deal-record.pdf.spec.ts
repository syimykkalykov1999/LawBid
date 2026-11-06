import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import PDFKitDocument from 'pdfkit';
import {
  footerStamp,
  groupByDay,
  headlineTerms,
  offerHeadline,
  renderDealRecordPdf,
  type RecordSignature,
} from './deal-record.pdf';
import {
  canonicalJson,
  recordCodeOf,
  snapshotSha256,
  type DealRecordSnapshot,
  type SnapshotOffer,
} from './deal-record.snapshot';
import {
  DealRecordTexts,
  DEAL_RECORD_DEFAULT_TEXTS,
  DEAL_RECORD_TEXT_KEYS,
  FORBIDDEN_WORDS,
} from './deal-record-texts';

const offer = (
  roundNo: number,
  fromRole: 'client' | 'attorney',
  createdAt: string,
  message: string | null,
  status = 'countered',
): SnapshotOffer => ({
  roundNo,
  fromRole,
  createdAt,
  feeType: 'fixed',
  amountCents: 250_000 - roundNo * 10_000,
  percentBps: null,
  paymentTerms: null,
  message,
  status,
});

const snapshot = (history: SnapshotOffer[]): DealRecordSnapshot => ({
  version: 1,
  recordId: '7b7d2f4e-1111-4222-8333-944455556666',
  case: {
    id: 'c1',
    title: 'Развод и раздел имущества — ажырашуу (ң ө ү)',
    practice: 'Family',
    states: ['NY'],
  },
  client: {
    id: 'u1',
    fullName: 'Anna Ivanova',
    email: 'anna@example.com',
    username: 'anna',
  },
  attorney: {
    id: 'u2',
    fullName: 'John Doe',
    email: 'john@example.com',
    username: 'johndoe',
    barState: 'NY',
    barNumber: '1234567',
    firmName: 'Doe & Partners',
  },
  acceptedBy: 'client',
  acceptedAt: '2026-10-27T19:40:00.000Z',
  terms: {
    feeType: 'fixed',
    amountCents: 230_000,
    percentBps: null,
    paymentTerms: {
      version: 1,
      type: 'retainer_plus_installments',
      currency: 'USD',
      retainerCents: 100_000,
      installmentCents: 65_000,
      installmentCount: 2,
      installmentPeriod: 'monthly',
      notes: 'Court fees at cost.',
    },
  },
  history,
  texts: {
    notContract:
      DEAL_RECORD_DEFAULT_TEXTS[DEAL_RECORD_TEXT_KEYS.pdfNotContract],
    footer: DEAL_RECORD_DEFAULT_TEXTS[DEAL_RECORD_TEXT_KEYS.pdfFooter],
    terms: DEAL_RECORD_DEFAULT_TEXTS[DEAL_RECORD_TEXT_KEYS.pdfTerms],
    textVersion: 0,
  },
});

// A 1x1 transparent PNG (valid, decodes in pdfkit).
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const sigs: RecordSignature[] = [
  {
    role: 'client',
    name: 'Anna Ivanova',
    image: PNG_1x1,
    signedAt: new Date('2026-10-27T19:41:00Z'),
    ip: '10.0.0.1',
  },
  {
    role: 'attorney',
    name: 'John Doe',
    image: PNG_1x1,
    signedAt: new Date('2026-10-27T20:02:00Z'),
    ip: null,
  },
];

const shortHistory = [
  offer(
    0,
    'attorney',
    '2026-10-25T14:02:00.000Z',
    'Flat fee, filing included. Документы подготовлю за неделю.',
  ),
  offer(1, 'client', '2026-10-25T18:30:00.000Z', 'Can you do 2,400?'),
  offer(2, 'attorney', '2026-10-27T19:40:00.000Z', null, 'accepted'),
];

/** PDFKit writes glyph ids, not plain text: collect what is drawn, in
 * order (the footers come last, from the second pass). */
async function drawnText(
  input: Parameters<typeof renderDealRecordPdf>[0],
): Promise<string[]> {
  const drawn: string[] = [];
  const proto = PDFKitDocument.prototype as unknown as {
    text: (...a: unknown[]) => unknown;
  };
  const real = proto.text;
  const spy = jest.spyOn(proto, 'text').mockImplementation(function (
    this: unknown,
    ...args: unknown[]
  ) {
    if (typeof args[0] === 'string') drawn.push(args[0]);
    return real.apply(this, args);
  });
  try {
    await renderDealRecordPdf(input);
  } finally {
    spy.mockRestore();
  }
  return drawn;
}

const pages = async (pdf: Buffer) =>
  (await PDFDocument.load(pdf)).getPageCount();

describe('deal record snapshot hashing', () => {
  it('canonical JSON ignores key order and undefined', () => {
    expect(
      canonicalJson({ b: 1, a: { d: undefined, c: [2, { z: 1, y: 2 }] } }),
    ).toBe('{"a":{"c":[2,{"y":2,"z":1}]},"b":1}');
    const s = snapshot(shortHistory);
    const shuffled = JSON.parse(JSON.stringify(s)) as DealRecordSnapshot;
    expect(snapshotSha256(shuffled)).toBe(snapshotSha256(s));
    expect(recordCodeOf(s.recordId, snapshotSha256(s))).toMatch(
      /^7b7d2f4e-[0-9a-f]{8}$/,
    );
  });
});

describe('deal record PDF text helpers', () => {
  it('headlines come from the data only', () => {
    expect(
      headlineTerms({
        feeType: 'fixed',
        amountCents: 250_000,
        percentBps: null,
      }),
    ).toBe('Flat fee $2,500.00');
    expect(
      headlineTerms({
        feeType: 'hourly',
        amountCents: 35_000,
        percentBps: null,
      }),
    ).toBe('Hourly rate $350.00 per hour');
    expect(
      headlineTerms({
        feeType: 'contingency',
        amountCents: 0,
        percentBps: 3333,
      }),
    ).toBe('Contingency fee 33.33 %');
    expect(
      headlineTerms({
        feeType: 'free_consultation',
        amountCents: 0,
        percentBps: null,
      }),
    ).toBe('Free consultation');
    expect(offerHeadline(shortHistory[0], 'client')).toBe(
      'Attorney · offer · Flat fee $2,500.00',
    );
    expect(offerHeadline(shortHistory[1], 'client')).toBe(
      'Client · counter-offer · Flat fee $2,400.00',
    );
    expect(offerHeadline(shortHistory[2], 'client')).toBe(
      'Attorney · Flat fee $2,300.00 · accepted by the client',
    );
  });

  it('groups the history by UTC day in order', () => {
    expect(
      groupByDay(shortHistory).map((g) => [g.day, g.offers.length]),
    ).toEqual([
      ['2026-10-25', 2],
      ['2026-10-27', 1],
    ]);
  });

  it('footer stamp has the code, the date and Page N of M', () => {
    expect(
      footerStamp('7b7d2f4e-abcdef01', new Date('2026-10-27T20:02:00Z'), 2, 3),
    ).toBe('Record 7b7d2f4e-abcdef01 · 2026-10-27 · Page 2 of 3');
  });

  it('the footer says the platform is no party, no intermediary and takes no share (owner 2026-10-27)', () => {
    const footer = DEAL_RECORD_DEFAULT_TEXTS[DEAL_RECORD_TEXT_KEYS.pdfFooter];
    expect(footer).toContain('is not a party to your agreement');
    expect(footer).toContain('is not an intermediary');
    expect(footer).toContain(
      'does not handle or take any part of any payment or fee',
    );
    expect(footer).toContain('is not responsible for the result');
  });

  it('the built-in texts never use the forbidden words', () => {
    const all = Object.values(DEAL_RECORD_DEFAULT_TEXTS)
      .join(' ')
      .toLowerCase();
    for (const w of FORBIDDEN_WORDS) expect(all).not.toContain(w);
  });
});

describe('renderDealRecordPdf', () => {
  const s = snapshot(shortHistory);
  const sha = snapshotSha256(s);
  const base = {
    snapshot: s,
    recordCode: recordCodeOf(s.recordId, sha),
    snapshotSha256: sha,
    generatedAt: new Date('2026-10-27T20:02:00Z'),
  };

  it('renders an unsigned record with Cyrillic and Kyrgyz letters (short: at most 2 pages with the R-392 disclaimer block)', async () => {
    const pdf = await renderDealRecordPdf({ ...base, signatures: [] });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(await pages(pdf)).toBeLessThanOrEqual(2);
    expect(pdf.length).toBeLessThan(400_000);
  });

  it('renders the sealed record with both signatures and is byte-for-byte reproducible', async () => {
    const a = await renderDealRecordPdf({ ...base, signatures: sigs });
    const b = await renderDealRecordPdf({ ...base, signatures: sigs });
    const h = (x: Buffer) => createHash('sha256').update(x).digest('hex');
    expect(h(a)).toBe(h(b));
    expect(await pages(a)).toBeGreaterThanOrEqual(1);
  });

  it('a long verbatim history flows over several pages, each with the footer band', async () => {
    const long: SnapshotOffer[] = [];
    for (let i = 0; i < 9; i++) {
      long.push(
        offer(
          i,
          i % 2 === 0 ? 'attorney' : 'client',
          `2026-10-${String(10 + i).padStart(2, '0')}T1${i}:00:00.000Z`,
          `Round ${i}: ${'Very long message with Cyrillic — очень длинное сообщение, повтор. '.repeat(14)}`,
        ),
      );
    }
    long.push(offer(9, 'client', '2026-10-27T19:40:00.000Z', null, 'accepted'));
    const pdf = await renderDealRecordPdf({
      ...base,
      snapshot: snapshot(long),
      signatures: sigs,
    });
    const n = await pages(pdf);
    expect(n).toBeGreaterThanOrEqual(3);
    // pdf-lib sees the footer on every page as content below the body band.
    const doc = await PDFDocument.load(pdf);
    for (const p of doc.getPages()) expect(p.getHeight()).toBe(792);
  });

  it('R-392: the sealed PDF prints the whole bargaining — every offer, price, terms, message — the agreed terms, both signatures and the non-intermediary text', async () => {
    const drawn = await drawnText({ ...base, signatures: sigs });
    const all = drawn.join('\n');
    expect(all).toContain('Offer history');
    // Every round of the negotiation, with who / what / how much.
    expect(all).toContain('Attorney · offer · Flat fee $2,500.00');
    expect(all).toContain('Client · counter-offer · Flat fee $2,400.00');
    expect(all).toContain(
      'Attorney · Flat fee $2,300.00 · accepted by the client',
    );
    // The messages verbatim.
    expect(all).toContain('Can you do 2,400?');
    expect(all).toContain('Документы подготовлю за неделю.');
    // The agreed terms (with the retainer / installments).
    expect(all).toContain('Payment terms');
    expect(all).toMatch(/Flat fee \$2,300\.00/);
    // Both signatures and R-134 (no intermediary, no share of payments).
    expect(all).toContain('Anna Ivanova');
    expect(all).toContain('John Doe');
    expect(all).not.toContain('Not signed yet');
    expect(all).toContain('is not an intermediary');
    expect(all).toContain('This is not a contract.');
    // R-392 order: parties → agreed terms → history → signatures →
    // the disclaimer block (footers on every page come last).
    const at = (x: string) => drawn.findIndex((d) => d.includes(x));
    const order = [
      at('Anna Ivanova'),
      at('Payment terms'),
      at('Offer history'),
      at('Signatures'),
      at('Important'),
      at('no payment for legal services is made inside the LawBid app'),
    ];
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
  });

  it('R-392: every text the owner edits in admin «Запись о сделке» is what the PDF prints', async () => {
    const edited: Record<string, string> = {
      [DEAL_RECORD_TEXT_KEYS.pdfTitle]: 'Admin title 7781',
      [DEAL_RECORD_TEXT_KEYS.pdfNotContract]: 'Admin not-a-contract 7782',
      [DEAL_RECORD_TEXT_KEYS.pdfFooter]: 'Admin footer 7783',
      [DEAL_RECORD_TEXT_KEYS.pdfTerms]: 'Admin disclaimer block 7784',
    };
    const prisma = {
      i18nTranslation: {
        findMany: jest.fn(() =>
          Promise.resolve(
            Object.entries(edited).map(([key, value]) => ({
              value,
              version: 3,
              i18n_key: { key },
            })),
          ),
        ),
      },
    };
    const texts = await new DealRecordTexts(prisma as never).pdf();
    expect(texts.textVersion).toBe(3);
    const s2 = snapshot(shortHistory);
    s2.texts = {
      notContract: texts.notContract,
      footer: texts.footer,
      terms: texts.terms,
      textVersion: texts.textVersion,
    };
    const all = (
      await drawnText({
        ...base,
        snapshot: s2,
        signatures: sigs,
        title: texts.title,
      })
    ).join('\n');
    for (const v of Object.values(edited)) expect(all).toContain(v);
    // A text the admin left empty falls back to the built-in wording.
    prisma.i18nTranslation.findMany.mockReturnValueOnce(Promise.resolve([]));
    const defaults = await new DealRecordTexts(prisma as never).pdf();
    expect(defaults.terms).toBe(
      DEAL_RECORD_DEFAULT_TEXTS[DEAL_RECORD_TEXT_KEYS.pdfTerms],
    );
  });

  it('a signature whose PNG does not decode falls back to the typed name', async () => {
    const broken: RecordSignature[] = [
      { ...sigs[0], image: Buffer.from('not a png') },
      sigs[1],
    ];
    const pdf = await renderDealRecordPdf({ ...base, signatures: broken });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
