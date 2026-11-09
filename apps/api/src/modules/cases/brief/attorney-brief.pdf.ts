import sharp from 'sharp';
import {
  describePaymentTerms,
  type PaymentTerms,
} from '../../bids/bids.public';
import { MUTED, NAVY, money, stamp, startPdf } from '../tools/pdf-common';

/** Owner A-044 (sweep A-c1, 2026-11-09): the most case photos the brief prints. */
export const BRIEF_MAX_PHOTOS = 9;

export interface BriefContact {
  name: string | null;
  phone: string | null;
  email: string | null;
  /** contact_method as the client chose it (`call`, `sms`, …), or null. */
  preferredMethod: string | null;
  preferredNote: string | null;
}

export interface BriefTerms {
  feeType: 'fixed' | 'hourly' | 'free_consultation' | 'contingency';
  amountCents: number;
  percentBps: number | null;
  /** The bid's rich payment terms (bids.payment_terms), when given. */
  paymentTerms: PaymentTerms | null;
}

export interface RenderAttorneyBriefInput {
  caseTitle: string;
  /** The case's short reference (first 8 characters of its id). */
  caseCode: string;
  attorneyName: string;
  contact: BriefContact;
  terms: BriefTerms;
  /** The case's photos in their order (raw bytes as stored, ≤ 9 are used). */
  photos: Buffer[];
  /** The moment the bid was accepted: the document date and the PDF Info
   * date, so the same case renders byte for byte the same. */
  acceptedAt: Date;
  /** The attorney's app language: picks the Han font for CJK names. */
  lang?: string | null;
}

const FEE_LABEL = {
  fixed: 'Flat fee',
  hourly: 'Hourly rate',
  free_consultation: 'Free consultation',
  contingency: 'Contingency fee',
} as const;

const METHOD_LABEL: Record<string, string> = {
  call: 'Phone call',
  sms: 'Text message',
  email: 'Email',
  in_app_chat: 'In-app chat',
};

const pct = (bps: number): string =>
  `${(bps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} %`;

/** The accepted terms' one-line headline (same wording as the deal record). */
export function briefHeadline(t: BriefTerms): string {
  if (t.feeType === 'free_consultation') return FEE_LABEL.free_consultation;
  if (t.feeType === 'contingency') {
    return `${FEE_LABEL.contingency} ${t.percentBps === null ? '—' : pct(t.percentBps)}`;
  }
  const amount = money(t.amountCents);
  return t.feeType === 'hourly'
    ? `${FEE_LABEL.hourly} ${amount} per hour`
    : `${FEE_LABEL.fixed} ${amount}`;
}

/** The contact lines printed (only what the client has on file). */
export function contactLines(c: BriefContact): [string, string][] {
  const out: [string, string][] = [];
  if (c.name) out.push(['Name', c.name]);
  if (c.phone) out.push(['Phone', c.phone]);
  if (c.email) out.push(['Email', c.email]);
  if (c.preferredMethod) {
    out.push([
      'Preferred contact',
      METHOD_LABEL[c.preferredMethod] ?? c.preferredMethod,
    ]);
  }
  if (c.preferredNote) out.push(['Contact note', c.preferredNote]);
  return out;
}

/**
 * Photos → opaque JPEG (EXIF turned upright, ≤ 1200 px, no metadata).
 * PDFKit embeds JPEG synchronously, so the bytes stay reproducible
 * (KNOWN_ERRORS #24: PNG with alpha is embedded asynchronously). A photo
 * sharp cannot read (HEIC without libheif, a broken file) is skipped.
 */
async function normalizePhotos(photos: Buffer[]): Promise<Buffer[]> {
  const out: Buffer[] = [];
  for (const p of photos.slice(0, BRIEF_MAX_PHOTOS)) {
    try {
      out.push(
        await sharp(p)
          .rotate()
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
          .flatten({ background: '#ffffff' })
          .jpeg({ quality: 80, mozjpeg: false })
          .toBuffer(),
      );
    } catch {
      // not an image sharp can read: left out of the brief
    }
  }
  return out;
}

/**
 * Sweep A-c1 (owner A-044): the one document the attorney gets once a bid
 * is accepted — the client's contact data, the accepted terms and up to
 * nine case photos. pdfkit (MIT) through the same `startPdf` as the deal
 * record and receipts (Inter + Noto fallbacks for every script the app
 * speaks); English headings like the deal record.
 */
export async function renderAttorneyBriefPdf(
  input: RenderAttorneyBriefInput,
): Promise<Buffer> {
  const photos = await normalizePhotos(input.photos);
  const { doc, done } = startPdf({
    title: 'Case brief — LawBid',
    creationDate: input.acceptedAt,
    lang: input.lang ?? undefined,
  });
  const width = doc.page.width - 108;

  doc.fillColor(NAVY).fontSize(18).text('Case brief for the attorney');
  doc.moveDown(0.2);
  doc
    .fillColor(MUTED)
    .fontSize(9)
    .text(
      `Case ${input.caseCode} · accepted ${stamp(input.acceptedAt)} · for ${input.attorneyName}`,
    );
  doc.moveDown(0.8);
  doc.fillColor(NAVY).fontSize(13).text(input.caseTitle, { width });
  doc.moveDown(0.8);

  doc.fillColor(NAVY).fontSize(11).text('Client');
  doc.moveDown(0.2);
  const lines = contactLines(input.contact);
  if (lines.length === 0) {
    doc.fillColor(MUTED).fontSize(10).text('—');
  }
  for (const [label, value] of lines) {
    doc.fillColor(MUTED).fontSize(9).text(label);
    doc.fillColor('#000000').fontSize(10).text(value, { width });
  }
  doc.moveDown(0.8);

  doc.fillColor(NAVY).fontSize(11).text('Accepted terms');
  doc.moveDown(0.2);
  doc.fillColor('#000000').fontSize(10).text(briefHeadline(input.terms));
  if (input.terms.paymentTerms) {
    for (const l of describePaymentTerms(input.terms.paymentTerms)) {
      doc.fillColor('#000000').fontSize(10).text(l, { width });
    }
  }
  doc.moveDown(0.8);

  doc.fillColor(NAVY).fontSize(11).text('Case photos');
  doc.moveDown(0.3);
  if (photos.length === 0) {
    doc.fillColor(MUTED).fontSize(10).text('No photos in this case.');
  } else {
    // A 3 × 3 grid; a new page when the next row does not fit.
    const gap = 8;
    const cell = (width - gap * 2) / 3;
    let y = doc.y;
    photos.forEach((jpg, i) => {
      const col = i % 3;
      if (col === 0 && i > 0) y += cell + gap;
      if (col === 0 && y + cell > doc.page.height - 54) {
        doc.addPage();
        y = 54;
      }
      doc.image(jpg, 54 + col * (cell + gap), y, {
        fit: [cell, cell],
        align: 'center',
        valign: 'center',
      });
    });
    doc.y = y + cell + gap;
  }
  doc.moveDown(0.8);
  doc
    .fillColor(MUTED)
    .fontSize(8)
    .text(
      'Only you see this file. The client’s contact data is shared with you because they accepted your bid; use it for this case only.',
      54,
      doc.y,
      { width },
    );
  doc.end();
  return done;
}
