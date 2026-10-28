import {
  GOLD,
  MUTED,
  NAVY,
  money,
  startPdf,
  stamp,
} from '../cases/cases.public';
import sharp from 'sharp';
import { describePaymentTerms } from '../bids/bids.public';
import type { DealRecordSnapshot, SnapshotOffer } from './deal-record.snapshot';

/** One side's signature as printed (full on the last page, initials in the footer). */
export interface RecordSignature {
  role: 'client' | 'attorney';
  name: string;
  /** PNG with alpha from the app's pad; null falls back to the typed name. */
  image: Buffer | null;
  signedAt: Date;
  ip: string | null;
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
}

const FOOTER_HEIGHT = 92;
const BOTTOM_MARGIN = FOOTER_HEIGHT + 18;
const BORDER = '#B9C0CF';

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

/**
 * Deal record 2026-10-27 (plan §3): the document. One pass writes the body
 * with pages buffered; a second pass puts the footer (admin text, record
 * code, date, initials once both signed, "Page N of M") on every page.
 * Everything printed comes from the snapshot — no translation, no edits.
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
  return renderFlattened({ ...input, signatures });
}

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

function renderFlattened(input: RenderDealRecordInput): Promise<Buffer> {
  const { snapshot: s, signatures } = input;
  const title = input.title ?? 'Deal record — LawBid';
  const { doc, done } = startPdf({
    title,
    bufferPages: true,
    bottomMargin: BOTTOM_MARGIN,
    creationDate: input.generatedAt,
  });
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const sealed = signatures.length >= 2;

  // ---- header ---------------------------------------------------------
  doc.fillColor(NAVY).fontSize(20).text(title, left, 54, { width });
  doc.moveDown(0.4);
  doc
    .fillColor(MUTED)
    .fontSize(9.5)
    .text(s.texts.notContract, left, doc.y, { width });
  doc.moveDown(1);

  // ---- summary table --------------------------------------------------
  const row = (k: string, v: string) => {
    const y = doc.y;
    doc
      .fillColor(MUTED)
      .fontSize(8.5)
      .text(k, left, y + 2, { width: 110 });
    doc
      .fillColor(NAVY)
      .fontSize(10)
      .text(v, left + 118, y, { width: width - 118 });
    doc
      .moveTo(left, doc.y + 4)
      .lineTo(left + width, doc.y + 4)
      .strokeColor(BORDER)
      .lineWidth(0.5)
      .stroke();
    doc.y += 8;
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
  row('Case', s.case.title);
  row('Client', party(s.client));
  row(
    'Attorney',
    [party(s.attorney), bar || null, s.attorney.firmName]
      .filter((x): x is string => !!x)
      .join(' · '),
  );
  const termLines = [
    headlineTerms(s.terms),
    ...(s.terms.paymentTerms ? describePaymentTerms(s.terms.paymentTerms) : []),
  ];
  row('Payment terms', termLines.join('\n'));
  row(
    'Accepted',
    `${stamp(new Date(s.acceptedAt))} · by the ${ROLE_LABEL[s.acceptedBy].toLowerCase()} in the LawBid app`,
  );
  row(
    'Record code',
    `${input.recordCode} (SHA-256 of the recorded data: ${input.snapshotSha256})`,
  );
  doc.moveDown(0.8);

  // ---- history, verbatim ---------------------------------------------
  doc
    .fillColor(NAVY)
    .fontSize(13)
    .text('Offer history', left, doc.y, { width });
  doc
    .fillColor(MUTED)
    .fontSize(8.5)
    .text(
      'Every offer and counter-offer exactly as written in the app, with the time it was sent (UTC).',
      left,
      doc.y + 2,
      { width },
    );
  doc.moveDown(0.6);
  for (const g of groupByDay(s.history)) {
    doc
      .fillColor(GOLD)
      .fontSize(9.5)
      .text(g.day, left, doc.y + 4, { width });
    doc
      .moveTo(left, doc.y + 2)
      .lineTo(left + width, doc.y + 2)
      .strokeColor(BORDER)
      .lineWidth(0.5)
      .stroke();
    doc.y += 6;
    for (const o of g.offers) {
      doc
        .fillColor(NAVY)
        .fontSize(10)
        .text(
          `${timeOf(o.createdAt)} · ${offerHeadline(o, s.acceptedBy)}`,
          left,
          doc.y,
          {
            width,
          },
        );
      if (o.paymentTerms) {
        doc
          .fillColor(MUTED)
          .fontSize(9)
          .text(
            describePaymentTerms(o.paymentTerms).join('\n'),
            left + 12,
            doc.y + 1,
            {
              width: width - 12,
            },
          );
      }
      if (o.message && o.message.trim() !== '') {
        doc
          .fillColor(NAVY)
          .fontSize(9.5)
          .text(o.message, left + 12, doc.y + 2, { width: width - 12 });
      }
      doc.moveDown(0.7);
    }
  }

  // ---- signatures (last page) ----------------------------------------
  doc.moveDown(0.6);
  const boxH = 86;
  const needed = 18 + 14 + boxH + 30;
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
  doc.fillColor(NAVY).fontSize(13).text('Signatures', left, doc.y, { width });
  doc.moveDown(0.5);
  const colW = (width - 16) / 2;
  const top = doc.y;
  for (const role of ['client', 'attorney'] as const) {
    const x = role === 'client' ? left : left + colW + 16;
    const sig = signatures.find((z) => z.role === role);
    doc
      .fillColor(GOLD)
      .fontSize(9)
      .text(ROLE_LABEL[role], x, top, { width: colW });
    const boxTop = top + 14;
    doc.rect(x, boxTop, colW, boxH).strokeColor(BORDER).lineWidth(0.8).stroke();
    if (sig) {
      let drawn = false;
      if (sig.image) {
        try {
          doc.image(sig.image, x + 10, boxTop + 8, {
            fit: [colW - 20, boxH - 16],
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
          .fontSize(20)
          .text(sig.name, x + 10, boxTop + 30, {
            width: colW - 20,
            height: 30,
            ellipsis: true,
          });
      }
      doc
        .fillColor(MUTED)
        .fontSize(8.5)
        .text(
          `${sig.name} · ${stamp(sig.signedAt)}${sig.ip ? ` · IP ${sig.ip}` : ''}`,
          x,
          boxTop + boxH + 4,
          { width: colW },
        );
    } else {
      doc
        .fillColor(MUTED)
        .fontSize(9)
        .text('Not signed yet', x + 10, boxTop + boxH / 2 - 5, {
          width: colW - 20,
        });
    }
  }
  doc.y = top + 14 + boxH + 30;
  doc
    .fillColor(MUTED)
    .fontSize(8)
    .text(
      sealed
        ? 'Both parties drew their signature in the LawBid app. The SHA-256 of this sealed file is kept by the platform and shown in the app (a file cannot contain its own hash).'
        : 'The record is sealed once both parties have signed in the app; the signatures then appear here.',
      left,
      doc.y,
      { width },
    );

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
    const fy = doc.page.height - FOOTER_HEIGHT - 6;
    doc
      .moveTo(left, fy)
      .lineTo(left + width, fy)
      .strokeColor(BORDER)
      .lineWidth(0.5)
      .stroke();
    doc
      .fillColor(MUTED)
      .fontSize(7.5)
      .text(s.texts.footer, left, fy + 6, {
        width,
        height: 44,
        ellipsis: true,
      });
    const stampY = doc.page.height - 28;
    doc
      .fillColor(NAVY)
      .fontSize(8)
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
        doc.image(z.image, ix, stampY - 14, {
          fit: [60, 22],
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
  return done;
}
