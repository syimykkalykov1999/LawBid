import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import jsQR from 'jsqr';
import { PDFDocument } from 'pdf-lib';
import PDFKitDocument from 'pdfkit';
import {
  documentLanguages,
  footerStamp,
  groupByDay,
  headlineTerms,
  offerHeadline,
  qrModules,
  renderDealRecordPdf,
  type RecordSignature,
} from './deal-record.pdf';
import {
  dealRecordVerifyUrl,
  maskName,
  verifyPage,
} from './deal-record.verify';
import {
  canonicalJson,
  recordCodeOf,
  snapshotSha256,
  type DealRecordSnapshot,
  type SnapshotOffer,
} from './deal-record.snapshot';
import {
  DealRecordTexts,
  DEAL_RECORD_CONSENT_KEYS,
  DEAL_RECORD_DEFAULT_LABELS,
  DEAL_RECORD_DEFAULT_TEXTS,
  DEAL_RECORD_LABEL_KEYS,
  DEAL_RECORD_TEXT_KEYS,
  FORBIDDEN_WORDS,
  type DealRecordLocalTexts,
  type SignedConsent,
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
 * order (the footers come last, from the second pass). The renderer may
 * try several type scales; only the kept (last) pass counts. */
async function drawnText(
  input: Parameters<typeof renderDealRecordPdf>[0],
): Promise<string[]> {
  let drawn: string[] = [];
  let last: string[] = [];
  const proto = PDFKitDocument.prototype as unknown as {
    text: (...a: unknown[]) => unknown;
    end: (...a: unknown[]) => unknown;
  };
  const real = proto.text;
  const realEnd = proto.end;
  const spy = jest.spyOn(proto, 'text').mockImplementation(function (
    this: unknown,
    ...args: unknown[]
  ) {
    if (typeof args[0] === 'string') drawn.push(args[0]);
    return real.apply(this, args);
  });
  const endSpy = jest.spyOn(proto, 'end').mockImplementation(function (
    this: unknown,
    ...args: unknown[]
  ) {
    last = drawn;
    drawn = [];
    return realEnd.apply(this, args);
  });
  try {
    await renderDealRecordPdf(input);
  } finally {
    spy.mockRestore();
    endSpy.mockRestore();
  }
  return last;
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

  it('a long verbatim history flows over pages, each with the footer band', async () => {
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
    expect(n).toBeGreaterThanOrEqual(2);
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

// ---------------------------------------------------------------------
// v2 (owner 2026-11-08): bilingual, consents, equal audit rows, QR, one page.
// ---------------------------------------------------------------------

/** The seed texts of one language (the translation pipeline's source). */
const seedOf = (lang: string): Record<string, string> =>
  JSON.parse(
    readFileSync(
      join(__dirname, '../../../prisma/seed/translations', `${lang}.json`),
      'utf8',
    ),
  ) as Record<string, string>;

const localOf = (lang: string): DealRecordLocalTexts => {
  const t = seedOf(lang);
  const labels: DealRecordLocalTexts['labels'] = {};
  for (const [name, key] of Object.entries(DEAL_RECORD_LABEL_KEYS)) {
    labels[name as keyof typeof DEAL_RECORD_LABEL_KEYS] = t[key];
  }
  return {
    lang,
    title: t[DEAL_RECORD_TEXT_KEYS.pdfTitle],
    notContract: t[DEAL_RECORD_TEXT_KEYS.pdfNotContract],
    terms: t[DEAL_RECORD_TEXT_KEYS.pdfTerms],
    footer: t[DEAL_RECORD_TEXT_KEYS.pdfFooter],
    labels,
  };
};

const consentsIn = (lang: string): SignedConsent[] => {
  const en = seedOf('en');
  const local = seedOf(lang);
  return DEAL_RECORD_CONSENT_KEYS.map((key) => ({
    key,
    en: en[key],
    local: lang === 'en' ? null : local[key],
  }));
};

const VERIFY_URL =
  'https://api.lawbid.dev/api/v1/deal-records/7b7d2f4e-1111-4222-8333-944455556666/verify';

/** A realistic sealed record: a Russian-speaking client, a Kyrgyz-speaking
 * attorney; the attorney's device is unknown (prints «—»). */
const v2Sigs: RecordSignature[] = [
  {
    ...sigs[0],
    device: 'iPhone 15 · ios · LawBid 1.4.0',
    authMethod: 'phone',
    lang: 'ru',
    consents: consentsIn('ru'),
  },
  {
    ...sigs[1],
    ip: '198.51.100.7',
    device: null,
    authMethod: 'phone_email',
    lang: 'ky',
    consents: consentsIn('ky'),
  },
];

describe('deal record PDF v2', () => {
  const s = snapshot(shortHistory);
  const sha = snapshotSha256(s);
  const v2 = {
    snapshot: s,
    recordCode: recordCodeOf(s.recordId, sha),
    snapshotSha256: sha,
    generatedAt: new Date('2026-10-27T20:02:00Z'),
    signatures: v2Sigs,
    local: { ru: localOf('ru'), ky: localOf('ky') },
    verifyUrl: VERIFY_URL,
  };

  it('a realistic sealed record (Russian-speaking client, English-speaking attorney; Kyrgyz/Russian case text) fits ONE page', async () => {
    const oneLocal = {
      ...v2,
      signatures: [
        v2Sigs[0],
        { ...v2Sigs[1], lang: 'en', consents: consentsIn('en') },
      ],
      local: { ru: localOf('ru') },
    };
    expect(await pages(await renderDealRecordPdf(oneLocal))).toBe(1);
    // The unsigned copy too.
    const unsigned = await renderDealRecordPdf({
      ...oneLocal,
      signatures: [],
      partyLangs: { client: 'ru', attorney: 'en' },
    });
    expect(await pages(unsigned)).toBe(1);
    // Three languages (ru client, ky attorney): at most two pages.
    expect(await pages(await renderDealRecordPdf(v2))).toBeLessThanOrEqual(2);
  });

  it('prints English and each signer language: headings, not-a-contract, Important, footer', async () => {
    const all = (await drawnText(v2)).join('\n');
    const ru = seedOf('ru');
    const ky = seedOf('ky');
    for (const t of [ru, ky]) {
      expect(all).toContain(t[DEAL_RECORD_TEXT_KEYS.pdfNotContract]);
      expect(all).toContain(t[DEAL_RECORD_TEXT_KEYS.pdfTerms]);
      expect(all).toContain(t[DEAL_RECORD_TEXT_KEYS.pdfFooter]);
    }
    expect(all).toContain('Payment terms · Условия оплаты · Төлөм шарттары');
    expect(all).toContain('Signatures · Подписи · Колдор');
    expect(all).toContain('Important · Важно · Маанилүү');
    expect(all).toContain('This is not a contract.');
  });

  it('the three consents are printed next to EACH signature with the time, in English and the signer language', async () => {
    const drawn = await drawnText(v2);
    const all = drawn.join('\n');
    const en = seedOf('en');
    for (const key of DEAL_RECORD_CONSENT_KEYS) {
      // English line under both signatures.
      expect(drawn.filter((d) => d === `✓ ${en[key]}`)).toHaveLength(2);
      expect(all).toContain(seedOf('ru')[key]);
      expect(all).toContain(seedOf('ky')[key]);
    }
    expect(all).toContain('Confirmed before signing');
    expect(all).toContain('2026-10-27 19:41 UTC');
    expect(all).toContain('2026-10-27 20:02 UTC');
  });

  it('both signers get the same audit rows: IP, device, sign-in verification; a gap prints «—»', async () => {
    const drawn = await drawnText(v2);
    expect(drawn).toContain('IP: 10.0.0.1');
    expect(drawn).toContain('IP: 198.51.100.7');
    const device = drawn.filter((d) => d.startsWith('Device · '));
    expect(device).toHaveLength(2);
    expect(device[0]).toMatch(/: iPhone 15 · ios · LawBid 1\.4\.0$/);
    expect(device[1]).toMatch(/: —$/);
    const verified = drawn.filter((d) => d.startsWith('Sign-in verified by'));
    expect(verified).toHaveLength(2);
    expect(verified[0]).toMatch(/: Phone · Телефон$/);
    expect(verified[1]).toMatch(
      /: Phone · Телефон, E-mail · Эл\. почта · Электрондук почта$/,
    );
    // A signature from before v2 (no audit) is not filled in.
    const legacy = await drawnText({
      ...v2,
      signatures: [{ ...sigs[0] }, { ...sigs[1] }],
    });
    expect(legacy.filter((d) => /: —$/.test(d)).length).toBeGreaterThanOrEqual(
      4,
    );
    expect(legacy).toContain('IP: —');
  });

  it('the QR drawn in the PDF decodes to the verify page URL', async () => {
    const rects: [number, number, number, number][] = [];
    const proto = PDFKitDocument.prototype as unknown as {
      rect: (...a: number[]) => unknown;
    };
    const real = proto.rect;
    const spy = jest.spyOn(proto, 'rect').mockImplementation(function (
      this: unknown,
      ...a: number[]
    ) {
      rects.push([a[0], a[1], a[2], a[3]]);
      return real.apply(this, a);
    });
    try {
      await renderDealRecordPdf(v2);
    } finally {
      spy.mockRestore();
    }
    const n = qrModules(VERIFY_URL).length;
    // QR squares: one module high, in the top-right corner.
    const qr = rects.filter(([x, y, , hh]) => x > 400 && y < 110 && hh < 3);
    expect(qr.length).toBeGreaterThan(20);
    const x0 = Math.min(...qr.map((r) => r[0]));
    const y0 = Math.min(...qr.map((r) => r[1]));
    const cell = qr[0][3];
    const grid = Array.from({ length: n }, () => Array<boolean>(n).fill(false));
    for (const [x, y, w] of qr) {
      const row = Math.round((y - y0) / cell);
      const from = Math.round((x - x0) / cell);
      for (let c = from; c < from + Math.round(w / cell); c++)
        grid[row][c] = true;
    }
    expect(grid).toEqual(qrModules(VERIFY_URL));
    // Rasterise with a quiet zone and decode with jsQR (Apache-2.0).
    const scale = 6;
    const side = (n + 8) * scale;
    const px = new Uint8ClampedArray(side * side * 4).fill(255);
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (grid[r][c])
          for (let dy = 0; dy < scale; dy++)
            for (let dx = 0; dx < scale; dx++) {
              const i =
                (((r + 4) * scale + dy) * side + (c + 4) * scale + dx) * 4;
              px[i] = px[i + 1] = px[i + 2] = 0;
            }
    expect(jsQR(px, side, side)?.data).toBe(VERIFY_URL);
  });

  it('the sealed hash still covers the final bytes: reproducible, and the record hash ignores the translations', async () => {
    const a = await renderDealRecordPdf(v2);
    const b = await renderDealRecordPdf(v2);
    const h = (x: Buffer) => createHash('sha256').update(x).digest('hex');
    expect(h(a)).toBe(h(b));
    // Any change to what is printed changes the file hash.
    const c = await renderDealRecordPdf({
      ...v2,
      signatures: [v2Sigs[0], { ...v2Sigs[1], ip: '198.51.100.8' }],
    });
    expect(h(c)).not.toBe(h(a));
    // The record code / snapshot hash is the data's, not the PDF's.
    expect(snapshotSha256(s)).toBe(sha);
  });

  it('a long record is at most two pages and never splits the signatures or Important', async () => {
    const long: SnapshotOffer[] = [];
    for (let i = 0; i < 8; i++) {
      long.push(
        offer(
          i,
          i % 2 === 0 ? 'attorney' : 'client',
          `2026-10-${String(10 + i).padStart(2, '0')}T1${i}:00:00.000Z`,
          `Round ${i}: ${'Подробное сообщение о сроках и документах, с пояснениями. '.repeat(4)}`,
        ),
      );
    }
    long.push(offer(8, 'client', '2026-10-27T19:40:00.000Z', null, 'accepted'));
    const input = { ...v2, snapshot: snapshot(long) };
    const pdf = await renderDealRecordPdf(input);
    expect(await pages(pdf)).toBeLessThanOrEqual(2);
    // Keep-together: every consent line is drawn after the Signatures
    // heading on the same page (no addPage between them).
    const events: string[] = [];
    const proto = PDFKitDocument.prototype as unknown as {
      text: (...a: unknown[]) => unknown;
      addPage: (...a: unknown[]) => unknown;
    };
    const realText = proto.text;
    const realAdd = proto.addPage;
    const t = jest.spyOn(proto, 'text').mockImplementation(function (
      this: unknown,
      ...a: unknown[]
    ) {
      if (typeof a[0] === 'string') events.push(a[0]);
      return realText.apply(this, a);
    });
    const p = jest.spyOn(proto, 'addPage').mockImplementation(function (
      this: unknown,
      ...a: unknown[]
    ) {
      events.push('<page>');
      return realAdd.apply(this, a);
    });
    try {
      await renderDealRecordPdf(input);
    } finally {
      t.mockRestore();
      p.mockRestore();
    }
    const last = events;
    const run = events.slice(
      events.findLastIndex((e) => e.startsWith('Signatures')),
    );
    const until = run.findIndex((e) => e.startsWith('Important'));
    expect(until).toBeGreaterThan(0);
    expect(run.slice(0, until)).not.toContain('<page>');
    expect(last.length).toBeGreaterThan(0);
  });
});

describe('deal record texts v2', () => {
  it('local() and consentsFor() read the admin texts; a missing translation is null, never invented', async () => {
    const rows = [
      { lang: 'ru', key: DEAL_RECORD_TEXT_KEYS.pdfTerms, value: 'Важно РУ' },
      { lang: 'ru', key: DEAL_RECORD_LABEL_KEYS.case, value: 'Дело' },
      {
        lang: 'en',
        key: DEAL_RECORD_TEXT_KEYS.consentPlatform,
        value: 'EN edited',
      },
      { lang: 'ru', key: DEAL_RECORD_TEXT_KEYS.consentPlatform, value: 'РУ' },
    ];
    const prisma = {
      i18nTranslation: {
        findMany: jest.fn((q: { where: { lang: { in: string[] } } }) =>
          Promise.resolve(
            rows
              .filter((r) => q.where.lang.in.includes(r.lang))
              .map((r) => ({
                lang: r.lang,
                value: r.value,
                i18n_key: { key: r.key },
              })),
          ),
        ),
      },
    };
    const texts = new DealRecordTexts(prisma as never);
    const local = await texts.local(['ru', 'en', null, 'RU']);
    expect(Object.keys(local)).toEqual(['ru']);
    expect(local.ru.terms).toBe('Важно РУ');
    expect(local.ru.footer).toBeNull();
    expect(local.ru.labels.case).toBe('Дело');
    expect(local.ru.labels.client).toBeUndefined();
    const consents = await texts.consentsFor('ru');
    expect(consents.map((c) => c.key)).toEqual([...DEAL_RECORD_CONSENT_KEYS]);
    expect(consents[1]).toEqual({
      key: DEAL_RECORD_TEXT_KEYS.consentPlatform,
      en: 'EN edited',
      local: 'РУ',
    });
    expect(consents[0].local).toBeNull();
    expect((await texts.consentsFor('en'))[0].local).toBeNull();
    expect(
      documentLanguages({
        signatures: [],
        partyLangs: { client: 'ru', attorney: 'de' },
        local,
      }),
    ).toEqual(['ru']);
  });

  it('every label key has a translation in every seed language', () => {
    const en = seedOf('en');
    for (const key of Object.values(DEAL_RECORD_LABEL_KEYS)) {
      expect(en[key]).toBe(
        DEAL_RECORD_DEFAULT_LABELS[
          Object.entries(DEAL_RECORD_LABEL_KEYS).find(
            ([, k]) => k === key,
          )![0] as keyof typeof DEAL_RECORD_LABEL_KEYS
        ],
      );
      for (const lang of ['ru', 'ky', 'zh', 'ar'])
        expect(seedOf(lang)[key]).toBeTruthy();
    }
  });
});

describe('deal record verify page', () => {
  const view = {
    recordCode: '7b7d2f4e-8964c85c',
    client: maskName('Anna Ivanova'),
    attorney: maskName('John Doe'),
    status: 'sealed',
    createdAt: new Date('2026-10-27T19:40:00Z'),
    sealedAt: new Date('2026-10-27T20:02:00Z'),
    snapshotSha256: 'a'.repeat(64),
    unsignedSha256: 'b'.repeat(64),
    sealedSha256: 'c'.repeat(64),
  };

  it('shows only non-sensitive facts: masked parties, code, fingerprints', () => {
    expect(maskName('Anna Ivanova')).toBe('Anna I.');
    expect(maskName('Жылдыз Асанова')).toBe('Жылдыз А.');
    expect(maskName('@anna')).toBe('@a…');
    const { status, html, csp } = verifyPage(view);
    expect(status).toBe(200);
    expect(html).toContain('Anna I.');
    expect(html).not.toContain('Ivanova');
    expect(html).toContain('c'.repeat(64));
    expect(html).toContain('7b7d2f4e-8964c85c');
    expect(html).not.toMatch(/@example\.com/);
    expect(csp).toMatch(/script-src 'nonce-[^']+'/);
    expect(html).toContain(`nonce="${/nonce-([^']+)/.exec(csp)![1]}"`);
  });

  it('a fingerprint in the link is compared on the server: authentic / changed; unknown id is not found', () => {
    expect(verifyPage(view, 'C'.repeat(64)).html).toContain('Authentic');
    expect(verifyPage(view, 'd'.repeat(64)).html).toContain('Changed');
    expect(verifyPage(null).status).toBe(404);
    expect(dealRecordVerifyUrl('https://api.lawbid.dev/api/v1/', 'x')).toBe(
      'https://api.lawbid.dev/api/v1/deal-records/x/verify',
    );
  });
});
