import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PAYMENT_PROVIDER } from '../billing/billing.constants';
import type { PaymentProvider } from '../billing/payment-provider';
import type {
  AdminSeatChangeDto,
  AdminSeatChangesQueryDto,
} from './admin-billing.dto';
import {
  ADMIN_BILLING_PAGE,
  afterCursor,
  type Page,
  toPage,
  usersById,
} from './admin-billing.util';

/** Owner 2026-10-22: «Покупки мест» — every change of an attorney's
 * assistant seats, newest first, with the Stripe invoice. */
@Injectable()
export class SeatChangesAdminService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  async list(q: AdminSeatChangesQueryDto): Promise<Page<AdminSeatChangeDto>> {
    const rows = await this.prisma.assistantSeatChange.findMany({
      where: {
        AND: [
          q.status ? { status: q.status } : {},
          q.userId ? { user_id: q.userId } : {},
          afterCursor(q.cursor),
        ],
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: ADMIN_BILLING_PAGE + 1,
    });
    const users = await usersById(
      this.prisma,
      rows.slice(0, ADMIN_BILLING_PAGE).map((r) => r.user_id),
    );
    return toPage(rows, ADMIN_BILLING_PAGE, (r) => ({
      id: r.id,
      userId: r.user_id,
      user: users.get(r.user_id) ?? null,
      fromSeats: r.from_seats,
      toSeats: r.to_seats,
      amountCents: r.amount_cents,
      currency: r.currency,
      status: r.status,
      stripeInvoiceId: r.stripe_invoice_id,
      invoiceUrl: r.stripe_invoice_id
        ? this.invoiceUrl(r.stripe_invoice_id)
        : null,
      effectiveAt: r.effective_at?.toISOString() ?? null,
      createdAt: r.created_at.toISOString(),
    }));
  }

  /** The invoice in the Stripe Dashboard (test or live by the key). */
  invoiceUrl(invoiceId: string): string | null {
    if (this.provider.name !== 'stripe') return null;
    const test = this.provider.mode === 'live' ? '' : 'test/';
    return `https://dashboard.stripe.com/${test}invoices/${invoiceId}`;
  }
}
