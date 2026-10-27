import { Injectable, Optional } from '@nestjs/common';
import { AdminSummaryService } from '../admin-summary/admin-summary.service';
import { withSnapshotTimeout } from '../admin-summary/snapshot-gate';
import { SpendService } from '../ops/spend/spend.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPnl,
  type PaymentDayRow,
  type PnlKind,
  type PnlSnapshot,
} from './pnl.rules';

export const PNL_SUMMARY_KEY = 'pnl';
/** The admin button recounts at most this often. */
export const PNL_BUTTON_COOLDOWN_MS = 10 * 60_000;
const DAY_MS = 86_400_000;

interface RawRow {
  day: string;
  kind: string;
  subtotal_cents: bigint | number | null;
  gross_cents: bigint | number | null;
  payments: bigint | number | null;
  refunded_cents: bigint | number | null;
}

/**
 * Owner 2026-10-25 («Прибыль»): the P&L is counted once a day by the
 * snapshot job (after the spend poll) and on the owner's button (max once
 * per 10 min); the admin page reads only the stored snapshot. One grouped
 * query over the last ~12 weeks of succeeded payments, under a 30 s cap.
 */
@Injectable()
export class PnlService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly summary?: AdminSummaryService,
    @Optional() private readonly spend?: SpendService,
  ) {}

  /** What is stored; null before the first count. Never computes. */
  async read() {
    return (await this.summary?.peek<PnlSnapshot>(PNL_SUMMARY_KEY)) ?? null;
  }

  /** The button: skipped (stored value returned) inside the 10-min window. */
  async refreshFromButton() {
    const hit = await this.read();
    if (hit && Date.now() - Date.parse(hit.computedAt) < PNL_BUTTON_COOLDOWN_MS)
      return hit;
    return this.refresh();
  }

  /** The daily job's entry: count now and store. */
  async refresh() {
    if (!this.summary) throw new Error('summary store missing');
    return this.summary.refresh(PNL_SUMMARY_KEY, () => this.compute());
  }

  async compute(now: Date = new Date()): Promise<PnlSnapshot> {
    const dow = (now.getUTCDay() + 6) % 7;
    const since = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
        (dow + 77) * DAY_MS,
    );
    const rows = await this.paymentRows(since);
    let vendorDaily: { date: string; usd: number }[] = [];
    let fixed: Awaited<ReturnType<SpendService['fixedCosts']>> = [];
    try {
      const rep = await this.spend?.report(now);
      vendorDaily = (rep?.vendors ?? [])
        .filter((v) => v.id !== 'stripe') // Stripe fees are already in net revenue
        .flatMap((v) => v.daily);
      fixed = rep?.fixed ?? [];
    } catch {
      // No spend snapshot yet: revenue only, the page says costs are unknown.
    }
    return buildPnl({ rows, vendorDaily, fixed, now });
  }

  /**
   * Succeeded payments per UTC day and source. Source: a star purchase, a
   * bid pack, a case promotion or a seat purchase points at the payment /
   * invoice; any other payment of a client is a client subscription, the
   * rest are attorney subscriptions. Client → attorney case payments live
   * in another table and are not here.
   */
  private async paymentRows(since: Date): Promise<PaymentDayRow[]> {
    const res = await withSnapshotTimeout(
      this.prisma,
      (p) =>
        p.$queryRaw<RawRow[]>`
        SELECT to_char(p.paid_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
               CASE
                 WHEN EXISTS (SELECT 1 FROM star_purchases s WHERE s.payment_id = p.id) THEN 'stars'
                 WHEN EXISTS (SELECT 1 FROM bid_pack_purchases b WHERE b.payment_id = p.id) THEN 'bid_packs'
                 WHEN EXISTS (SELECT 1 FROM case_promotions c WHERE c.payment_id = p.id) THEN 'promotions'
                 WHEN p.stripe_invoice_id IS NOT NULL AND EXISTS (SELECT 1 FROM assistant_seat_changes a WHERE a.stripe_invoice_id = p.stripe_invoice_id) THEN 'seats'
                 WHEN u.role::text = 'client' THEN 'client_subscriptions'
                 ELSE 'subscriptions'
               END AS kind,
               COALESCE(SUM(COALESCE(p.subtotal_cents, p.amount_cents - COALESCE(p.tax_cents, 0))), 0) AS subtotal_cents,
               COALESCE(SUM(p.amount_cents), 0) AS gross_cents,
               COUNT(*) AS payments,
               COALESCE(SUM((SELECT COALESCE(SUM(r.amount_cents), 0) FROM refunds r
                              WHERE r.payment_id = p.id AND r.status = 'succeeded')), 0) AS refunded_cents
          FROM payments p
          JOIN users u ON u.id = p.user_id
         WHERE p.status = 'succeeded' AND p.paid_at >= ${since}
         GROUP BY 1, 2`,
    );
    return res.map((r) => ({
      day: r.day,
      kind: r.kind as PnlKind,
      subtotalCents: Number(r.subtotal_cents ?? 0),
      grossCents: Number(r.gross_cents ?? 0),
      payments: Number(r.payments ?? 0),
      refundedCents: Number(r.refunded_cents ?? 0),
    }));
  }
}
