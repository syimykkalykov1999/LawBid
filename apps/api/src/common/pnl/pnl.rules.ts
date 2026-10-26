import { netRevenueUsd } from '../economy/economy.rules';

/**
 * Owner 2026-10-25 («Прибыль»): the P&L math as pure functions.
 * Revenue = what the company keeps from succeeded payments — price before
 * tax, minus refunds, minus the estimated Stripe fee (the ONE formula of
 * the economy guard: `netRevenueUsd`). Client → attorney case payments are
 * not in `payments` and never counted. Costs = the vendors' daily bills
 * (the spend snapshot) + the fixed costs the owner typed in «Расходы».
 */

export const PNL_KINDS = [
  'subscriptions',
  'seats',
  'promotions',
  'client_subscriptions',
  'stars',
  'bid_packs',
] as const;
export type PnlKind = (typeof PNL_KINDS)[number];

/** One (day, kind) group of succeeded payments, in cents. */
export interface PaymentDayRow {
  /** UTC day, YYYY-MM-DD, of paid_at. */
  day: string;
  kind: PnlKind;
  subtotalCents: number;
  grossCents: number;
  refundedCents: number;
  payments: number;
}

export interface FixedCostInput {
  id: string;
  label: string;
  usd: number;
  period: 'month' | 'year' | 'once';
  paidMonth?: string | null;
}

export interface PnlPeriod {
  revenueUsd: number;
  vendorCostUsd: number;
  fixedCostUsd: number;
  costUsd: number;
  profitUsd: number;
  /** profit / revenue × 100; null while there is no revenue. */
  marginPercent: number | null;
}

export interface PnlWeek {
  weekStart: string;
  revenueUsd: number;
  costUsd: number;
  profitUsd: number;
  marginPercent: number | null;
}

export interface PnlDay {
  day: string;
  revenueUsd: number;
  costUsd: number;
  profitUsd: number;
}

export interface PnlKindLine {
  kind: PnlKind;
  revenueUsd: number;
}

export interface PnlSnapshot {
  /** UTC day the figures are counted to (today, partial). */
  asOf: string;
  today: PnlPeriod;
  week: PnlPeriod;
  month: PnlPeriod;
  /** 12 weeks, oldest first, the last one is the current week (partial). */
  weeks: PnlWeek[];
  /** Last 30 days, oldest first, the last one is today (partial). */
  days: PnlDay[];
  /** This month's net revenue by source, biggest first (zero lines left out). */
  byKind: PnlKindLine[];
  /** First day the vendors' bills are known for (earlier: fixed costs only). */
  vendorDataFrom: string | null;
}

const DAY_MS = 86_400_000;
const r2 = (v: number) => Math.round(v * 100) / 100;
const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The Monday (UTC) of the week [day] (YYYY-MM-DD) falls in. */
export function weekStart(day: string): string {
  const ms = dayMs(day);
  const dow = (new Date(ms).getUTCDay() + 6) % 7; // Mon = 0
  return isoDay(ms - dow * DAY_MS);
}

export function marginPercent(
  profitUsd: number,
  revenueUsd: number,
): number | null {
  return revenueUsd > 0 ? r2((profitUsd / revenueUsd) * 100) : null;
}

function daysInMonthOf(day: string): number {
  const d = new Date(dayMs(day));
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
}

/** What one fixed cost adds to the month [ym] — same rule as «Расходы». */
function fixedInMonth(f: FixedCostInput, ym: string): number {
  if (f.period === 'month') return f.usd;
  if (f.period === 'year') return f.usd / 12;
  return f.paidMonth === ym ? f.usd : 0;
}

/** Fixed costs of one day: the month's share, split evenly. */
function fixedOnDay(fixed: FixedCostInput[], day: string): number {
  const ym = day.slice(0, 7);
  const monthly = fixed.reduce((s, f) => s + fixedInMonth(f, ym), 0);
  return monthly / daysInMonthOf(day);
}

export function buildPnl(input: {
  rows: PaymentDayRow[];
  vendorDaily: { date: string; usd: number }[];
  fixed: FixedCostInput[];
  now: Date;
}): PnlSnapshot {
  const today = isoDay(input.now.getTime());
  const week = weekStart(today);
  const monthFirst = `${today.slice(0, 8)}01`;

  const revenueByDay = new Map<string, number>();
  const monthByKind = new Map<PnlKind, number>();
  for (const r of input.rows) {
    const net = netRevenueUsd({
      subtotalCents: r.subtotalCents,
      grossCents: r.grossCents,
      refundedCents: r.refundedCents,
      payments: r.payments,
    });
    revenueByDay.set(r.day, (revenueByDay.get(r.day) ?? 0) + net);
    if (r.day >= monthFirst && r.day <= today) {
      monthByKind.set(r.kind, (monthByKind.get(r.kind) ?? 0) + net);
    }
  }
  const vendorByDay = new Map<string, number>();
  for (const v of input.vendorDaily) {
    vendorByDay.set(v.date, (vendorByDay.get(v.date) ?? 0) + v.usd);
  }

  const period = (from: string, to: string): PnlPeriod => {
    let revenue = 0;
    let vendor = 0;
    let fixed = 0;
    for (let ms = dayMs(from); ms <= dayMs(to); ms += DAY_MS) {
      const d = isoDay(ms);
      revenue += revenueByDay.get(d) ?? 0;
      vendor += vendorByDay.get(d) ?? 0;
      fixed += fixedOnDay(input.fixed, d);
    }
    const cost = vendor + fixed;
    const profit = revenue - cost;
    return {
      revenueUsd: r2(revenue),
      vendorCostUsd: r2(vendor),
      fixedCostUsd: r2(fixed),
      costUsd: r2(cost),
      profitUsd: r2(profit),
      marginPercent: marginPercent(profit, revenue),
    };
  };

  const weeks: PnlWeek[] = [];
  for (let i = 11; i >= 0; i--) {
    const from = isoDay(dayMs(week) - i * 7 * DAY_MS);
    const end = isoDay(dayMs(from) + 6 * DAY_MS);
    const p = period(from, end > today ? today : end);
    weeks.push({
      weekStart: from,
      revenueUsd: p.revenueUsd,
      costUsd: p.costUsd,
      profitUsd: p.profitUsd,
      marginPercent: p.marginPercent,
    });
  }

  const days: PnlDay[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = isoDay(dayMs(today) - i * DAY_MS);
    const p = period(d, d);
    days.push({
      day: d,
      revenueUsd: p.revenueUsd,
      costUsd: p.costUsd,
      profitUsd: p.profitUsd,
    });
  }

  const dates = input.vendorDaily.map((v) => v.date).sort();
  return {
    asOf: today,
    today: period(today, today),
    week: period(week, today),
    month: period(monthFirst, today),
    weeks,
    days,
    byKind: [...monthByKind.entries()]
      .map(([kind, v]) => ({ kind, revenueUsd: r2(v) }))
      .filter((k) => k.revenueUsd > 0)
      .sort((a, b) => b.revenueUsd - a.revenueUsd),
    vendorDataFrom: dates[0] ?? null,
  };
}
