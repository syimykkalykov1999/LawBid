import { GOLD, hoursText, money, MUTED, NAVY, startPdf } from './pdf-common';

export interface InvoiceLine {
  kind: 'time' | 'expense';
  /** YYYY-MM-DD */
  date: string;
  text: string;
  minutes?: number;
  rateCents?: number;
  cents: number;
}

export interface InvoiceInput {
  number: string;
  issuedAt: Date;
  caseTitle: string;
  attorneyName: string;
  clientName: string;
  currency: string;
  lines: InvoiceLine[];
  minutes: number;
  timeCents: number;
  expensesCents: number;
  totalCents: number;
  note: string | null;
}

/**
 * Owner 2026-10-20: the invoice is a document for the client — time and
 * expenses on one case. There is no payment here (client → attorney
 * payments are off), so the page says "for information" and says nothing
 * about how to pay. EN / RU labels, one file for both apps.
 */
export function renderInvoicePdf(i: InvoiceInput): Promise<Buffer> {
  const { doc, done } = startPdf({ title: `Invoice ${i.number}` });
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;

  doc.fillColor(NAVY).fontSize(22).text('Invoice / Счёт', left, 54);
  doc
    .fillColor(GOLD)
    .fontSize(11)
    .text(i.number, left, doc.y + 2);
  doc.moveDown(0.8);
  doc.fillColor(MUTED).fontSize(9);
  doc.text(`Date / Дата: ${i.issuedAt.toISOString().slice(0, 10)}`);
  doc.text(`Case / Кейс: ${i.caseTitle}`);
  doc.text(`Attorney / Адвокат: ${i.attorneyName}`);
  doc.text(`Client / Клиент: ${i.clientName}`);
  doc.moveDown(1);

  const cols = {
    date: left,
    text: left + 70,
    qty: left + 300,
    amt: left + 400,
  };
  const head = (y: number) => {
    doc.fillColor(MUTED).fontSize(8);
    doc.text('Date / Дата', cols.date, y, { width: 64 });
    doc.text('Description / Описание', cols.text, y, { width: 220 });
    doc.text('Time · rate / Время · ставка', cols.qty, y, { width: 96 });
    doc.text('Amount / Сумма', cols.amt, y, {
      width: width - 400,
      align: 'right',
    });
    doc
      .moveTo(left, y + 12)
      .lineTo(left + width, y + 12)
      .strokeColor('#D5D9E2')
      .lineWidth(0.5)
      .stroke();
    return y + 18;
  };
  let y = head(doc.y);
  for (const l of i.lines) {
    const h = Math.max(
      doc.fontSize(9).heightOfString(l.text, { width: 220 }),
      12,
    );
    if (y + h > doc.page.height - 120) {
      doc.addPage();
      y = head(54);
    }
    doc.fillColor(NAVY).fontSize(9);
    doc.text(l.date, cols.date, y, { width: 64 });
    doc.text(l.text, cols.text, y, { width: 220 });
    if (l.kind === 'time') {
      doc.text(
        `${hoursText(l.minutes ?? 0)} · ${money(l.rateCents ?? 0, i.currency)}/h`,
        cols.qty,
        y,
        { width: 96 },
      );
    } else {
      doc.fillColor(MUTED).text('expense / расход', cols.qty, y, { width: 96 });
    }
    doc.fillColor(NAVY).text(money(l.cents, i.currency), cols.amt, y, {
      width: width - 400,
      align: 'right',
    });
    y += h + 6;
  }
  y += 8;
  if (y > doc.page.height - 150) {
    doc.addPage();
    y = 54;
  }
  const row = (label: string, value: string, strong = false) => {
    doc
      .fillColor(strong ? NAVY : MUTED)
      .fontSize(strong ? 12 : 9)
      .text(label, left + 220, y, { width: 180 });
    doc.text(value, cols.amt, y, { width: width - 400, align: 'right' });
    y += strong ? 20 : 14;
  };
  row(`Time / Время · ${hoursText(i.minutes)}`, money(i.timeCents, i.currency));
  row('Expenses / Расходы', money(i.expensesCents, i.currency));
  row('Total / Итого', money(i.totalCents, i.currency), true);
  if (i.note) {
    y += 8;
    doc.fillColor(MUTED).fontSize(9).text(i.note, left, y, { width });
  }
  doc
    .fillColor(MUTED)
    .fontSize(8)
    .text(
      'For information only. This document is not a payment request. / Только для сведения. Этот документ не является требованием оплаты.',
      left,
      doc.page.height - 80,
      { width },
    );
  doc.end();
  return done;
}
