import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PayrollEmployee, PayrollPayout } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import { PayrollStripeService } from './payroll-stripe.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import {
  PAYROLL_MAX_CENTS,
  type CreatePayrollEmployeeDto,
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
  ) {}

  async employees(includeInactive = false): Promise<PayrollEmployeeDto[]> {
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
    return rows.map((r) => presentEmployee(r, r.payouts[0]?.period ?? null));
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
    return presentEmployee(row, null);
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
    return presentEmployee(row, null);
  }

  /**
   * "Выплатить" for many people at once: one payout per person for
   * [period] (their fixed amount, or the amount given for this run).
   * People already paid for the period are skipped, not paid twice.
   */
  async payBulk(
    admin: AdminActor,
    dto: PayrollBulkPayDto,
  ): Promise<PayrollBulkResultDto> {
    const ids = [...new Set(dto.employeeIds)];
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
        cents < 1 ||
        cents > PAYROLL_MAX_CENTS
      ) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Amounts: a whole number of cents for a selected person.',
          details: { field: 'amounts' },
        });
      }
    }
    const batchId = randomUUID();
    const totals: Record<string, number> = {};
    let alreadyPaid: string[] = [];
    let count = 0;
    let created: { id: string; employee: PayrollEmployee; cents: number }[] =
      [];
    await withTxRetry(this.prisma, async (tx) => {
      const paid = await tx.payrollPayout.findMany({
        where: {
          employee_id: { in: ids },
          period: dto.period,
          status: { in: COUNTS_AS_PAID },
        },
        select: { employee_id: true },
      });
      alreadyPaid = [...new Set(paid.map((p) => p.employee_id))];
      const todo = people.filter((p) => !alreadyPaid.includes(p.id));
      for (const k of Object.keys(totals)) delete totals[k];
      count = todo.length;
      if (todo.length === 0) return;
      created = todo.map((p) => ({
        id: randomUUID(),
        employee: p,
        cents: amounts[p.id] ?? p.amount_cents,
      }));
      await tx.payrollPayout.createMany({
        data: created.map(({ id, employee: p, cents }) => {
          totals[p.currency] = (totals[p.currency] ?? 0) + cents;
          return {
            id,
            employee_id: p.id,
            batch_id: batchId,
            period: dto.period,
            amount_cents: cents,
            currency: p.currency,
            method,
            status: viaStripe ? 'processing' : 'paid',
            note: dto.note || null,
            created_by: admin.id,
          };
        }),
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: 'payroll.pay_bulk',
          targetType: 'payroll_batch',
          targetId: batchId,
          after: {
            period: dto.period,
            method,
            count: todo.length,
            totals,
            employeeIds: todo.map((p) => p.id),
            skippedAlreadyPaid: alreadyPaid,
          },
          ip: admin.ip,
        },
        tx,
      );
    });
    if (count === 0) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Everyone selected is already paid for this period.',
      });
    }
    const failed = viaStripe ? await this.sendTransfers(admin, created) : [];
    for (const f of created.filter((c) => failed.includes(c.employee.id))) {
      totals[f.employee.currency] -= f.cents;
    }
    return {
      batchId,
      count: count - failed.length,
      totals,
      alreadyPaid,
      failed,
    };
  }

  /** Money moves outside the DB transaction: each payout row is
   * `processing` until Stripe answers; the payout id is the idempotency
   * key, so a retry never pays twice. Returns the employees that failed. */
  private async sendTransfers(
    admin: AdminActor,
    rows: { id: string; employee: PayrollEmployee; cents: number }[],
  ): Promise<string[]> {
    const failed: string[] = [];
    for (const r of rows) {
      try {
        const transferId = await this.stripe.transfer({
          accountId: r.employee.stripe_account_id!,
          amountCents: r.cents,
          currency: r.employee.currency,
          idempotencyKey: `payroll-${r.id}`,
          metadata: { purpose: 'payroll', payroll_payout_id: r.id },
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
        await this.prisma.payrollPayout.update({
          where: { id: r.id },
          data: { status: 'failed', failure },
        });
        await this.log(admin, 'payroll.payout_failed', r.id, null, {
          employeeId: r.employee.id,
          amountCents: r.cents,
          failure,
        });
      }
    }
    return failed;
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
    const updated = await this.prisma.payrollPayout.update({
      where: { id },
      data: {
        status: 'canceled',
        cancel_reason: reason,
        canceled_at: new Date(),
      },
    });
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
    const [people, paid, stripeAvailable] = await Promise.all([
      this.prisma.payrollEmployee.findMany({ where: { active: true } }),
      this.prisma.payrollPayout.findMany({
        where: { period, status: { in: COUNTS_AS_PAID } },
        select: { employee_id: true, amount_cents: true, currency: true },
      }),
      this.stripe.available(),
    ]);
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
      unpaidEmployees: people.filter((p) => !paidIds.has(p.id)).length,
      stripeAvailable,
    };
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
