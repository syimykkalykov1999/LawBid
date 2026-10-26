import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../feature-flags/services/app-config.service';

/** Stripe's cost of one Connect payout, taken from the person's payout
 * (owner 2026-10-05). Defaults are Stripe's US Express prices; the owner
 * edits them in Настройки (app_config `payroll.stripe_*`). */
export interface PayrollFeeSettings {
  percent: number;
  fixedCents: number;
  monthlyCents: number;
}

export const DEFAULT_PAYROLL_FEES: PayrollFeeSettings = {
  percent: 0.25,
  fixedCents: 25,
  monthlyCents: 200,
};

export interface AccrueInput {
  /** The LawBid account the money is for (partner, blogger, employee). */
  userId: string;
  /** Shown on payroll when this creates the person's payroll entry. */
  name: string;
  email?: string | null;
  /** Which module accrued it: 'partner', 'admin', … */
  source: string;
  /** Unique per event; a repeat call with the same ref changes nothing. */
  eventRef: string;
  /** Cents; negative for a reversal of an already paid commission. */
  amountCents: number;
  currency?: string;
  /** Period it belongs to, e.g. "2026-10". */
  period: string;
  kind?: 'commission' | 'bonus' | 'adjustment';
  note?: string | null;
  /** Job title when this creates the payroll entry (default «Партнёр»). */
  roleTitle?: string;
}

export interface AccrueResult {
  accrualId: string;
  employeeId: string;
  created: boolean;
  status: string;
}

export interface SettledItem {
  ref: string;
  payoutId: string;
}

export type SettledListener = (
  items: SettledItem[],
  state: 'paid' | 'unpaid',
) => Promise<void> | void;

/**
 * Owner 2026-10-05 — flexible pay: the ledger other modules write to.
 * The partner program calls `accrue` for each approved commission; the
 * next «Выплатить» pays the person's fixed salary plus every pending
 * accrual in one payout, and `onSettled` tells the module which refs were
 * paid (or put back to pending when a payout failed or was canceled).
 */
@Injectable()
export class PayrollAccrualsService {
  private readonly log = new Logger(PayrollAccrualsService.name);
  private readonly listeners: SettledListener[] = [];

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly appConfig?: AppConfigService,
  ) {}

  async accrue(input: AccrueInput): Promise<AccrueResult> {
    const existing = await this.prisma.payrollAccrual.findUnique({
      where: { event_ref: input.eventRef },
    });
    if (existing) return result(existing, false);
    const employee = await this.employeeFor(input);
    try {
      const row = await this.prisma.payrollAccrual.create({
        data: {
          employee_id: employee.id,
          source: input.source.slice(0, 24),
          kind: input.kind ?? 'commission',
          event_ref: input.eventRef.slice(0, 120),
          amount_cents: input.amountCents,
          currency: input.currency ?? employee.currency,
          period: input.period.slice(0, 40),
          note: input.note?.slice(0, 300) ?? null,
        },
      });
      return result(row, true);
    } catch (e) {
      // Two callers raced on the same event: the other one won.
      if (isUniqueViolation(e)) {
        const row = await this.prisma.payrollAccrual.findUniqueOrThrow({
          where: { event_ref: input.eventRef },
        });
        return result(row, false);
      }
      throw e;
    }
  }

  /** Takes back a pending accrual (refund inside the hold, …). A paid one
   * stays paid; the caller accrues a negative adjustment instead. */
  async cancel(
    eventRef: string,
    reason: string,
  ): Promise<'canceled' | 'paid' | 'missing'> {
    const row = await this.prisma.payrollAccrual.findUnique({
      where: { event_ref: eventRef },
    });
    if (!row) return 'missing';
    if (row.status === 'paid') return 'paid';
    if (row.status === 'pending') {
      await this.prisma.payrollAccrual.updateMany({
        where: { id: row.id, status: 'pending' },
        data: {
          status: 'canceled',
          canceled_at: new Date(),
          note: (row.note ? `${row.note} · ${reason}` : reason).slice(0, 300),
        },
      });
    }
    return 'canceled';
  }

  /** Pending total per currency for one account (shown in their profile). */
  async owedFor(userId: string): Promise<Record<string, number>> {
    const rows = await this.prisma.payrollAccrual.findMany({
      where: { status: 'pending', employee: { user_id: userId } },
      select: { amount_cents: true, currency: true },
    });
    const out: Record<string, number> = {};
    for (const r of rows) {
      out[r.currency] = (out[r.currency] ?? 0) + r.amount_cents;
    }
    return out;
  }

  onSettled(listener: SettledListener): void {
    this.listeners.push(listener);
  }

  /** Called by payroll after money moved (or came back). A listener
   * failing never undoes the payout; it is logged. */
  async settled(items: SettledItem[], state: 'paid' | 'unpaid') {
    if (items.length === 0) return;
    for (const l of this.listeners) {
      try {
        await l(items, state);
      } catch (e) {
        this.log.error(
          `settled listener failed (${state}, ${items.length} refs): ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }
  }

  async feeSettings(): Promise<PayrollFeeSettings> {
    const config = (await this.appConfig?.getConfig().catch(() => null)) ?? {};
    const num = (key: string, fallback: number) => {
      const v = Number(config[key]);
      return config[key] != null && Number.isFinite(v) && v >= 0 ? v : fallback;
    };
    return {
      percent: num('payroll.stripe_fee_percent', DEFAULT_PAYROLL_FEES.percent),
      fixedCents: Math.round(
        num('payroll.stripe_fee_fixed_cents', DEFAULT_PAYROLL_FEES.fixedCents),
      ),
      monthlyCents: Math.round(
        num(
          'payroll.stripe_monthly_fee_cents',
          DEFAULT_PAYROLL_FEES.monthlyCents,
        ),
      ),
    };
  }

  private async employeeFor(input: AccrueInput) {
    const found = await this.prisma.payrollEmployee.findUnique({
      where: { user_id: input.userId },
    });
    if (found) return found;
    // Owner 2026-10-05: an admin already on payroll (linked by their admin
    // account) gets their bonus on the same entry.
    const staff = await this.prisma.payrollEmployee.findFirst({
      where: { admin_user_id: input.userId, user_id: null },
    });
    if (staff) {
      return this.prisma.payrollEmployee.update({
        where: { id: staff.id },
        data: { user_id: input.userId },
      });
    }
    try {
      return await this.prisma.payrollEmployee.create({
        data: {
          user_id: input.userId,
          name: input.name.slice(0, 120) || 'Partner',
          role_title: input.roleTitle ?? 'Партнёр',
          amount_cents: 0,
          currency: input.currency ?? 'usd',
          email: input.email ?? null,
        },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      return this.prisma.payrollEmployee.findUniqueOrThrow({
        where: { user_id: input.userId },
      });
    }
  }
}

/** Stripe's cost of sending [gross] cents; the monthly active-account fee
 * is charged on the person's first Stripe payout of the period. */
export function stripeFee(
  gross: number,
  fees: PayrollFeeSettings,
  monthly: boolean,
): number {
  return (
    Math.round((gross * fees.percent) / 100) +
    fees.fixedCents +
    (monthly ? fees.monthlyCents : 0)
  );
}

function result(
  row: { id: string; employee_id: string; status: string },
  created: boolean,
): AccrueResult {
  return {
    accrualId: row.id,
    employeeId: row.employee_id,
    created,
    status: row.status,
  };
}

function isUniqueViolation(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
  );
}
