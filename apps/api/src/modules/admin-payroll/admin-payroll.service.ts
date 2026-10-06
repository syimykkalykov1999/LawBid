import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  PayrollAccrual,
  PayrollEmployee,
  PayrollPayout,
} from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import { PayrollStripeService } from './payroll-stripe.service';
import { PayrollPartnersBridge } from './payroll-partners.bridge';
import { PayrollAccrualsService, stripeFee } from './payroll-accruals.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import {
  PAYROLL_MAX_CENTS,
  type CreatePayrollAccrualDto,
  type CreatePayrollEmployeeDto,
  type PayrollAccrualDto,
  type PayrollAccrualsQueryDto,
  type PayrollBulkPayDto,
  type PayrollBulkResultDto,
  type PayrollEmployeeDto,
  type PayrollPayoutDto,
  type PayrollPayoutsQueryDto,
  type PayrollStripeLinkDto,
  type PayrollSummaryDto,
  type UpdatePayrollEmployeeDto,
} from './admin-payroll.dto';

const PAYOUTS_PAGE = 500;

export interface PayrollAutoDue {
  /** Flag payroll_stripe_payouts on and Stripe keys saved. */
  stripeReady: boolean;
  /** Linked people with something to receive. */
  employeeIds: string[];
  /** What the run takes from the Stripe balance at most, cents. */
  dueCents: number;
  /** Names of people on a salary who are paid by hand. */
  notLinked: string[];
}

interface PlannedPayout {
  id: string;
  employee: PayrollEmployee;
  base: number;
  commission: number;
  gross: number;
  fee: number;
  net: number;
  accrualIds: string[];
  eventRefs: string[];
}

function sumBy(
  rows: PlannedPayout[],
  pick: (r: PlannedPayout) => number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const c = r.employee.currency;
    out[c] = (out[c] ?? 0) + pick(r);
  }
  return out;
}

/** A payment that counts as "this person got paid for the period". */
const COUNTS_AS_PAID = ['paid', 'processing'];

/**
 * Owner 2026-10-05 — "Зарплаты": the people on payroll with a fixed monthly
 * amount and the payments made to them. By default LawBid only records the
 * payment (bank transfer, Zelle, cash…). With method `stripe` (flag
 * payroll_stripe_payouts + Stripe keys) it sends a Stripe Connect transfer
 * to the account the person linked through their Stripe link. One person
 * is paid once per period; a mistaken payment is canceled with a reason
 * (a Stripe one is reversed). Every write is one audit row the super admin
 * and the deputy can read.
 */
@Injectable()
export class AdminPayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly stripe: PayrollStripeService,
    private readonly accruals: PayrollAccrualsService,
    @Optional() private readonly partnersBridge?: PayrollPartnersBridge,
  ) {}

  async employees(includeInactive = false): Promise<PayrollEmployeeDto[]> {
    // Owner 2026-10-05: approved partner commissions show up as «Начислено».
    await this.partnersBridge?.sync();
    const rows = await this.prisma.payrollEmployee.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: {
        payouts: {
          where: { status: { in: COUNTS_AS_PAID } },
          orderBy: { created_at: 'desc' },
          take: 1,
          select: { period: true },
        },
      },
    });
    const pending = await this.prisma.payrollAccrual.groupBy({
      by: ['employee_id', 'currency'],
      where: { status: 'pending', employee_id: { in: rows.map((r) => r.id) } },
      _sum: { amount_cents: true },
    });
    return rows.map((r) =>
      presentEmployee(
        r,
        r.payouts[0]?.period ?? null,
        pending
          .filter((x) => x.employee_id === r.id && x.currency === r.currency)
          .reduce((t, x) => t + (x._sum.amount_cents ?? 0), 0),
      ),
    );
  }

  async create(
    admin: AdminActor,
    dto: CreatePayrollEmployeeDto,
  ): Promise<PayrollEmployeeDto> {
    if (dto.adminUserId) await this.assertAdmin(dto.adminUserId);
    const row = await this.prisma.payrollEmployee.create({
      data: {
        name: dto.name,
        role_title: dto.roleTitle ?? '',
        admin_user_id: dto.adminUserId ?? null,
        amount_cents: dto.amountCents,
        currency: dto.currency ?? 'usd',
        method_note: dto.methodNote ?? '',
        email: dto.email ?? null,
        created_by: admin.id,
      },
    });
    await this.log(admin, 'payroll.employee_create', row.id, null, {
      name: row.name,
      amountCents: row.amount_cents,
      currency: row.currency,
    });
    return presentEmployee(row, null, 0);
  }

  async update(
    admin: AdminActor,
    id: string,
    dto: UpdatePayrollEmployeeDto,
  ): Promise<PayrollEmployeeDto> {
    const before = await this.employee(id);
    const row = await this.prisma.payrollEmployee.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.roleTitle !== undefined ? { role_title: dto.roleTitle } : {}),
        ...(dto.amountCents !== undefined
          ? { amount_cents: dto.amountCents }
          : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
        ...(dto.methodNote !== undefined
          ? { method_note: dto.methodNote }
          : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        updated_at: new Date(),
      },
    });
    await this.log(
      admin,
      'payroll.employee_update',
      id,
      {
        name: before.name,
        amountCents: before.amount_cents,
        currency: before.currency,
        active: before.active,
      },
      {
        name: row.name,
        amountCents: row.amount_cents,
        currency: row.currency,
        active: row.active,
      },
    );
    return presentEmployee(row, null, 0);
  }

  /**
   * "Выплатить" for many people at once (owner 2026-10-05: flexible pay).
   * Each person gets their fixed amount for [period] (or the amount given
   * for this run; 0 skips the salary) plus every pending accrual —
   * partner commissions, bonuses, adjustments. The fixed salary is paid
   * once per period; commissions that came later are paid on the next
   * run. Through Stripe, Stripe's cost is taken from the person's payout
   * (gross − fee = net), never from the platform.
   */
  async payBulk(
    admin: AdminActor | null,
    dto: PayrollBulkPayDto,
  ): Promise<PayrollBulkResultDto> {
    const ids = [...new Set(dto.employeeIds)];
    await this.partnersBridge?.sync();
    const people = await this.prisma.payrollEmployee.findMany({
      where: { id: { in: ids }, active: true },
    });
    if (people.length !== ids.length) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Some people are not on payroll (or were taken off it).',
      });
    }
    const method = dto.method ?? 'manual';
    const viaStripe = method === 'stripe';
    if (viaStripe) {
      if (!(await this.stripe.available())) {
        throw new ConflictException({
          code: ErrorCode.VALIDATION_ERROR,
          message:
            'Stripe payouts are off: turn on payroll_stripe_payouts and save the Stripe keys.',
        });
      }
      const notLinked = people.filter(
        (p) => !p.stripe_account_id || !p.stripe_payouts_enabled,
      );
      if (notLinked.length > 0) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: `Not linked to Stripe yet: ${notLinked.map((p) => p.name).join(', ')}.`,
          details: { field: 'employeeIds' },
        });
      }
    }
    const amounts = dto.amounts ?? {};
    for (const [id, cents] of Object.entries(amounts)) {
      if (
        !ids.includes(id) ||
        !Number.isInteger(cents) ||
        cents < 0 ||
        cents > PAYROLL_MAX_CENTS
      ) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Amounts: a whole number of cents for a selected person.',
          details: { field: 'amounts' },
        });
      }
    }
    const fees = viaStripe ? await this.accruals.feeSettings() : null;
    const batchId = randomUUID();
    let alreadyPaid: string[] = [];
    let nothingOwed: string[] = [];
    let created: PlannedPayout[] = [];
    await withTxRetry(this.prisma, async (tx) => {
      const [paid, pending, stripeThisPeriod] = await Promise.all([
        tx.payrollPayout.findMany({
          where: {
            employee_id: { in: ids },
            period: dto.period,
            status: { in: COUNTS_AS_PAID },
            base_cents: { gt: 0 },
          },
          select: { employee_id: true },
        }),
        tx.payrollAccrual.findMany({
          where: { employee_id: { in: ids }, status: 'pending' },
          select: {
            id: true,
            employee_id: true,
            amount_cents: true,
            currency: true,
            event_ref: true,
          },
        }),
        viaStripe
          ? tx.payrollPayout.findMany({
              where: {
                employee_id: { in: ids },
                period: dto.period,
                method: 'stripe',
                status: { in: COUNTS_AS_PAID },
              },
              select: { employee_id: true },
            })
          : Promise.resolve([]),
      ]);
      const basePaid = new Set(paid.map((p) => p.employee_id));
      const monthlyCharged = new Set(
        stripeThisPeriod.map((p) => p.employee_id),
      );
      alreadyPaid = [];
      nothingOwed = [];
      created = [];
      for (const p of people) {
        const base = basePaid.has(p.id) ? 0 : (amounts[p.id] ?? p.amount_cents);
        const mine = pending.filter(
          (a) => a.employee_id === p.id && a.currency === p.currency,
        );
        const commission = mine.reduce((s, a) => s + a.amount_cents, 0);
        const gross = base + commission;
        const fee = fees
          ? stripeFee(gross, fees, !monthlyCharged.has(p.id))
          : 0;
        if (gross <= 0 || gross - fee <= 0) {
          (basePaid.has(p.id) ? alreadyPaid : nothingOwed).push(p.id);
          continue;
        }
        created.push({
          id: randomUUID(),
          employee: p,
          base,
          commission,
          gross,
          fee,
          net: gross - fee,
          accrualIds: mine.map((a) => a.id),
          eventRefs: mine.map((a) => a.event_ref),
        });
      }
      if (created.length === 0) return;
      await tx.payrollPayout.createMany({
        data: created.map((c) => ({
          id: c.id,
          employee_id: c.employee.id,
          batch_id: batchId,
          period: dto.period,
          amount_cents: c.gross,
          base_cents: c.base,
          commission_cents: c.commission,
          fee_cents: c.fee,
          net_cents: c.net,
          currency: c.employee.currency,
          method,
          status: viaStripe ? 'processing' : 'paid',
          note: dto.note || null,
          created_by: admin?.id ?? null,
        })),
      });
      const now = new Date();
      for (const c of created) {
        if (c.accrualIds.length === 0) continue;
        await tx.payrollAccrual.updateMany({
          where: { id: { in: c.accrualIds }, status: 'pending' },
          data: { status: 'paid', payout_id: c.id, paid_at: now },
        });
      }
      // The automatic pay day (admin null) is recorded by its payout rows
      // (note «Авто», no author) and the worker log.
      if (admin) {
        await this.audit.record(
          {
            adminId: admin.id,
            action: 'payroll.pay_bulk',
            targetType: 'payroll_batch',
            targetId: batchId,
            after: {
              period: dto.period,
              method,
              count: created.length,
              totals: sumBy(created, (c) => c.gross),
              fees: sumBy(created, (c) => c.fee),
              commissions: sumBy(created, (c) => c.commission),
              employeeIds: created.map((c) => c.employee.id),
              skippedAlreadyPaid: alreadyPaid,
              skippedNothingOwed: nothingOwed,
            },
            ip: admin.ip,
          },
          tx,
        );
      }
    });
    if (created.length === 0) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message:
          alreadyPaid.length > 0
            ? 'Everyone selected is already paid for this period.'
            : 'Nothing is owed to the people selected.',
      });
    }
    const failed = viaStripe ? await this.sendTransfers(admin, created) : [];
    const done = created.filter((c) => !failed.includes(c.employee.id));
    await this.accruals.settled(
      done.flatMap((c) => c.eventRefs.map((ref) => ({ ref, payoutId: c.id }))),
      'paid',
    );
    return {
      batchId,
      count: done.length,
      totals: sumBy(done, (c) => c.gross),
      fees: sumBy(done, (c) => c.fee),
      net: sumBy(done, (c) => c.net),
      commissions: sumBy(done, (c) => c.commission),
      alreadyPaid,
      nothingOwed,
      failed,
    };
  }

  /** Money moves outside the DB transaction: each payout row is
   * `processing` until Stripe answers; the payout id is the idempotency
   * key, so a retry never pays twice. A failed transfer puts its
   * commissions back to pending. Returns the employees that failed. */
  private async sendTransfers(
    admin: AdminActor | null,
    rows: PlannedPayout[],
  ): Promise<string[]> {
    const failed: string[] = [];
    for (const r of rows) {
      try {
        const transferId = await this.stripe.transfer({
          accountId: r.employee.stripe_account_id!,
          amountCents: r.net,
          currency: r.employee.currency,
          idempotencyKey: `payroll-${r.id}`,
          metadata: {
            purpose: 'payroll',
            payroll_payout_id: r.id,
            gross_cents: String(r.gross),
            fee_cents: String(r.fee),
          },
        });
        await this.prisma.payrollPayout.update({
          where: { id: r.id },
          data: { status: 'paid', transfer_id: transferId },
        });
      } catch (e) {
        failed.push(r.employee.id);
        const failure = (e instanceof Error ? e.message : 'Stripe error').slice(
          0,
          300,
        );
        await this.prisma.$transaction([
          this.prisma.payrollPayout.update({
            where: { id: r.id },
            data: { status: 'failed', failure },
          }),
          this.prisma.payrollAccrual.updateMany({
            where: { payout_id: r.id },
            data: { status: 'pending', payout_id: null, paid_at: null },
          }),
        ]);
        if (admin) {
          await this.log(admin, 'payroll.payout_failed', r.id, null, {
            employeeId: r.employee.id,
            amountCents: r.gross,
            failure,
          });
        }
      }
    }
    return failed;
  }

  /**
   * Owner 2026-10-06 «зарплаты платятся сами»: who the automatic pay day
   * pays through Stripe for `period` and how much it takes from the
   * platform's Stripe balance (salary not yet paid this period + pending
   * commissions and bonuses; Stripe's cost comes out of each payout, so
   * the gross is what leaves the balance at most). Dollar payroll only;
   * people not linked to Stripe are listed by name — they are paid by hand.
   */
  async autoDue(period: string): Promise<PayrollAutoDue> {
    const stripeReady = await this.stripe.available();
    await this.partnersBridge?.sync();
    const people = await this.prisma.payrollEmployee.findMany({
      where: { active: true, currency: 'usd' },
      orderBy: { name: 'asc' },
    });
    const linked = people.filter(
      (p) => stripeReady && p.stripe_account_id && p.stripe_payouts_enabled,
    );
    const ids = linked.map((p) => p.id);
    const [paid, pending] = await Promise.all([
      this.prisma.payrollPayout.findMany({
        where: {
          employee_id: { in: ids },
          period,
          status: { in: COUNTS_AS_PAID },
          base_cents: { gt: 0 },
        },
        select: { employee_id: true },
      }),
      this.prisma.payrollAccrual.groupBy({
        by: ['employee_id'],
        where: { employee_id: { in: ids }, status: 'pending', currency: 'usd' },
        _sum: { amount_cents: true },
      }),
    ]);
    const basePaid = new Set(paid.map((p) => p.employee_id));
    let dueCents = 0;
    const employeeIds: string[] = [];
    for (const p of linked) {
      const owed =
        (basePaid.has(p.id) ? 0 : p.amount_cents) +
        (pending.find((x) => x.employee_id === p.id)?._sum.amount_cents ?? 0);
      if (owed <= 0) continue;
      dueCents += owed;
      employeeIds.push(p.id);
    }
    return {
      stripeReady,
      employeeIds,
      dueCents,
      notLinked: people
        .filter((p) => !linked.includes(p) && p.amount_cents > 0)
        .map((p) => p.name),
    };
  }

  /** The Stripe page where the person links a bank account or card
   * (creates their Express account on first use). Also refreshes whether
   * Stripe already lets them receive payouts. */
  async stripeLink(
    admin: AdminActor,
    id: string,
  ): Promise<PayrollStripeLinkDto> {
    const row = await this.employee(id);
    let accountId = row.stripe_account_id;
    if (!accountId) {
      accountId = await this.stripe.createAccount(row.id, row.email);
      await this.prisma.payrollEmployee.update({
        where: { id },
        data: { stripe_account_id: accountId, updated_at: new Date() },
      });
      await this.log(admin, 'payroll.stripe_account_create', id, null, {
        name: row.name,
      });
    }
    const [url, payoutsEnabled] = await Promise.all([
      this.stripe.onboardingUrl(accountId),
      this.stripe.payoutsEnabled(accountId),
    ]);
    if (payoutsEnabled !== row.stripe_payouts_enabled) {
      await this.prisma.payrollEmployee.update({
        where: { id },
        data: { stripe_payouts_enabled: payoutsEnabled },
      });
    }
    return { url, payoutsEnabled };
  }

  async payouts(q: PayrollPayoutsQueryDto): Promise<PayrollPayoutDto[]> {
    const rows = await this.prisma.payrollPayout.findMany({
      where: {
        ...(q.period ? { period: q.period } : {}),
        ...(q.employeeId ? { employee_id: q.employeeId } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: PAYOUTS_PAGE,
      include: { employee: { select: { name: true } } },
    });
    return rows.map((r) => presentPayout(r, r.employee.name));
  }

  async cancel(
    admin: AdminActor,
    id: string,
    reason: string,
  ): Promise<PayrollPayoutDto> {
    const row = await this.prisma.payrollPayout.findUnique({
      where: { id },
      include: { employee: { select: { name: true } } },
    });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'No such payment.',
      });
    }
    if (row.status !== 'paid' && row.status !== 'failed') {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message:
          row.status === 'processing'
            ? 'Stripe is still sending this payment; try again in a minute.'
            : 'This payment is already canceled.',
      });
    }
    if (row.status === 'paid' && row.transfer_id) {
      try {
        await this.stripe.reverse(row.transfer_id, `payroll-reverse-${id}`);
      } catch (e) {
        throw new ConflictException({
          code: ErrorCode.VALIDATION_ERROR,
          message: `Stripe did not return the money (${
            e instanceof Error ? e.message : 'error'
          }); it may already be paid out to their bank.`,
        });
      }
    }
    const reverted = await this.prisma.payrollAccrual.findMany({
      where: { payout_id: id, status: 'paid' },
      select: { event_ref: true },
    });
    const [updated] = await this.prisma.$transaction([
      this.prisma.payrollPayout.update({
        where: { id },
        data: {
          status: 'canceled',
          cancel_reason: reason,
          canceled_at: new Date(),
        },
      }),
      // The commissions in it are owed again: paid with the next payout.
      this.prisma.payrollAccrual.updateMany({
        where: { payout_id: id },
        data: { status: 'pending', payout_id: null, paid_at: null },
      }),
    ]);
    if (row.status === 'paid') {
      await this.accruals.settled(
        reverted.map((a) => ({ ref: a.event_ref, payoutId: id })),
        'unpaid',
      );
    }
    await this.log(
      admin,
      'payroll.payout_cancel',
      id,
      {
        status: row.status,
        amountCents: row.amount_cents,
        period: row.period,
        method: row.method,
      },
      { status: 'canceled', reason },
    );
    return presentPayout(updated, row.employee.name);
  }

  /** What [period] costs and what is already paid ("калькулятор"). */
  async summary(period: string): Promise<PayrollSummaryDto> {
    const [people, paid, stripeAvailable, pendingRows, stripeFees] =
      await Promise.all([
        this.prisma.payrollEmployee.findMany({ where: { active: true } }),
        this.prisma.payrollPayout.findMany({
          where: { period, status: { in: COUNTS_AS_PAID } },
          select: { employee_id: true, amount_cents: true, currency: true },
        }),
        this.stripe.available(),
        this.prisma.payrollAccrual.groupBy({
          by: ['currency'],
          where: { status: 'pending', employee: { active: true } },
          _sum: { amount_cents: true },
        }),
        this.accruals.feeSettings(),
      ]);
    const pending: Record<string, number> = {};
    for (const r of pendingRows) pending[r.currency] = r._sum.amount_cents ?? 0;
    const monthly: Record<string, number> = {};
    for (const p of people) {
      monthly[p.currency] = (monthly[p.currency] ?? 0) + p.amount_cents;
    }
    const paidSum: Record<string, number> = {};
    for (const p of paid) {
      paidSum[p.currency] = (paidSum[p.currency] ?? 0) + p.amount_cents;
    }
    const paidIds = new Set(paid.map((p) => p.employee_id));
    return {
      period,
      activeEmployees: people.length,
      monthly,
      paid: paidSum,
      unpaidEmployees: people.filter(
        (p) => p.amount_cents > 0 && !paidIds.has(p.id),
      ).length,
      stripeAvailable,
      pending,
      stripeFees,
    };
  }

  /** Commissions, bonuses and adjustments (newest first). */
  async accrualList(q: PayrollAccrualsQueryDto): Promise<PayrollAccrualDto[]> {
    const rows = await this.prisma.payrollAccrual.findMany({
      where: {
        ...(q.employeeId ? { employee_id: q.employeeId } : {}),
        ...(q.status ? { status: q.status } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: PAYOUTS_PAGE,
    });
    return rows.map(presentAccrual);
  }

  /** A bonus or correction by hand; paid with the person's next payout. */
  async addAccrual(
    admin: AdminActor,
    employeeId: string,
    dto: CreatePayrollAccrualDto,
  ): Promise<PayrollAccrualDto> {
    const person = await this.employee(employeeId);
    const row = await this.prisma.payrollAccrual.create({
      data: {
        employee_id: person.id,
        source: 'admin',
        kind: dto.kind,
        event_ref: `admin:${randomUUID()}`,
        amount_cents: dto.amountCents,
        currency: person.currency,
        period: dto.period,
        note: dto.note,
      },
    });
    await this.log(admin, 'payroll.accrual_add', person.id, null, {
      accrualId: row.id,
      kind: row.kind,
      amountCents: row.amount_cents,
      period: row.period,
    });
    return presentAccrual(row);
  }

  /** Takes back a pending accrual (any source) with a reason. */
  async cancelAccrual(
    admin: AdminActor,
    id: string,
    reason: string,
  ): Promise<PayrollAccrualDto> {
    const row = await this.prisma.payrollAccrual.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'No such accrual.',
      });
    }
    const updated = await this.prisma.payrollAccrual.updateMany({
      where: { id, status: 'pending' },
      data: {
        status: 'canceled',
        canceled_at: new Date(),
        note: (row.note ? `${row.note} · ${reason}` : reason).slice(0, 300),
      },
    });
    if (updated.count === 0) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message:
          row.status === 'paid'
            ? 'Already paid: cancel the payment, or add a negative adjustment.'
            : 'This accrual is already canceled.',
      });
    }
    await this.log(admin, 'payroll.accrual_cancel', row.employee_id, null, {
      accrualId: id,
      amountCents: row.amount_cents,
      reason,
    });
    return presentAccrual({
      ...row,
      status: 'canceled',
      canceled_at: new Date(),
    });
  }

  private async employee(id: string): Promise<PayrollEmployee> {
    const row = await this.prisma.payrollEmployee.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Not on payroll.',
      });
    }
    return row;
  }

  private async assertAdmin(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (u?.role !== 'admin') {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'adminUserId must be an admin account.',
        details: { field: 'adminUserId' },
      });
    }
  }

  private log(
    admin: AdminActor,
    action: string,
    targetId: string,
    before: Record<string, string | number | boolean | null> | null,
    after: Record<string, string | number | boolean | null> | null,
  ) {
    return this.audit.record({
      adminId: admin.id,
      action,
      targetType: action.startsWith('payroll.payout')
        ? 'payroll_payout'
        : 'payroll_employee',
      targetId,
      before,
      after,
      ip: admin.ip,
    });
  }
}

function presentEmployee(
  r: PayrollEmployee,
  lastPaidPeriod: string | null,
  pendingCents: number,
): PayrollEmployeeDto {
  return {
    id: r.id,
    adminUserId: r.admin_user_id,
    name: r.name,
    roleTitle: r.role_title,
    amountCents: r.amount_cents,
    currency: r.currency,
    methodNote: r.method_note,
    email: r.email,
    stripeLinked: !!r.stripe_account_id,
    stripePayoutsEnabled: r.stripe_payouts_enabled,
    active: r.active,
    lastPaidPeriod,
    userId: r.user_id,
    pendingCents,
    createdAt: r.created_at.toISOString(),
  };
}

function presentPayout(r: PayrollPayout, name: string): PayrollPayoutDto {
  return {
    id: r.id,
    employeeId: r.employee_id,
    employeeName: name,
    batchId: r.batch_id,
    period: r.period,
    amountCents: r.amount_cents,
    baseCents: r.base_cents,
    commissionCents: r.commission_cents,
    feeCents: r.fee_cents,
    netCents: r.net_cents,
    currency: r.currency,
    method: r.method,
    status: r.status,
    note: r.note,
    transferId: r.transfer_id,
    failure: r.failure,
    cancelReason: r.cancel_reason,
    createdAt: r.created_at.toISOString(),
  };
}

function presentAccrual(r: PayrollAccrual): PayrollAccrualDto {
  return {
    id: r.id,
    employeeId: r.employee_id,
    source: r.source,
    kind: r.kind,
    eventRef: r.event_ref,
    amountCents: r.amount_cents,
    currency: r.currency,
    period: r.period,
    note: r.note,
    status: r.status,
    payoutId: r.payout_id,
    createdAt: r.created_at.toISOString(),
  };
}
