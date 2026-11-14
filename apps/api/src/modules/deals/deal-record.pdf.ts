import {
  GOLD,
  MUTED,
  NAVY,
  money,
  startPdf,
  stamp,
} from '../cases/cases.public';
import QRCode from 'qrcode';
import {
  newPdfLayoutCache,
  type PdfLayoutCache,
} from '../../common/pdf-fonts/pdf-fonts';
import sharp from 'sharp';
import { describePaymentTerms } from '../bids/bids.public';
import {
  DEAL_RECORD_DEFAULT_LABELS,
  localLang,
  type DealRecordLabel,
  type DealRecordLocalTexts,
  type SignedConsent,
} from './deal-record-texts';
import type { DealRecordSnapshot, SnapshotOffer } from './deal-record.snapshot';

/** How the signer's sign-in identity was verified (case_signatures.auth_method). */
export type SignerAuthMethod = 'phone' | 'email' | 'phone_email';

/** One side's signature as printed (full on the page, initials in the footer). */
export interface RecordSignature {
  role: 'client' | 'attorney';
  name: string;
  /** PNG with alpha from the app's pad; null falls back to the typed name. */
  image: Buffer | null;
  signedAt: Date;
  ip: string | null;
  /** v2 (owner 2026-11-08): the same audit rows for both signers; a gap
   * prints «—», nothing is ever filled in. */
  device?: string | null;
  authMethod?: SignerAuthMethod | null;
  /** The signer's app language at signing. */
  lang?: string | null;
  /** The three consent lines shown above «Confirm», as shown. */
  consents?: SignedConsent[] | null;
}

export interface RenderDealRecordInput {
  snapshot: DealRecordSnapshot;
  recordCode: string;
  /** Hex SHA-256 of the canonical snapshot (part of the record code). */
  snapshotSha256: string;
  /** Both signatures → the sealed document (initials on every page). */
  signatures: RecordSignature[];
  /** Printed as the document date and fixed into the PDF Info, so the same
   * input renders byte for byte the same (the hash is reproducible). */
  generatedAt: Date;
  /** The English title (admin text; default "Deal record — LawBid"). */
  title?: string;
  /** v2: the English headings (admin texts); defaults when absent. */
  labels?: Partial<Record<DealRecordLabel, string>>;
  /** v2: each party's language before they sign (users.ui_language); a
   * signature's own `lang` wins. English / unset = English only. */
  partyLangs?: Partial<Record<'client' | 'attorney', string | null>>;
  /** v2: the texts in each party's language (DealRecordTexts.local). */
  local?: Record<string, DealRecordLocalTexts>;
  /** v2: the authenticity-check page the QR opens (deal-record.verify.ts). */
  verifyUrl?: string;
}

const BORDER = '#B9C0CF';
const LIGHT = '#7A8396';
/** v2 (owner mockup 2026-11-08): signature boxes 50 high (was 86). */
export const SIGNATURE_BOX_HEIGHT = 50;
const QR_SIZE = 62;

const ROLE_LABEL = { client: 'Client', attorney: 'Attorney' } as const;
const FEE_LABEL = {
  fixed: 'Flat fee',
  hourly: 'Hourly rate',
  free_consultation: 'Free consultation',
  contingency: 'Contingency fee',
} as const;

/** `2026-10-27` from an ISO string (UTC). */
const dayOf = (iso: string): string => iso.slice(0, 10);
/** `14:02 UTC` from an ISO string. */
const timeOf = (iso: string): string => `${iso.slice(11, 16)} UTC`;

const pct = (bps: number): string =>
  `${(bps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} %`;

/** The headline of an offer / the accepted terms, from the data only. */
export function headlineTerms(t: {
  feeType: keyof typeof FEE_LABEL;
  amountCents: number;
  percentBps: number | null;
}): string {
  if (t.feeType === 'free_consultation') return FEE_LABEL.free_consultation;
  if (t.feeType === 'contingency') {
    return `${FEE_LABEL.contingency} ${t.percentBps === null ? '—' : pct(t.percentBps)}`;
  }
  const amount = money(t.amountCents);
  return t.feeType === 'hourly'
    ? `${FEE_LABEL.hourly} ${amount} per hour`
    : `${FEE_LABEL.fixed} ${amount}`;
}

/** What one history row says about itself, before the verbatim message. */
export function offerHeadline(o: SnapshotOffer, acceptedBy: string): string {
  const who = ROLE_LABEL[o.fromRole];
  if (o.status === 'accepted') {
    const by = ROLE_LABEL[acceptedBy as 'client' | 'attorney'] ?? acceptedBy;
    return `${who} · ${headlineTerms(o)} · accepted by the ${by.toLowerCase()}`;
  }
  const kind = o.roundNo === 0 ? 'offer' : 'counter-offer';
  return `${who} · ${kind} · ${headlineTerms(o)}`;
}

/** Offers grouped by UTC day, in the order they happened. */
export function groupByDay(
  history: readonly SnapshotOffer[],
): { day: string; offers: SnapshotOffer[] }[] {
  const groups: { day: string; offers: SnapshotOffer[] }[] = [];
  for (const o of [...history].sort((a, b) => a.roundNo - b.roundNo)) {
    const day = dayOf(o.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.offers.push(o);
    else groups.push({ day, offers: [o] });
  }
  return groups;
}

/** The footer's one-line stamp: `Record <code> · <date> · Page N of M`. */
export const footerStamp = (
  code: string,
  generatedAt: Date,
  page: number,
  total: number,
): string =>
  `Record ${code} · ${generatedAt.toISOString().slice(0, 10)} · Page ${page} of ${total}`;

/** The QR modules of `text` (qrcode, MIT): true = dark. */
export function qrModules(text: string): boolean[][] {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const rows: boolean[][] = [];
  for (let r = 0; r < modules.size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < modules.size; c++) row.push(!!modules.get(r, c));
    rows.push(row);
  }
  return rows;
}

/** Draws the QR as vector squares (one rect per dark run of a row). */
function drawQr(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  size: number,
): void {
  const m = qrModules(text);
  const cell = size / m.length;
  doc.save();
  doc.fillColor('#000000');
  for (let r = 0; r < m.length; r++) {
    let c = 0;
    while (c < m.length) {
      if (!m[r][c]) {
        c++;
        continue;
      }
      const from = c;
      while (c < m.length && m[r][c]) c++;
      doc.rect(x + from * cell, y + r * cell, (c - from) * cell, cell);
    }
  }
  doc.fill();
  doc.restore();
}

/** The languages printed next to English, in party order (client first). */
export function documentLanguages(input: {
  signatures: readonly Pick<RecordSignature, 'role' | 'lang'>[];
  partyLangs?: RenderDealRecordInput['partyLangs'];
  local?: RenderDealRecordInput['local'];
}): string[] {
  const out: string[] = [];
  for (const role of ['client', 'attorney'] as const) {
    const sig = input.signatures.find((z) => z.role === role);
    const lang = localLang(sig?.lang ?? input.partyLangs?.[role]);
    if (lang && input.local?.[lang] && !out.includes(lang)) out.push(lang);
  }
  return out;
}

/**
 * Deal record 2026-10-27 (plan §3), v2 2026-11-08 (owner, mockup
 * docs/dev/owner_review/deal_record_onepage.pdf): the document. One pass
 * writes the body with pages buffered; a second pass puts the footer
 * (admin text, record code, date, initials once both signed, "Page N of
 * M") on every page. The recorded data comes from the snapshot verbatim;
 * every sentence and heading is printed in English and then in each
 * signer's language (admin-editable texts). A realistic record fits one
 * page: 50-high signature boxes, «Important» right under the signatures,
 * the QR of the authenticity check in the header.
 */
export async function renderDealRecordPdf(
  input: RenderDealRecordInput,
): Promise<Buffer> {
  // PDFKit embeds a PNG with alpha asynchronously (zlib split of the alpha
  // channel), so object numbers raced and the same input could render
  // different bytes — the record hash was not reproducible (CI red
  // 2026-10-28). Signatures sit on white paper: flatten them to opaque RGB
  // first, which PDFKit embeds synchronously and deterministically.
  const signatures = await Promise.all(
    input.signatures.map(async (z) => ({
      ...z,
      image: z.image ? await flattenPng(z.image) : z.image,
    })),
  );
  // One page is the goal (owner 2026-11-08): the same layout at up to three
  // type scales; the fewest pages wins, then the largest type. Blocks never
  // split (keep-together below), so a long record is two whole pages.
  // The passes print the same words: each word is shaped once (fontkit
  // shaping was ~2/3 of the render time, profile 13.11).
  const layoutCache = newPdfLayoutCache();
  let best: { pdf: Buffer; pages: number } | null = null;
  for (const scale of TYPE_SCALES) {
    const out = await renderFlattened(
      { ...input, signatures },
      scale,
      layoutCache,
    );
    if (!best || out.pages < best.pages) best = out;
    if (out.pages === 1) break;
  }
  return best!.pdf;
}

/** Type scales tried in order (the smallest line stays ~6 pt). */
const TYPE_SCALES = [1, 0.93, 0.86] as const;
/** Side margins (pt): narrower than the other LawBid PDFs to fit one page. */
const SIDE_MARGIN = 44;

async function flattenPng(png: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(png)
      .flatten({ background: '#ffffff' })
      .png({ compressionLevel: 9, adaptiveFiltering: false })
      .toBuffer();
  } catch {
    return null; // a bad PNG falls back to the typed name
  }
}

const AUTH_PARTS: Record<SignerAuthMethod, ('phone' | 'email')[]> = {
  phone: ['phone'],
  email: ['email'],
  phone_email: ['phone', 'email'],
};

/** Distinct non-empty texts, the first one kept first. */
const distinct = (xs: readonly (string | null | undefined)[]): string[] => {
  const out: string[] = [];
  for (const x of xs) {
    const t = x?.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
};

async function renderFlattened(
  input: RenderDealRecordInput,
  scale: number,
  layoutCache: PdfLayoutCache,
): Promise<{ pdf: Buffer; pages: number }> {
  const { snapshot: s, signatures } = input;
  const title = input.title ?? 'Deal record — LawBid';
  const L: Record<DealRecordLabel, string> = {
    ...DEAL_RECORD_DEFAULT_LABELS,
    ...input.labels,
  };
  const langs = documentLanguages(input);
  const locals = langs.map((l) => input.local![l]);
  /** A heading in English, then in each document language: `Case · Дело`. */
  const both = (k: DealRecordLabel): string =>
    distinct([L[k], ...locals.map((t) => t.labels[k])]).join(' · ');
  const { doc, done } = startPdf({
    title,
    bufferPages: true,
    creationDate: input.generatedAt,
    lang: langs[0],
    layoutCache,
  });
  if (scale !== 1) {
    const setSize = doc.fontSize.bind(doc);
    doc.fontSize = (size: number) => setSize(size * scale);
  }
  const left = SIDE_MARGIN;
  const width = doc.page.width - 2 * SIDE_MARGIN;
  const sealed = signatures.length >= 2;
  const maxY = () => doc.page.height - doc.page.margins.bottom;
  /** Keep-together: a block that does not fit starts on a new page. */
  const keep = (height: number) => {
    if (doc.y + height > maxY() && doc.y > doc.page.margins.top + 1) {
      doc.addPage();
    }
  };
  const h = (text: string, size: number, w: number) =>
    doc.fontSize(size).heightOfString(text, { width: w });

  // ---- footer band: measured first, reserved on every page -----------
  // English on every page; the translations are printed once, after
  // «Important» (the band stays small, the page count low).
  const footerTexts = [s.texts.footer];
  const localFooters = distinct(locals.map((t) => t.footer)).filter(
    (t) => t !== s.texts.footer.trim(),
  );
  doc.fontSize(6.5);
  const footerTextH = Math.ceil(
    footerTexts.reduce((h, t) => h + doc.heightOfString(t, { width }) + 2, 0),
  );
  const footerH = footerTextH + 34;
  const bottom = footerH + 10;
  doc.page.margins.bottom = bottom;
  const opts = doc as unknown as {
    options: { margins?: Record<string, number> };
  };
  opts.options.margins = {
    ...(opts.options.margins ?? {}),
    bottom,
    left: SIDE_MARGIN,
    right: SIDE_MARGIN,
  };
  doc.page.margins.left = SIDE_MARGIN;
  doc.page.margins.right = SIDE_MARGIN;

  // ---- header (QR of the authenticity check top right) -------------
  const top = 40;
  const qrW = input.verifyUrl ? QR_SIZE + 14 : 0;
  const textW = width - qrW;
  let headerBottom = top;
  if (input.verifyUrl) {
    const qx = left + width - QR_SIZE;
    drawQr(doc, input.verifyUrl, qx, top, QR_SIZE);
    doc
      .fillColor(LIGHT)
      .fontSize(5.8)
      .text(both('scan'), qx - 16, top + QR_SIZE + 3, {
        width: QR_SIZE + 16,
        align: 'center',
      });
    headerBottom = doc.y;
  }
  doc.fillColor(NAVY).fontSize(18).text(title, left, top, { width: textW });
  for (const t of distinct(locals.map((x) => x.title))) {
    if (t === title) continue;
    doc.fillColor(MUTED).fontSize(10).text(t, left, doc.y, { width: textW });
  }
  doc.moveDown(0.3);
  doc
    .fillColor(MUTED)
    .fontSize(8.3)
    .text(s.texts.notContract, left, doc.y, { width: textW });
  for (const t of distinct(locals.map((x) => x.notContract))) {
    if (t === s.texts.notContract) continue;
    doc
      .fillColor(LIGHT)
      .fontSize(7.8)
      .text(t, left, doc.y + 1, { width: textW });
  }
  doc.y = Math.max(doc.y, headerBottom) + 6;

  // ---- summary table --------------------------------------------------
  const row = (k: DealRecordLabel, v: string) => {
    const y = doc.y;
    doc
      .fillColor(MUTED)
      .fontSize(7.3)
      .text(both(k), left, y + 1.5, { width: 112 });
    const labelBottom = doc.y;
    doc
      .fillColor(NAVY)
      .fontSize(9)
      .text(v, left + 118, y, { width: width - 118 });
    const bottomY = Math.max(labelBottom, doc.y);
    doc
      .moveTo(left, bottomY + 3)
      .lineTo(left + width, bottomY + 3)
      .strokeColor(BORDER)
      .lineWidth(0.5)
      .stroke();
    doc.y = bottomY + 6;
  };
  const party = (p: {
    fullName: string;
    email: string | null;
    username: string | null;
  }) =>
    [p.fullName, p.email, p.username ? `@${p.username}` : null]
      .filter((x): x is string => !!x)
      .join(' · ');
  const bar = [s.attorney.barState, s.attorney.barNumber]
    .filter((x): x is string => !!x)
    .join(' bar #');
  row('case', s.case.title);
  row('client', party(s.client));
  row(
    'attorney',
    [party(s.attorney), bar || null, s.attorney.firmName]
      .filter((x): x is string => !!x)
      .join(' · '),
  );
  const termLines = [
    headlineTerms(s.terms),
    ...(s.terms.paymentTerms ? describePaymentTerms(s.terms.paymentTerms) : []),
  ];
  row('paymentTerms', termLines.join('\n'));
  row(
    'accepted',
    `${stamp(new Date(s.acceptedAt))} · by the ${ROLE_LABEL[s.acceptedBy].toLowerCase()} in the LawBid app`,
  );
  row(
    'recordCode',
    `${input.recordCode} (SHA-256 of the recorded data: ${input.snapshotSha256})`,
  );
  doc.moveDown(0.5);

  // ---- history, verbatim ---------------------------------------------
  doc
    .fillColor(NAVY)
    .fontSize(11)
    .text(both('history'), left, doc.y, { width });
  doc
    .fillColor(MUTED)
    .fontSize(7.5)
    .text(
      'Every offer and counter-offer exactly as written in the app, with the time it was sent (UTC).',
      left,
      doc.y + 1,
      { width },
    );
  doc.moveDown(0.3);
  for (const g of groupByDay(s.history)) {
    keep(h(g.day, 8.5, width) + 30);
    doc
      .fillColor(GOLD)
      .fontSize(8.5)
      .text(g.day, left, doc.y + 3, { width });
    doc
      .moveTo(left, doc.y + 1)
      .lineTo(left + width, doc.y + 1)
      .strokeColor(BORDER)
      .lineWidth(0.5)
      .stroke();
    doc.y += 4;
    for (const o of g.offers) {
      keep(
        h(
          `${timeOf(o.createdAt)} · ${offerHeadline(o, s.acceptedBy)}`,
          8.8,
          width,
        ) +
          (o.paymentTerms
            ? h(describePaymentTerms(o.paymentTerms).join('\n'), 8, width - 12)
            : 0) +
          (o.message && o.message.trim() !== ''
            ? h(o.message, 8.5, width - 12)
            : 0) +
          6,
      );
      doc
        .fillColor(NAVY)
        .fontSize(8.8)
        .text(
          `${timeOf(o.createdAt)} · ${offerHeadline(o, s.acceptedBy)}`,
          left,
          doc.y,
          { width },
        );
      if (o.paymentTerms) {
        doc
          .fillColor(MUTED)
          .fontSize(8)
          .text(
            describePaymentTerms(o.paymentTerms).join('\n'),
            left + 12,
            doc.y + 1,
            { width: width - 12 },
          );
      }
      if (o.message && o.message.trim() !== '') {
        doc
          .fillColor(NAVY)
          .fontSize(8.5)
          .text(o.message, left + 12, doc.y + 1, { width: width - 12 });
      }
      doc.moveDown(0.35);
    }
  }

  // ---- signatures: equal audit rows + consents for both sides -------
  doc.moveDown(0.3);
  const boxH = SIGNATURE_BOX_HEIGHT;
  const colW = (width - 16) / 2;
  const authText = (m: SignerAuthMethod | null | undefined): string =>
    m ? AUTH_PARTS[m].map((p) => both(p)).join(', ') : '—';
  /** The lines under a signature box: [text, colour, indent]. */
  const auditLines = (sig: RecordSignature): [string, string, number][] => {
    const out: [string, string, number][] = [
      [`${sig.name} · ${stamp(sig.signedAt)}`, NAVY, 0],
      [`IP: ${sig.ip ?? '—'}`, MUTED, 0],
      [`${both('device')}: ${sig.device ?? '—'}`, MUTED, 0],
      [`${both('verifiedBy')}: ${authText(sig.authMethod)}`, MUTED, 0],
    ];
    if (sig.consents && sig.consents.length > 0) {
      out.push([`${both('confirmed')} · ${stamp(sig.signedAt)}`, GOLD, 0]);
      for (const c of sig.consents) {
        out.push([`✓ ${c.en}`, NAVY, 0]);
        if (c.local && c.local !== c.en) out.push([c.local, LIGHT, 8]);
      }
    } else {
      out.push([`${both('confirmed')}: —`, GOLD, 0]);
    }
    return out;
  };
  const LINE_SIZE = 6.9;
  const columnH = Math.max(
    0,
    ...signatures.map((z) =>
      auditLines(z).reduce(
        (a, [t, , ind]) => a + h(t, LINE_SIZE, colW - ind),
        3,
      ),
    ),
  );
  const noteH = h(sealed ? SEALED_NOTE : UNSIGNED_NOTE, 7, width);
  const hasTerms = !!s.texts.terms && s.texts.terms.trim() !== '';
  const localTerms = hasTerms
    ? distinct(locals.map((x) => x.terms)).filter(
        (t) => t !== s.texts.terms!.trim(),
      )
    : [];
  const importantH = hasTerms
    ? h(both('important'), 10, width) +
      h(s.texts.terms!, 7.4, width) +
      [...localTerms, ...localFooters].reduce(
        (a, t) => a + h(t, 7.4, width) + 2,
        14,
      )
    : 0;
  // Signatures (heading, boxes, audit rows, consents, note) and
  // «Important» right under them are one block: never split, and a record
  // that needs two pages carries the whole block to page two.
  keep(
    h(both('signatures'), 11, width) +
      16 +
      boxH +
      columnH +
      noteH +
      8 +
      importantH,
  );
  doc
    .fillColor(NAVY)
    .fontSize(11)
    .text(both('signatures'), left, doc.y, { width });
  doc.moveDown(0.25);
  const sigTop = doc.y;
  let sigBottom = sigTop + 12 + boxH;
  for (const role of ['client', 'attorney'] as const) {
    const x = role === 'client' ? left : left + colW + 16;
    const sig = signatures.find((z) => z.role === role);
    doc
      .fillColor(GOLD)
      .fontSize(8)
      .text(both(role), x, sigTop, { width: colW, lineBreak: false });
    const boxTop = sigTop + 12;
    doc.rect(x, boxTop, colW, boxH).strokeColor(BORDER).lineWidth(0.8).stroke();
    if (!sig) {
      doc
        .fillColor(MUTED)
        .fontSize(8.5)
        .text(both('notSigned'), x + 10, boxTop + boxH / 2 - 5, {
          width: colW - 20,
        });
      continue;
    }
    let drawn = false;
    if (sig.image) {
      try {
        doc.image(sig.image, x + 8, boxTop + 5, {
          fit: [colW - 16, boxH - 10],
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
        .fontSize(18)
        .text(sig.name, x + 10, boxTop + 15, {
          width: colW - 20,
          height: 24,
          ellipsis: true,
        });
    }
    doc.y = boxTop + boxH + 3;
    for (const [text, color, indent] of auditLines(sig)) {
      doc
        .fillColor(color)
        .fontSize(LINE_SIZE)
        .text(text, x + indent, doc.y, { width: colW - indent });
    }
    sigBottom = Math.max(sigBottom, doc.y);
  }
  doc.y = sigBottom + 5;
  doc
    .fillColor(MUTED)
    .fontSize(7)
    .text(sealed ? SEALED_NOTE : UNSIGNED_NOTE, left, doc.y, { width });

  // ---- disclaimers (R-392, admin «Запись о сделке»), right under ----
  // The whole admin text, never cut, in English and each language.
  if (hasTerms && s.texts.terms) {
    doc.moveDown(0.5);
    doc
      .fillColor(NAVY)
      .fontSize(10)
      .text(both('important'), left, doc.y, { width });
    doc.moveDown(0.15);
    doc
      .fillColor(NAVY)
      .fontSize(7.4)
      .text(s.texts.terms, left, doc.y, { width });
    for (const t of localTerms) {
      doc
        .fillColor(MUTED)
        .fontSize(7.4)
        .text(t, left, doc.y + 2, { width });
    }
  }
  // The page footer's admin text in each signer's language, once.
  for (const t of localFooters) {
    doc
      .fillColor(MUTED)
      .fontSize(7.4)
      .text(t, left, doc.y + 2, { width });
  }

  // ---- footers, second pass ------------------------------------------
  const range = doc.bufferedPageRange();
  const total = range.start + range.count;
  const initials = sealed
    ? signatures.filter(
        (z): z is RecordSignature & { image: Buffer } => !!z.image,
      )
    : [];
  for (let i = range.start; i < total; i++) {
    doc.switchToPage(i);
    const saved = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // the footer sits inside the reserved band
    const fy = doc.page.height - footerH;
    doc
      .moveTo(left, fy)
      .lineTo(left + width, fy)
      .strokeColor(BORDER)
      .lineWidth(0.5)
      .stroke();
    doc.y = fy + 5;
    footerTexts.forEach((t, n) => {
      doc
        .fillColor(n === 0 ? MUTED : LIGHT)
        .fontSize(6.5)
        .text(t, left, doc.y, { width });
      doc.y += 2;
    });
    const stampY = doc.page.height - 24;
    doc
      .fillColor(NAVY)
      .fontSize(7.5)
      .text(
        footerStamp(input.recordCode, input.generatedAt, i + 1, total),
        left,
        stampY,
        {
          width: width - 150,
          lineBreak: false,
        },
      );
    let ix = left + width;
    for (const z of initials) {
      ix -= 66;
      try {
        doc.image(z.image, ix, stampY - 10, {
          fit: [60, 18],
          align: 'right',
          valign: 'center',
        });
      } catch {
        // a bad PNG never breaks the footer
      }
    }
    doc.page.margins.bottom = saved;
  }
  doc.end();
  return { pdf: await done, pages: total - range.start };
}

const SEALED_NOTE =
  'Both parties drew their signature in the LawBid app. The SHA-256 of this sealed file is kept by the platform and shown in the app and on the page the QR code opens (a file cannot contain its own hash).';
const UNSIGNED_NOTE =
  'The record is sealed once both parties have signed in the app; the signatures then appear here.';
