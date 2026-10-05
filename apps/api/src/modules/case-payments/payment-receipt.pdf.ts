import { existsSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import type { CasePaymentDto } from './case-payments.dto';
import type { PaymentQuote } from './case-payments.settings';

/** Inter (same face as the app), covers Latin + Cyrillic. 3 levels up
 * from src/modules/case-payments, 4 from dist/src/modules/case-payments. */
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

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '—');

export interface ReceiptInput {
  payment: CasePaymentDto;
  quote: PaymentQuote;
  clientEmail: string | null;
  attorneyEmail: string | null;
  request: { description: string; seq: number; total: number } | null;
  refunds: { amountCents: number; reason: string; createdAt: Date }[];
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  disclaimerEn: string;
  disclaimerRu: string;
  forAttorney: boolean;
}

/**
 * Owner 2026-10-05: a PDF receipt of one client → attorney payment, for
 * either side (the attorney's copy shows what Stripe took and what was
 * received). Bilingual labels (EN / RU) so one file serves both apps.
 */
export function renderPaymentReceiptPdf(input: ReceiptInput): Promise<Buffer> {
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
    const p = input.payment;
    const q = input.quote;
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const rule = () =>
      doc
        .moveDown(0.4)
        .strokeColor(GOLD)
        .lineWidth(1)
        .moveTo(left, doc.y)
        .lineTo(right, doc.y)
        .stroke()
        .moveDown(0.6);
    const line = (label: string, value: string, strong = false) => {
      const y = doc.y;
      doc
        .fillColor(MUTED)
        .fontSize(strong ? 11 : 10)
        .text(label, left, y, { width: 300 });
      doc
        .fillColor(NAVY)
        .fontSize(strong ? 12 : 10)
        .text(value, left + 300, y, {
          width: right - left - 300,
          align: 'right',
        });
      doc.moveDown(0.25);
    };

    doc.fillColor(GOLD).fontSize(11).text('LAWBID', { characterSpacing: 2 });
    doc
      .fillColor(NAVY)
      .fontSize(20)
      .text(
        input.forAttorney
          ? 'Payment received / Оплата получена'
          : 'Receipt / Квитанция',
      );
    doc
      .fillColor(MUTED)
      .fontSize(9)
      .text(`№ ${p.id} · ${day(p.paidAt)} · ${p.status.replace('_', ' ')}`);
    rule();

    doc.fillColor(NAVY).fontSize(12).text('Case / Дело');
    doc
      .fillColor(MUTED)
      .fontSize(10)
      .text(p.caseTitle ?? p.caseId);
    if (input.request) {
      doc.text(
        `${input.request.description}${
          input.request.total > 1
            ? ` (installment ${input.request.seq} of ${input.request.total})`
            : ''
        }`,
      );
    } else if (p.note) {
      doc.text(p.note);
    }
    doc.moveDown(0.6);
    const who = (
      title: string,
      party: CasePaymentDto['client'],
      email: string | null,
    ) => {
      doc.fillColor(NAVY).fontSize(12).text(title);
      doc
        .fillColor(MUTED)
        .fontSize(10)
        .text(
          [party?.name, party?.username ? `@${party.username}` : null, email]
            .filter(Boolean)
            .join(' · ') || '—',
        );
      doc.moveDown(0.4);
    };
    who('Client / Клиент', p.client, input.clientEmail);
    who('Attorney / Адвокат', p.attorney, input.attorneyEmail);
    rule();

    line("Attorney's fee / Гонорар адвоката", money(p.amountCents));
    if (p.platformFeeCents > 0) {
      line(
        q.feePayer === 'client'
          ? 'LawBid service charge (paid by client) / Сервисный сбор'
          : 'LawBid service charge (paid by attorney) / Сервисный сбор',
        money(p.platformFeeCents),
      );
    }
    if (p.processingFeeCents > 0) {
      line(
        'Stripe payment-processing fee, client share / Комиссия платёжной системы Stripe, доля клиента',
        money(p.processingFeeCents),
      );
    }
    line(
      'Charged to the client / Списано с клиента',
      money(p.clientTotalCents),
      true,
    );
    if (p.platformFeeCents === 0) {
      doc
        .fontSize(8)
        .fillColor(MUTED)
        .text(
          'LawBid receives nothing from this payment / LawBid с этой оплаты ничего не получает',
        )
        .fillColor(NAVY);
    }
    if (input.forAttorney) {
      doc.moveDown(0.3);
      line(
        'Stripe payment-processing fee, 2.9% + 30¢ (estimate) / Комиссия платёжной системы Stripe (оценка)',
        `− ${money(q.stripeFeeEstimateCents)}`,
      );
      line(
        'Received on your Stripe balance / Получено на баланс Stripe',
        `≈ ${money(q.attorneyReceivesCents)}`,
        true,
      );
    }
    if (p.refundedCents > 0) {
      doc.moveDown(0.3);
      line('Refunded / Возвращено', `− ${money(p.refundedCents)}`, true);
      for (const r of input.refunds) {
        doc
          .fillColor(MUTED)
          .fontSize(9)
          .text(
            `${r.createdAt.toISOString().slice(0, 10)} · ${money(r.amountCents)} · ${r.reason}`,
          );
      }
    }
    rule();
    doc.fillColor(MUTED).fontSize(8);
    doc.text(
      `Stripe payment: ${input.stripePaymentIntentId ?? '—'}${
        input.stripeChargeId ? ` · charge ${input.stripeChargeId}` : ''
      }`,
    );
    doc.text(
      `The money was charged directly on the attorney's own Stripe account. / Платёж списан напрямую на Stripe-аккаунт адвоката.`,
    );
    doc.moveDown(0.8);
    doc.fontSize(8).text(input.disclaimerEn, { align: 'justify' });
    doc.moveDown(0.3);
    doc.fontSize(8).text(input.disclaimerRu, { align: 'justify' });
    doc.end();
  });
}
