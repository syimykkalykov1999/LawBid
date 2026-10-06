import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { CountryPartner, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PayrollAccrualsService } from '../admin-payroll/payroll-accruals.service';
import type { EmailProvider } from '../auth/providers/email/email-provider.interface';
import { EMAIL_PROVIDER } from '../auth/providers/provider.tokens';
import { AdminSessionService } from '../admin-auth/admin-session.service';
import {
  contractCutoff,
  contractEnded,
  COUNTRY_PARTNERS_SETTINGS_KEY,
  type CountryPartnerSettings,
  finishedPeriods,
  settleUntil,
  goalState,
  type GoalState,
  type PartnerGoal,
  periodBounds,
  periodOf,
  readCountryPartnerSettings,
  readGoals,
  settle,
  type Settlement,
} from './country-partners.rules';

/** payroll_accruals.event_ref of a settlement. */
export const SETTLEMENT_REF = 'country_partner:';

export interface SettlementView {
  id: string;
  period: string;
  currency: string;
  grossCents: number;
  refundsCents: number;
  feesCents: number;
  netCents: number;
  sharePercent: number;
  amountCents: number;
  /** held · zero · pending (in payroll) · paid · canceled */
  status: string;
}

export interface GoalView extends PartnerGoal {
  progress: number;
  state: GoalState;
}

/**
 * Owner 2026-10-06: the money side of country partners. Every day (cron
 * `country-partners.sweep`) each finished month of each partner is
 * settled once: the country's paid revenue minus refunds and estimated
 * card fees, times the partner's share. With payouts switched on by the
 * owner and the partnership active, the share goes to payroll (one
 * accrual per settlement) and is paid with the next «Выплатить» / payday;
 * otherwise it waits («held»). Missed goals e-mail the owner once.
 * When the contract ends («Договор до»), the sweep switches the partner
 * off on its own: the team is signed out, revenue after the last day is
 * not counted, and what was earned up to it is still paid.
 */
@Injectable()
export class CountryPartnersService {
  private readonly logger = new Logger(CountryPartnersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accruals: PayrollAccrualsService,
    @Optional() @Inject(EMAIL_PROVIDER) private readonly email?: EmailProvider,
    @Optional() private readonly sessions?: AdminSessionService,
  ) {}

  async settings(): Promise<CountryPartnerSettings> {
    const row = await this.prisma.appConfig.findUnique({
      where: { key: COUNTRY_PARTNERS_SETTINGS_KEY },
    });
    return readCountryPartnerSettings(row?.value);
  }

  /** Daily: end expired contracts, settle finished months, release what
   * may be paid, goals. */
  async sweep(now = new Date()): Promise<{
    settled: number;
    accrued: number;
    alerts: number;
  }> {
    const partners = await this.prisma.countryPartner.findMany();
    const settings = await this.settings();
    let settled = 0;
    let accrued = 0;
    let alerts = 0;
    for (const row of partners) {
      try {
        const p = (await this.expireContract(row, now)) ?? row;
        settled += await this.settlePartner(p, settings, now);
        accrued += await this.release(p);
        alerts += await this.checkGoals(p, now);
      } catch (e) {
        this.logger.error(
          `country partner ${row.id} sweep failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    return { settled, accrued, alerts };
  }

  /** Writes the months not settled yet (each one once). */
  async settlePartner(
    p: CountryPartner,
    settings: CountryPartnerSettings,
    now = new Date(),
  ): Promise<number> {
    const start = p.contract_starts_at ?? p.created_at;
    const periods = finishedPeriods(
      start,
      now,
      settleUntil(p.disabled_at, p.contract_ends_at),
    );
    const cutoff = contractCutoff(p.contract_ends_at);
    if (periods.length === 0) return 0;
    const done = await this.prisma.countryPartnerSettlement.findMany({
      where: { partner_id: p.id, period: { in: periods } },
      select: { period: true },
    });
    const have = new Set(done.map((d) => d.period));
    let n = 0;
    for (const period of periods.filter((x) => !have.has(x))) {
      // The contract's last month counts only up to its last day.
      const { from, to } = periodBounds(period);
      const byCurrency = await this.revenueBetween(
        p.country_code,
        from,
        cutoff && cutoff < to ? cutoff : to,
        settings,
        p.share_bps,
      );
      // A month without sales still gets a row (0), so it isn't redone.
      if (byCurrency.size === 0)
        byCurrency.set(
          'usd',
          settle({ payments: [], refundsCents: 0 }, p.share_bps, settings),
        );
      for (const [currency, s] of byCurrency) {
        await this.prisma.countryPartnerSettlement.upsert({
          where: {
            partner_id_period_currency: {
              partner_id: p.id,
              period,
              currency,
            },
          },
          update: {},
          create: {
            partner_id: p.id,
            period,
            currency,
            gross_cents: s.grossCents,
            refunds_cents: s.refundsCents,
            fees_cents: s.feesCents,
            net_cents: s.netCents,
            share_bps: p.share_bps,
            amount_cents: s.amountCents,
            status: s.amountCents > 0 ? 'held' : 'zero',
          },
        });
        n += 1;
      }
    }
    return n;
  }

  /** The country's paid revenue in [period] per currency. */
  async revenue(
    countryCode: string,
    period: string,
    settings?: CountryPartnerSettings,
    shareBps = 0,
  ): Promise<Map<string, Settlement>> {
    const { from, to } = periodBounds(period);
    return this.revenueBetween(countryCode, from, to, settings, shareBps);
  }

  async revenueBetween(
    countryCode: string,
    from: Date,
    to: Date,
    settings?: CountryPartnerSettings,
    shareBps = 0,
  ): Promise<Map<string, Settlement>> {
    const cfg = settings ?? (await this.settings());
    const payments = await this.prisma.payment.findMany({
      where: {
        status: { in: ['succeeded', 'refunded'] },
        paid_at: { gte: from, lt: to },
        user: { country_code: countryCode },
      },
      select: { amount_cents: true, currency: true },
    });
    const refunds = await this.prisma.refund.findMany({
      where: { status: 'succeeded', created_at: { gte: from, lt: to } },
      select: { amount_cents: true, payment_id: true, user_id: true },
    });
    const local = refunds.length
      ? new Set(
          (
            await this.prisma.user.findMany({
              where: {
                id: { in: [...new Set(refunds.map((r) => r.user_id))] },
                country_code: countryCode,
              },
              select: { id: true },
            })
          ).map((u) => u.id),
        )
      : new Set<string>();
    const mine = refunds.filter((r) => local.has(r.user_id));
    const currencyOf = new Map(
      mine.length
        ? (
            await this.prisma.payment.findMany({
              where: { id: { in: mine.map((r) => r.payment_id) } },
              select: { id: true, currency: true },
            })
          ).map((x) => [x.id, x.currency.toLowerCase()])
        : [],
    );
    const pay = new Map<string, number[]>();
    for (const x of payments) {
      const c = x.currency.toLowerCase();
      pay.set(c, [...(pay.get(c) ?? []), x.amount_cents]);
    }
    const back = new Map<string, number>();
    for (const r of mine) {
      const c = currencyOf.get(r.payment_id) ?? 'usd';
      back.set(c, (back.get(c) ?? 0) + r.amount_cents);
    }
    const out = new Map<string, Settlement>();
    for (const c of new Set([...pay.keys(), ...back.keys()])) {
      out.set(
        c,
        settle(
          { payments: pay.get(c) ?? [], refundsCents: back.get(c) ?? 0 },
          shareBps,
          cfg,
        ),
      );
    }
    return out;
  }

  /**
   * Owner 2026-10-06: the contract's last day has passed → the partner is
   * switched off like «Отключить» in the admin (the whole team is blocked
   * and signed out), the owner and the partner get an e-mail. Already
   * accrued money is not taken back. Returns the updated partner, or null
   * when nothing had to be done.
   */
  async expireContract(
    p: CountryPartner,
    now = new Date(),
  ): Promise<CountryPartner | null> {
    if (
      p.status === 'disabled' ||
      p.contract_expired_at ||
      !contractEnded(p.contract_ends_at, now)
    ) {
      return null;
    }
    const team = await this.prisma.user.findMany({
      where: {
        role: 'admin',
        deleted_at: null,
        status: 'active',
        admin_profile: {
          permissions: { path: ['country_partner'], equals: p.id },
        },
      },
      select: { id: true },
      take: 200,
    });
    const ids = team.map((t) => t.id);
    if (ids.length) {
      await this.prisma.user.updateMany({
        where: { id: { in: ids } },
        data: { status: 'suspended' },
      });
      for (const id of ids) await this.sessions?.revokeAllForUser(id);
    }
    const after = await this.prisma.countryPartner.update({
      where: { id: p.id },
      data: {
        status: 'disabled',
        disabled_at: now,
        contract_expired_at: now,
        suspended_admin_ids: [...new Set([...p.suspended_admin_ids, ...ids])],
      },
    });
    await this.mailContractEnded(after);
    return after;
  }

  private async mailContractEnded(p: CountryPartner): Promise<void> {
    if (!this.email) return;
    const day = p.contract_ends_at?.toISOString().slice(0, 10) ?? '';
    const [owners, lead] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          deleted_at: null,
          admin_profile: { admin_role: 'super_admin' },
        },
        select: { email: true },
      }),
      this.prisma.user.findUnique({
        where: { id: p.lead_admin_id },
        select: { email: true },
      }),
    ]);
    const mails: { to: string; subject: string; text: string }[] = [];
    for (const o of owners) {
      if (!o.email) continue;
      mails.push({
        to: o.email,
        subject: `LawBid: договор с партнёром ${p.name} (${p.country_code}) закончился`,
        text: `Договор с ${p.name} (${p.country_code}) закончился ${day}. Партнёр отключён автоматически: команда вышла из админки, выручка после ${day} ему не начисляется. Заработанное до этой даты будет выплачено как обычно.\n\nЧтобы продолжить работу: Админка → Деньги → Партнёры стран → продлите «Договор до» и нажмите «Включить».`,
      });
    }
    if (lead?.email) {
      mails.push({
        to: lead.email,
        subject: 'LawBid: your country partner agreement has ended',
        text: `Your LawBid country partner agreement for ${p.country_code} ended on ${day}. Admin access for you and your team is closed. Revenue after ${day} is not counted; amounts earned up to that date will be paid out as usual. To continue, please contact LawBid.`,
      });
    }
    for (const m of mails) {
      try {
        await this.email.sendEmail(m);
      } catch (e) {
        this.logger.warn(`contract-end e-mail failed: ${String(e)}`);
      }
    }
  }

  /** Held settlements → payroll, when the owner allows it. */
  async release(p: CountryPartner): Promise<number> {
    if (!p.payouts_enabled) return 0;
    // A partner whose contract ended still gets what was earned before.
    const ended = p.status === 'disabled' && p.contract_expired_at !== null;
    if (p.status !== 'active' && !ended) return 0;
    const held = await this.prisma.countryPartnerSettlement.findMany({
      where: { partner_id: p.id, status: 'held', amount_cents: { gt: 0 } },
      orderBy: { period: 'asc' },
    });
    if (held.length === 0) return 0;
    const lead = await this.prisma.user.findUnique({
      where: { id: p.lead_admin_id },
      select: { email: true },
    });
    let n = 0;
    for (const s of held) {
      // Reuse the ref of an interrupted send; a canceled one (payouts were
      // stopped meanwhile) gets a fresh ref, since refs are unique.
      let ref = s.accrual_ref;
      if (ref) {
        const prev = await this.prisma.payrollAccrual.findUnique({
          where: { event_ref: ref },
          select: { status: true },
        });
        if (prev?.status === 'canceled') ref = null;
      }
      if (!ref) {
        ref = `${SETTLEMENT_REF}${s.id}:${randomUUID()}`;
        await this.prisma.countryPartnerSettlement.update({
          where: { id: s.id },
          data: { accrual_ref: ref },
        });
      }
      const r = await this.accruals.accrue({
        userId: p.lead_admin_id,
        name: p.name,
        email: lead?.email ?? null,
        source: 'country_partner',
        eventRef: ref,
        amountCents: s.amount_cents,
        currency: s.currency,
        period: s.period,
        kind: 'commission',
        note: `Партнёр страны ${p.country_code}: ${s.share_bps / 100}% от ${s.net_cents / 100} ${s.currency.toUpperCase()}`,
        roleTitle: `Партнёр страны ${p.country_code}`,
      });
      await this.prisma.countryPartnerSettlement.update({
        where: { id: s.id },
        data: { status: 'accrued' },
      });
      if (!p.payroll_employee_id) {
        await this.prisma.countryPartner.update({
          where: { id: p.id },
          data: { payroll_employee_id: r.employeeId },
        });
        p.payroll_employee_id = r.employeeId;
      }
      n += 1;
    }
    return n;
  }

  /** Payouts stopped (off, pause, disable): what payroll hasn't paid yet
   * goes back to «held». Paid stays paid. */
  async hold(partnerId: string): Promise<number> {
    const sent = await this.prisma.countryPartnerSettlement.findMany({
      where: { partner_id: partnerId, status: 'accrued' },
      select: { id: true, accrual_ref: true },
    });
    let n = 0;
    for (const s of sent) {
      if (s.accrual_ref) {
        const r = await this.accruals.cancel(
          s.accrual_ref,
          'Выплаты партнёру остановлены',
        );
        if (r === 'paid') continue;
      }
      // The next release sends it again under a fresh ref.
      await this.prisma.countryPartnerSettlement.update({
        where: { id: s.id },
        data: { status: 'held' },
      });
      n += 1;
    }
    return n;
  }

  /** Settlements newest first, with their payroll state. */
  async settlements(partnerId: string, take = 24): Promise<SettlementView[]> {
    const rows = await this.prisma.countryPartnerSettlement.findMany({
      where: { partner_id: partnerId },
      orderBy: [{ period: 'desc' }, { currency: 'asc' }],
      take,
    });
    const refs = rows
      .filter((r) => r.status === 'accrued' && r.accrual_ref)
      .map((r) => r.accrual_ref as string);
    const acc = refs.length
      ? await this.prisma.payrollAccrual.findMany({
          where: { event_ref: { in: refs } },
          select: { event_ref: true, status: true },
        })
      : [];
    const state = new Map(acc.map((a) => [a.event_ref, a.status]));
    return rows.map((r) => ({
      id: r.id,
      period: r.period,
      currency: r.currency,
      grossCents: r.gross_cents,
      refundsCents: r.refunds_cents,
      feesCents: r.fees_cents,
      netCents: r.net_cents,
      sharePercent: r.share_bps / 100,
      amountCents: r.amount_cents,
      status:
        r.status === 'accrued'
          ? (state.get(r.accrual_ref ?? '') ?? 'pending')
          : r.status,
    }));
  }

  /** The month so far, per currency (not settled yet). */
  async currentMonth(p: CountryPartner, now = new Date()) {
    const settings = await this.settings();
    const map = await this.revenue(
      p.country_code,
      periodOf(now),
      settings,
      p.share_bps,
    );
    return [...map.entries()].map(([currency, s]) => ({ currency, ...s }));
  }

  async goals(p: CountryPartner, now = new Date()): Promise<GoalView[]> {
    const goals = readGoals(p.goals);
    const out: GoalView[] = [];
    for (const g of goals) {
      const progress = await this.progress(p, g, now);
      out.push({ ...g, progress, state: goalState(g, progress, now) });
    }
    return out;
  }

  private async progress(
    p: CountryPartner,
    g: PartnerGoal,
    now: Date,
  ): Promise<number> {
    const base: Prisma.UserWhereInput = {
      country_code: p.country_code,
      deleted_at: null,
      placeholder_kind: null,
    };
    if (g.metric === 'attorneys') {
      return this.prisma.user.count({ where: { ...base, role: 'attorney' } });
    }
    if (g.metric === 'clients') {
      return this.prisma.user.count({ where: { ...base, role: 'client' } });
    }
    const end = new Date(`${g.deadline}T23:59:59.999Z`);
    const to = end < now ? end : now;
    const from = p.contract_starts_at ?? p.created_at;
    const map = await this.revenueBetween(p.country_code, from, to);
    return Math.max(0, map.get('usd')?.netCents ?? 0);
  }

  /** E-mails the super admins once per missed goal. */
  async checkGoals(p: CountryPartner, now = new Date()): Promise<number> {
    if (p.status === 'disabled') return 0;
    const views = await this.goals(p, now);
    const missed = views.filter((g) => g.state === 'missed' && !g.alerted);
    if (missed.length === 0) return 0;
    const owners = await this.prisma.user.findMany({
      where: {
        deleted_at: null,
        admin_profile: { admin_role: 'super_admin' },
      },
      select: { email: true },
    });
    const lines = missed
      .map(
        (g) =>
          `• ${label(g.metric)}: ${fmt(g)} of ${fmtTarget(g)} by ${g.deadline}`,
      )
      .join('\n');
    for (const o of owners) {
      if (!o.email || !this.email) continue;
      try {
        await this.email.sendEmail({
          to: o.email,
          subject: `LawBid: country partner ${p.name} (${p.country_code}) missed a goal`,
          text: `${p.name} (${p.country_code}) did not reach:\n\n${lines}\n\nAdmin → Деньги → Партнёры стран. You can pause payouts, change the terms or disable the partner there.`,
        });
      } catch (e) {
        this.logger.warn(`goal alert e-mail failed: ${String(e)}`);
      }
    }
    const goals = readGoals(p.goals).map((g) =>
      missed.some((m) => m.metric === g.metric && m.deadline === g.deadline)
        ? { ...g, alerted: true }
        : g,
    );
    await this.prisma.countryPartner.update({
      where: { id: p.id },
      data: { goals: goals as unknown as Prisma.InputJsonValue },
    });
    return missed.length;
  }
}

const label = (m: PartnerGoal['metric']) =>
  m === 'attorneys' ? 'Attorneys' : m === 'clients' ? 'Clients' : 'Net revenue';
const fmt = (g: GoalView) =>
  g.metric === 'revenue_cents'
    ? `$${(g.progress / 100).toFixed(2)}`
    : String(g.progress);
const fmtTarget = (g: GoalView) =>
  g.metric === 'revenue_cents'
    ? `$${(g.target / 100).toFixed(2)}`
    : String(g.target);
