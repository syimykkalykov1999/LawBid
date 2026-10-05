import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PartnersService } from '../partners/partners.service';
import {
  PayrollAccrualsService,
  type SettledItem,
} from './payroll-accruals.service';

const REF = 'partner:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Owner 2026-10-05: partners are paid with payroll. Before the payroll
 * list or «Выплатить», every approved partner commission becomes a pending
 * accrual (`partner:<commissionId>`, once). A commission paid or reversed
 * in Деньги → Партнёры meanwhile drops out of payroll, so nothing is paid
 * twice. When payroll pays it, the commission is marked paid with
 * `payroll:<payoutId>` as the reference (the partner is notified there).
 */
@Injectable()
export class PayrollPartnersBridge implements OnModuleInit {
  private readonly logger = new Logger(PayrollPartnersBridge.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accruals: PayrollAccrualsService,
    @Optional() private readonly partners?: PartnersService,
  ) {}

  onModuleInit(): void {
    this.accruals.onSettled((items, state) => this.settled(items, state));
  }

  /** Brings approved commissions into payroll; never throws (payroll
   * keeps working when the partner side fails). */
  async sync(): Promise<void> {
    if (!this.partners) return;
    try {
      const payable = await this.partners.listPayable();
      const partnerIds = [...new Set(payable.map((c) => c.partner_id))];
      const partners = await this.prisma.partner.findMany({
        where: { id: { in: partnerIds } },
        select: { id: true, user_id: true, label: true },
      });
      const users = await this.prisma.user.findMany({
        where: { id: { in: partners.map((p) => p.user_id) } },
        select: { id: true, first_name: true, last_name: true },
      });
      const nameOf = new Map(
        partners.map((p) => {
          const u = users.find((x) => x.id === p.user_id);
          const full = [u?.first_name, u?.last_name].filter(Boolean).join(' ');
          return [p.id, p.label || full || 'Партнёр'];
        }),
      );
      for (const c of payable) {
        await this.accruals.accrue({
          userId: c.partner_user_id,
          name: nameOf.get(c.partner_id) ?? 'Партнёр',
          source: 'partner',
          eventRef: `${REF}${c.id}`,
          amountCents: c.amount_cents,
          period: c.period,
          kind: 'commission',
        });
      }
      // Paid or reversed on the partners page: out of payroll.
      const approved = new Set(payable.map((c) => `${REF}${c.id}`));
      const stale = await this.prisma.payrollAccrual.findMany({
        where: { status: 'pending', event_ref: { startsWith: REF } },
        select: { event_ref: true },
      });
      // Only accruals of a real commission that is no longer approved;
      // other `partner:` refs (or an unknown id) are left alone.
      const ids = stale
        .filter((a) => !approved.has(a.event_ref))
        .map((a) => a.event_ref.slice(REF.length))
        .filter((id) => UUID.test(id));
      const gone = ids.length
        ? await this.prisma.partnerCommission.findMany({
            where: { id: { in: ids }, status: { not: 'approved' } },
            select: { id: true },
          })
        : [];
      for (const c of gone) {
        await this.accruals.cancel(`${REF}${c.id}`, 'Settled in Партнёры');
      }
    } catch (e) {
      this.logger.error(`partner commissions sync failed: ${String(e)}`);
    }
  }

  private async settled(
    items: SettledItem[],
    state: 'paid' | 'unpaid',
  ): Promise<void> {
    const mine = items.filter((i) => i.ref.startsWith(REF));
    if (!this.partners || mine.length === 0) return;
    if (state === 'unpaid') {
      // The seam has no "unpay": the commissions stay marked paid and the
      // payroll cancel is the record. Logged for the finance check.
      this.logger.warn(
        `payroll payout canceled with ${mine.length} partner commission(s) already marked paid`,
      );
      return;
    }
    const byPayout = new Map<string, string[]>();
    for (const i of mine) {
      byPayout.set(i.payoutId, [
        ...(byPayout.get(i.payoutId) ?? []),
        i.ref.slice(REF.length),
      ]);
    }
    for (const [payoutId, ids] of byPayout) {
      await this.partners.markPaid(ids, { payoutRef: `payroll:${payoutId}` });
    }
  }
}
