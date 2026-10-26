import type { Prisma } from '@prisma/client';
import { statusAfterPayment } from '../../common/case-invoice-status';

/**
 * Owner 2026-10-25: a payment request made as the pay link of a case
 * invoice (`payment_requests.invoice_id`) was paid: add the amount to the
 * invoice and move its status. Runs inside the payment's own transaction,
 * once (the caller only gets here when the request was open), so the
 * invoice and the payment can never disagree. A no-op for a plain request.
 */
export async function reconcileInvoicePayment(
  tx: Prisma.TransactionClient,
  requestId: string,
  amountCents: number,
  now = new Date(),
): Promise<void> {
  const req = await tx.paymentRequest.findUnique({
    where: { id: requestId },
    select: { invoice_id: true },
  });
  if (!req?.invoice_id) return;
  const inv = await tx.caseInvoice.findUnique({
    where: { id: req.invoice_id },
  });
  if (!inv || inv.status === 'void') return;
  const paidCents = inv.paid_cents + amountCents;
  const status = statusAfterPayment(inv.status, {
    totalCents: inv.total_cents,
    lateFeeCents: inv.late_fee_cents,
    paidCents,
  });
  await tx.caseInvoice.update({
    where: { id: inv.id },
    data: {
      paid_cents: paidCents,
      status,
      paid_at: status === 'paid' ? now : inv.paid_at,
    },
  });
}
