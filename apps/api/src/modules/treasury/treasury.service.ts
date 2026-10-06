import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type TreasuryPayout } from '@prisma/client';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { OpsStateService } from '../../common/ops/ops-state.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { AuditLogService } from '../admin-access/audit-log.service';
import { AdminPayrollService } from '../admin-payroll/admin-payroll.service';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import {
  computePlan,
  daysUntil,
  nextRunDate,
  periodOf,
  runDue,
  type Plan,
  type PlanInput,
} from './treasury-plan';
import {
  banksFingerprint,
  TreasuryStripeService,
  type StripeBank,
  type StripeTreasuryState,
} from './treasury-stripe.service';
import type {
  CreateTreasuryExpenseDto,
  TreasuryCostLineDto,
  TreasuryExpenseDto,
  TreasuryOverviewDto,
  TreasuryPayoutDto,
  TreasuryPayrollDto,
  TreasuryRunResultDto,
  TreasurySettingsDto,
  UpdateTreasuryExpenseDto,
} from './treasury.dto';

/** Same flag as Деньги → Зарплаты: salaries go out through Stripe. */
const PAYROLL_STRIPE_FLAG = 'payroll_stripe_payouts';
const LOCK_KEY = 'treasury:run:lock';
const RAN_KEY = (period: string) => `treasury:ran:${period}`;
const BANKS_KEY = 'treasury:banks';
const PAYROLL_LOCK_KEY = 'treasury:payroll:lock';
const PAYROLL_RAN_KEY = (period: string) => `treasury:payroll:ran:${period}`;
const PAYROLL_WARNED_KEY = (period: string) =>
  `treasury:payroll:warned:${period}`;
const OPEN_STATUSES = ['pending', 'in_transit'];

interface Gathered {
  state: StripeTreasuryState | null;
  expenses: TreasuryExpenseDto[];
  costLines: TreasuryCostLineDto[];
  input: Omit<PlanInput, 'availableCents' | 'expensesPaidThisPeriod'>;
  settings: TreasurySettingsDto;
}

/**
 * Owner 2026-10-05 «на мою карту — только чистая прибыль, а зарплаты и
 * расходы пусть удерживаются сами»: Деньги → «Прибыль и резерв».
 *
 * The platform's money (subscriptions, badges, promotion) lands on its
 * Stripe balance. Stripe's payouts are set to «Manual» once by the owner;
 * after that LawBid decides, once a month (`treasury.payout_day`):
 *  1. «Расходы»: a month of services (AWS from its budget forecast, the
 *     database, Twilio, …) and salaries paid from the bank → the second
 *     bank in Stripe, whose card pays those bills automatically;
 *  2. the reserve stays on Stripe: Stripe payroll, partner commissions
 *     owed, the refund buffer and a safety cushion;
 *  3. «Прибыль»: the rest → Stripe's default bank (the owner's card).
 *
 * Security: no bank can be added, chosen or typed in LawBid — the two
 * destinations are the banks in Stripe itself (changed only there, with
 * the owner's Stripe login and 2FA), the amounts are computed here, the
 * button needs a fresh 2FA code, and a change of the banks in Stripe sends
 * an alert e-mail. Alerts are log lines with an `alert` field
 * (infra/modules/monitoring turns them into plain-language e-mails).
 */
@Injectable()
export class TreasuryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: TreasuryStripeService,
    private readonly settings: AppSettingsService,
    private readonly flags: FeatureFlagsService,
    private readonly opsState: OpsStateService,
    private readonly audit: AuditLogService,
    private readonly payroll: AdminPayrollService,
    private readonly logger: PinoLogger,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.logger.setContext(TreasuryService.name);
  }

  // ---- overview ------------------------------------------------------------

  async overview(now: Date = new Date()): Promise<TreasuryOverviewDto> {
    const g = await this.gather();
    const period = periodOf(now);
    const [expensesPaid, ran, payouts, payroll] = await Promise.all([
      this.expensesPaid(period),
      this.ranThisPeriod(period),
      this.prisma.treasuryPayout.findMany({
        orderBy: { created_at: 'desc' },
        take: 36,
      }),
      this.payrollOverview(g, now),
    ]);
    const plan = computePlan({
      ...g.input,
      availableCents: g.state?.availableCents ?? 0,
      expensesPaidThisPeriod: expensesPaid,
    });
    const banks = resolveBanks(g.state?.banks ?? null);
    return {
      availableCents: g.state?.availableCents ?? null,
      pendingCents: g.state?.pendingCents ?? null,
      setup: {
        stripeConnected: g.state !== null,
        manualPayouts: g.state?.payoutInterval === 'manual',
        payoutInterval: g.state?.payoutInterval ?? null,
        banksListed: Array.isArray(g.state?.banks),
        bankCount: g.state?.banks?.length ?? 0,
        separateExpenseBank: banks.expense !== null,
      },
      profitBank: banks.profit,
      expenseBank: banks.expense,
      plan,
      expenses: g.expenses,
      costLines: g.costLines,
      settings: g.settings,
      payouts: payouts.map(payoutDto),
      nextRunAt: nextRunDate(now, g.settings.payoutDay, ran).toISOString(),
      ranThisPeriod: ran,
      payroll,
    };
  }

  // ---- the monthly run -----------------------------------------------------

  /**
   * `treasury.daily` (cron): payout statuses refreshed, a change of the
   * banks in Stripe reported, and — with «авто» on — the monthly split on
   * (or after a missed) payout day.
   */
  async daily(now: Date = new Date()): Promise<unknown> {
    const state = await this.stripe.state().catch((e: Error) => {
      this.logger.warn({ err: e.message }, 'treasury: Stripe unreachable');
      return null;
    });
    if (!state) return { skipped: 'no_stripe' };
    await this.refreshPayouts();
    await this.watchBanks(state.banks);
    // Salaries first: on the pay day they leave the reserve before a split.
    const payroll = await this.payrollDaily(state.availableCents, now);
    const [auto, day] = await Promise.all([
      this.settings.boolean('treasury.auto'),
      this.settings.number('treasury.payout_day'),
    ]);
    if (!auto) return { payroll, split: { skipped: 'manual_mode' } };
    if (!runDue(now, day, await this.ranThisPeriod(periodOf(now)))) {
      return { payroll, split: { skipped: 'not_due' } };
    }
    return { payroll, split: await this.run('auto', null, now) };
  }

  /**
   * Owner 2026-10-06 «зарплаты платятся сами из резерва, а если денег не
   * хватает — предупреди заранее». With `treasury.payroll_auto` on, on the
   * pay day (`treasury.payroll_day`, a missed day runs the next day) the
   * people linked to Stripe get their salary and pending commissions —
   * the same payment as «Выплатить» in Зарплаты, method Stripe, one per
   * person per month. `treasury.payroll_warn_days` before it, and on the
   * day itself, a Stripe balance below what is due logs
   * `alert: payroll_funds_low` (an e-mail); on the day nothing is sent
   * until the money is there (checked again every day). A refused
   * transfer logs `alert: payroll_auto_failed`.
   */
  async payrollDaily(
    availableCents: number,
    now: Date = new Date(),
  ): Promise<Record<string, unknown>> {
    const [auto, day, warnDays] = await Promise.all([
      this.settings.boolean('treasury.payroll_auto'),
      this.settings.number('treasury.payroll_day'),
      this.settings.number('treasury.payroll_warn_days'),
    ]);
    if (!auto) return { skipped: 'manual_mode' };
    const period = periodOf(now);
    const ran = (await this.redis.get(PAYROLL_RAN_KEY(period))) !== null;
    if (!runDue(now, day, ran)) {
      const next = nextRunDate(now, day, ran);
      const left = daysUntil(now, next);
      if (left > warnDays) return { skipped: 'not_due' };
      const nextPeriod = periodOf(next);
      const due = await this.payroll.autoDue(nextPeriod);
      if (!due.stripeReady || availableCents >= due.dueCents) {
        return { skipped: 'not_due', dueCents: due.dueCents };
      }
      const warned = await this.redis.set(
        PAYROLL_WARNED_KEY(nextPeriod),
        '1',
        'EX',
        40 * 86_400,
        'NX',
      );
      if (warned === 'OK') {
        this.logger.warn(
          {
            alert: 'payroll_funds_low',
            stage: 'soon',
            daysLeft: left,
            dueCents: due.dueCents,
            availableCents,
          },
          'payroll: not enough on Stripe for the coming pay day',
        );
      }
      return { skipped: 'not_due', warned: true, dueCents: due.dueCents };
    }
    const locked = await this.redis.set(PAYROLL_LOCK_KEY, '1', 'EX', 300, 'NX');
    if (locked !== 'OK') return { skipped: 'busy' };
    try {
      const due = await this.payroll.autoDue(period);
      if (!due.stripeReady) return { skipped: 'stripe_off' };
      if (due.employeeIds.length === 0) {
        await this.markPayrollRan(period);
        return { paid: 0 };
      }
      if (availableCents < due.dueCents) {
        // Not marked: tried again tomorrow, when the money may be there.
        this.logger.warn(
          {
            alert: 'payroll_funds_low',
            stage: 'pay_day',
            dueCents: due.dueCents,
            availableCents,
          },
          'payroll: pay day, but not enough on Stripe — nothing sent',
        );
        return { skipped: 'funds_low', dueCents: due.dueCents };
      }
      const res = await this.payroll
        .payBulk(null, {
          employeeIds: due.employeeIds,
          period,
          method: 'stripe',
          note: 'Авто',
        })
        .catch((e: unknown) => {
          // Everyone already paid by hand this month: nothing left to do.
          if (!(e instanceof ConflictException)) throw e;
          this.logger.info({ err: e.message }, 'payroll: nothing to pay');
          return null;
        });
      await this.markPayrollRan(period);
      if (res && res.failed.length > 0) {
        this.logger.warn(
          { alert: 'payroll_auto_failed', failed: res.failed.length },
          'payroll: Stripe refused some salary transfers',
        );
      }
      this.logger.info(
        {
          metric: 'payroll_auto',
          paid: res?.count ?? 0,
          failed: res?.failed.length ?? 0,
          totalCents: res?.totals.usd ?? 0,
        },
        'payroll: automatic pay day',
      );
      return { paid: res?.count ?? 0, failed: res?.failed.length ?? 0 };
    } finally {
      await this.redis.del(PAYROLL_LOCK_KEY);
    }
  }

  /** One split now. `manual` (the 2FA button) sends the same computed
   * amounts; the expense payout still goes out at most once a month. */
  async run(
    trigger: 'auto' | 'manual',
    adminId: string | null,
    now: Date = new Date(),
  ): Promise<TreasuryRunResultDto> {
    const none = { expensesCents: 0, profitCents: 0, shortfallCents: 0 };
    const locked = await this.redis.set(LOCK_KEY, '1', 'EX', 300, 'NX');
    if (locked !== 'OK') return { skipped: 'busy', ...none };
    try {
      const g = await this.gather();
      if (!g.state) return { skipped: 'no_stripe', ...none };
      const period = periodOf(now);
      if (g.state.payoutInterval !== 'manual') {
        // Stripe still sends everything to the bank by itself.
        this.logger.warn(
          { alert: 'treasury_setup_needed', interval: g.state.payoutInterval },
          'treasury: Stripe payouts are not on Manual — nothing split',
        );
        if (trigger === 'auto') await this.markRan(period);
        return { skipped: 'not_manual', ...none };
      }
      const plan = computePlan({
        ...g.input,
        availableCents: g.state.availableCents,
        expensesPaidThisPeriod: await this.expensesPaid(period),
      });
      const banks = resolveBanks(g.state.banks);
      const snapshot = planSnapshot(plan, g.state);

      let expensesCents = 0;
      if (plan.expensePayoutCents > 0) {
        // Without a second bank in Stripe the money still has to reach
        // the bills: it goes to the default bank.
        const ok = await this.send({
          period,
          kind: 'expenses',
          trigger,
          adminId,
          amountCents: plan.expensePayoutCents,
          bank: banks.expense ?? banks.profit,
          destination: banks.expense?.id ?? null,
          snapshot,
        });
        if (ok) expensesCents = plan.expensePayoutCents;
      }
      let profitCents = 0;
      if (plan.profitPayoutCents > 0) {
        const ok = await this.send({
          period,
          kind: 'profit',
          trigger,
          adminId,
          amountCents: plan.profitPayoutCents,
          bank: banks.profit,
          destination: null, // Stripe's default bank
          snapshot,
        });
        if (ok) profitCents = plan.profitPayoutCents;
      }
      if (plan.shortfallCents > 0) {
        this.logger.warn(
          {
            alert: 'treasury_low',
            shortfallCents: plan.shortfallCents,
            availableCents: g.state.availableCents,
            reserveTargetCents: plan.reserveTargetCents,
          },
          'treasury: not enough on Stripe for a month of costs and the reserve',
        );
      }
      if (trigger === 'auto') await this.markRan(period);
      this.logger.info(
        {
          metric: 'treasury_run',
          trigger,
          expensesCents,
          profitCents,
          shortfallCents: plan.shortfallCents,
        },
        'treasury: monthly split',
      );
      if (adminId) {
        await this.audit.record({
          adminId,
          action: 'treasury.run',
          targetType: 'treasury',
          targetId: null,
          before: null,
          after: {
            period,
            expensesCents: String(expensesCents),
            profitCents: String(profitCents),
          },
        });
      }
      return {
        skipped: null,
        expensesCents,
        profitCents,
        shortfallCents: plan.shortfallCents,
      };
    } finally {
      await this.redis.del(LOCK_KEY);
    }
  }

  // ---- expenses (what the services charge a month) --------------------------

  async createExpense(
    adminId: string,
    dto: CreateTreasuryExpenseDto,
  ): Promise<void> {
    const last = await this.prisma.treasuryExpense.findFirst({
      orderBy: { sort: 'desc' },
      select: { sort: true },
    });
    const row = await this.prisma.treasuryExpense.create({
      data: {
        name: dto.name,
        monthly_cents: dto.monthlyCents,
        sort: (last?.sort ?? -1) + 1,
      },
    });
    await this.auditExpense(
      adminId,
      'treasury.expense.create',
      row.id,
      null,
      expenseAudit(row),
    );
  }

  async updateExpense(
    adminId: string,
    id: string,
    dto: UpdateTreasuryExpenseDto,
  ): Promise<void> {
    const before = await this.findExpense(id);
    const row = await this.prisma.treasuryExpense.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.monthlyCents !== undefined
          ? { monthly_cents: dto.monthlyCents }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        updated_at: new Date(),
      },
    });
    await this.auditExpense(
      adminId,
      'treasury.expense.update',
      id,
      expenseAudit(before),
      expenseAudit(row),
    );
  }

  async deleteExpense(adminId: string, id: string): Promise<void> {
    const before = await this.findExpense(id);
    await this.prisma.treasuryExpense.delete({ where: { id } });
    await this.auditExpense(
      adminId,
      'treasury.expense.delete',
      id,
      expenseAudit(before),
      null,
    );
  }

  async readSettings(): Promise<TreasurySettingsDto> {
    const [
      auto,
      payoutDay,
      bufferPercent,
      refundBufferUsd,
      minProfitUsd,
      payrollAuto,
      payrollDay,
      payrollWarnDays,
    ] = await Promise.all([
      this.settings.boolean('treasury.auto'),
      this.settings.number('treasury.payout_day'),
      this.settings.number('treasury.buffer_percent'),
      this.settings.number('treasury.refund_buffer_usd'),
      this.settings.number('treasury.min_profit_usd'),
      this.settings.boolean('treasury.payroll_auto'),
      this.settings.number('treasury.payroll_day'),
      this.settings.number('treasury.payroll_warn_days'),
    ]);
    return {
      auto,
      payoutDay,
      bufferPercent,
      refundBufferUsd,
      minProfitUsd,
      payrollAuto,
      payrollDay,
      payrollWarnDays,
    };
  }

  // ---- internals -------------------------------------------------------------

  private async gather(): Promise<Gathered> {
    const [state, rows, employees, owedPartners, owedPayroll, viaStripe] =
      await Promise.all([
        this.stripe.state().catch((e: Error) => {
          this.logger.warn({ err: e.message }, 'treasury: Stripe unreachable');
          return null;
        }),
        this.prisma.treasuryExpense.findMany({
          orderBy: [{ sort: 'asc' }, { created_at: 'asc' }],
        }),
        this.prisma.payrollEmployee.findMany({
          where: { active: true, currency: 'usd' },
          select: { amount_cents: true, stripe_payouts_enabled: true },
        }),
        this.prisma.partnerCommission.aggregate({
          where: { status: { in: ['held', 'approved'] } },
          _sum: { amount_cents: true },
        }),
        // Partner commissions are counted above (once).
        this.prisma.payrollAccrual.aggregate({
          where: {
            status: 'pending',
            currency: 'usd',
            NOT: { event_ref: { startsWith: 'partner:' } },
          },
          _sum: { amount_cents: true },
        }),
        this.flags.isEnabled(PAYROLL_STRIPE_FLAG, false),
      ]);
    const [settings, awsCents] = await Promise.all([
      this.readSettings(),
      this.awsForecastCents(),
    ]);

    const expenses: TreasuryExpenseDto[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      monthlyCents: r.monthly_cents,
      effectiveCents:
        r.source === 'aws' && awsCents !== null
          ? Math.max(r.monthly_cents, awsCents)
          : r.monthly_cents,
      source: r.source === 'aws' ? 'aws' : 'manual',
      active: r.active,
      sort: r.sort,
    }));
    let payrollStripe = 0;
    let payrollBank = 0;
    for (const e of employees) {
      if (viaStripe && e.stripe_payouts_enabled)
        payrollStripe += e.amount_cents;
      else payrollBank += e.amount_cents;
    }
    const owed = Math.max(
      0,
      (owedPartners._sum.amount_cents ?? 0) +
        (owedPayroll._sum.amount_cents ?? 0),
    );
    const refundBufferCents = settings.refundBufferUsd * 100;
    const costLines: TreasuryCostLineDto[] = [
      { key: 'payroll_stripe', monthlyCents: payrollStripe, via: 'stripe' },
      { key: 'payroll_bank', monthlyCents: payrollBank, via: 'bank' },
      { key: 'owed', monthlyCents: owed, via: viaStripe ? 'stripe' : 'bank' },
      { key: 'refund_buffer', monthlyCents: refundBufferCents, via: 'stripe' },
    ];
    return {
      state,
      expenses,
      costLines,
      settings,
      input: {
        services: expenses
          .filter((e) => e.active)
          .map((e) => ({ name: e.name, monthlyCents: e.effectiveCents })),
        payrollStripeCents: payrollStripe,
        payrollBankCents: payrollBank,
        owedCents: owed,
        owedViaStripe: viaStripe,
        refundBufferCents,
        bufferPercent: settings.bufferPercent,
        minProfitCents: settings.minProfitUsd * 100,
      },
    };
  }

  /** The pay day card: when, how much, enough on Stripe or not. */
  private async payrollOverview(
    g: Gathered,
    now: Date,
  ): Promise<TreasuryPayrollDto> {
    const ran = (await this.redis.get(PAYROLL_RAN_KEY(periodOf(now)))) !== null;
    const next = nextRunDate(now, g.settings.payrollDay, ran);
    const due = await this.payroll.autoDue(periodOf(next));
    const available = g.state?.availableCents ?? 0;
    return {
      stripeReady: due.stripeReady,
      nextPayAt: next.toISOString(),
      paidThisPeriod: ran,
      dueCents: due.dueCents,
      people: due.employeeIds.length,
      notLinked: due.notLinked,
      shortCents: due.stripeReady ? Math.max(0, due.dueCents - available) : 0,
    };
  }

  private async markPayrollRan(period: string): Promise<void> {
    await this.redis.set(PAYROLL_RAN_KEY(period), '1', 'EX', 40 * 86_400);
  }

  /** This month's AWS forecast from the budget (`ops.cost-check`), cents. */
  private async awsForecastCents(): Promise<number | null> {
    const cost = await this.opsState.cost().catch(() => null);
    if (!cost) return null;
    const usd = Math.max(cost.forecastUsd ?? 0, cost.actualUsd ?? 0);
    return usd > 0 ? Math.ceil(usd * 100) : null;
  }

  private async expensesPaid(period: string): Promise<boolean> {
    const n = await this.prisma.treasuryPayout.count({
      where: {
        period,
        kind: 'expenses',
        status: { notIn: ['failed', 'canceled'] },
      },
    });
    return n > 0;
  }

  private async ranThisPeriod(period: string): Promise<boolean> {
    if ((await this.redis.get(RAN_KEY(period))) !== null) return true;
    const n = await this.prisma.treasuryPayout.count({
      where: { period, trigger: 'auto' },
    });
    return n > 0;
  }

  private async markRan(period: string): Promise<void> {
    await this.redis.set(RAN_KEY(period), '1', 'EX', 40 * 86_400);
  }

  /** Records the payout first (unique key), then asks Stripe. */
  private async send(input: {
    period: string;
    kind: 'expenses' | 'profit';
    trigger: 'auto' | 'manual';
    adminId: string | null;
    amountCents: number;
    /** For the label only. */
    bank: StripeBank | null;
    /** Stripe bank id; null = Stripe's default bank. */
    destination: string | null;
    snapshot: Prisma.InputJsonValue;
  }): Promise<boolean> {
    const attempt = await this.prisma.treasuryPayout.count({
      where: { period: input.period, kind: input.kind },
    });
    const key = `${input.period}:${input.kind}:${input.trigger}:${attempt + 1}`;
    let row: TreasuryPayout;
    try {
      row = await this.prisma.treasuryPayout.create({
        data: {
          key,
          period: input.period,
          kind: input.kind,
          trigger: input.trigger,
          amount_cents: input.amountCents,
          destination_id: input.destination,
          destination_label: input.bank
            ? `${input.bank.label} •••${input.bank.last4}`
            : null,
          plan: input.snapshot,
          created_by: input.adminId,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        return false; // a parallel run took this key
      }
      throw e;
    }
    try {
      const p = await this.stripe.payout({
        amountCents: input.amountCents,
        destination: input.destination ?? undefined,
        description:
          input.kind === 'profit'
            ? `LawBid profit ${input.period}`
            : `LawBid expenses ${input.period}`,
        idempotencyKey: `treasury-${key}`,
        metadata: { purpose: 'treasury', kind: input.kind, key },
      });
      await this.prisma.treasuryPayout.update({
        where: { id: row.id },
        data: {
          stripe_payout_id: p.id,
          status: p.status,
          updated_at: new Date(),
        },
      });
      return true;
    } catch (e) {
      const failure = (e as Error).message.slice(0, 300);
      await this.prisma.treasuryPayout.update({
        where: { id: row.id },
        data: { status: 'failed', failure, updated_at: new Date() },
      });
      this.logger.warn(
        { alert: 'treasury_payout_failed', kind: input.kind, failure },
        'treasury: Stripe payout failed',
      );
      return false;
    }
  }

  /** Payouts on their way: Stripe's status (paid / failed) brought in. */
  private async refreshPayouts(): Promise<void> {
    const open = await this.prisma.treasuryPayout.findMany({
      where: {
        status: { in: OPEN_STATUSES },
        stripe_payout_id: { not: null },
      },
      take: 50,
    });
    for (const p of open) {
      try {
        const s = await this.stripe.payoutStatus(p.stripe_payout_id!);
        if (s.status === p.status) continue;
        await this.prisma.treasuryPayout.update({
          where: { id: p.id },
          data: {
            status: s.status,
            failure: s.failure?.slice(0, 300) ?? null,
            updated_at: new Date(),
          },
        });
        if (s.status === 'failed' || s.status === 'canceled') {
          this.logger.warn(
            {
              alert: 'treasury_payout_failed',
              kind: p.kind,
              failure: s.failure,
            },
            'treasury: the bank returned a payout',
          );
        }
      } catch (e) {
        this.logger.warn(
          { err: (e as Error).message, payout: p.id },
          'treasury: payout status check failed',
        );
      }
    }
  }

  /** The banks in Stripe changed since yesterday → an alert e-mail (a
   * stranger with the owner's Stripe login is the one case to catch). */
  private async watchBanks(banks: StripeBank[] | null): Promise<void> {
    if (!banks) return;
    const now = banksFingerprint(banks);
    const before = await this.redis.get(BANKS_KEY);
    if (before !== null && before !== now) {
      this.logger.warn(
        { alert: 'treasury_bank_changed', banks: banks.length },
        'treasury: the banks for payouts changed in Stripe',
      );
    }
    if (before !== now) await this.redis.set(BANKS_KEY, now);
  }

  private async findExpense(id: string) {
    const row = await this.prisma.treasuryExpense.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Expense not found.',
      });
    }
    return row;
  }

  private auditExpense(
    adminId: string,
    action: string,
    id: string,
    before: Record<string, string> | null,
    after: Record<string, string> | null,
  ) {
    return this.audit.record({
      adminId,
      action,
      targetType: 'treasury_expense',
      targetId: id,
      before,
      after,
    });
  }
}

/** Profit → Stripe's default bank; «Расходы» → the one other bank. More
 * than one other bank is ambiguous: the expense money then goes to the
 * default bank too and the screen asks to keep exactly two in Stripe. */
export function resolveBanks(banks: StripeBank[] | null): {
  profit: StripeBank | null;
  expense: StripeBank | null;
} {
  if (!banks || banks.length === 0) return { profit: null, expense: null };
  const profit = banks.find((b) => b.isDefault) ?? null;
  const others = banks.filter((b) => b !== profit);
  return {
    profit,
    expense: profit && others.length === 1 ? others[0] : null,
  };
}

function planSnapshot(
  plan: Plan,
  state: StripeTreasuryState,
): Prisma.InputJsonValue {
  return {
    availableCents: state.availableCents,
    pendingCents: state.pendingCents,
    reserveTargetCents: plan.reserveTargetCents,
    expenseAllowanceCents: plan.expenseAllowanceCents,
    monthlyCostCents: plan.monthlyCostCents,
    shortfallCents: plan.shortfallCents,
  };
}

function payoutDto(p: TreasuryPayout): TreasuryPayoutDto {
  return {
    id: p.id,
    period: p.period,
    kind: p.kind,
    trigger: p.trigger,
    amountCents: p.amount_cents,
    destinationLabel: p.destination_label,
    status: p.status,
    failure: p.failure,
    createdAt: p.created_at.toISOString(),
  };
}

function expenseAudit(r: {
  name: string;
  monthly_cents: number;
  active: boolean;
}): Record<string, string> {
  return {
    name: r.name,
    monthlyCents: String(r.monthly_cents),
    active: String(r.active),
  };
}
