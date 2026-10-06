/**
 * Owner 2026-10-06: pure rules of the country partner program (share of
 * revenue, months, goals). No database here, so they are unit-tested.
 */

export const COUNTRY_PARTNERS_SETTINGS_KEY = 'country_partners.program';

export interface CountryPartnerSettings {
  /** Stripe's card fee estimate taken off the gross (percent + fixed). */
  feePercent: number;
  feeFixedCents: number;
  /** Staff a new partner may hire (the partner can't change it). */
  defaultMaxAdmins: number;
  /** The contract every partner accepts on their first sign-in. */
  contract: { version: number; text: string; updatedAt: string | null };
}

export const DEFAULT_CONTRACT_TEXT = `COUNTRY PARTNER AGREEMENT (template — have it reviewed by a lawyer)

1. Parties. SIMA LLC (Illinois, USA), operator of LawBid ("LawBid"), and the partner named in the partner card ("Partner").
2. Territory. Partner promotes LawBid in the one country named in the partner card, at Partner's own cost. Partner does not act in the United States or any other country.
3. Admin access. LawBid gives Partner and up to the agreed number of Partner's staff limited admin access for that country (verification, moderation, support, anti-fraud, read-only revenue report). Access is a revocable license; LawBid may pause or end it at any time.
4. Money. All payments from users go to LawBid. Each month LawBid pays Partner the agreed percentage of the country's net revenue (paid revenue minus refunds and payment fees). LawBid may hold or withhold payouts in case of fraud, chargebacks or breach.
5. Taxes. Partner is an independent contractor, not an employee or agent, and pays all taxes in Partner's country. Partner provides a W-8BEN / W-8BEN-E form.
6. Conduct. Partner follows local law, the LawBid Terms and Privacy Policy, does not give legal advice on behalf of LawBid, does not spam (TCPA, CAN-SPAM, GDPR and local rules), and keeps users' data confidential.
7. Goals. Targets in the partner card are business goals; missing them may lead to a change of terms or the end of the partnership.
8. Term and termination. Either party may end this agreement with 30 days' notice; LawBid may end it at once for breach, fraud or harm to users. On termination admin access ends and unpaid earned amounts are settled after the hold for refunds.
9. Liability. LawBid's liability is limited to the amounts paid to Partner in the last 3 months. Governing law: Illinois, USA.`;

export const DEFAULT_COUNTRY_PARTNER_SETTINGS: CountryPartnerSettings = {
  feePercent: 2.9,
  feeFixedCents: 30,
  defaultMaxAdmins: 10,
  contract: { version: 1, text: DEFAULT_CONTRACT_TEXT, updatedAt: null },
};

/** Stored JSON → settings with defaults for anything missing or broken. */
export function readCountryPartnerSettings(
  raw: unknown,
): CountryPartnerSettings {
  const d = DEFAULT_COUNTRY_PARTNER_SETTINGS;
  const r =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const num = (v: unknown, fallback: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max
      ? v
      : fallback;
  const c =
    r.contract && typeof r.contract === 'object'
      ? (r.contract as Record<string, unknown>)
      : {};
  return {
    feePercent: num(r.feePercent, d.feePercent, 20),
    feeFixedCents: Math.round(num(r.feeFixedCents, d.feeFixedCents, 1000)),
    defaultMaxAdmins: Math.round(
      num(r.defaultMaxAdmins, d.defaultMaxAdmins, 100),
    ),
    contract: {
      version: Math.max(1, Math.round(num(c.version, 1, 1_000_000))),
      text:
        typeof c.text === 'string' && c.text.trim() ? c.text : d.contract.text,
      updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : null,
    },
  };
}

/** "2026-10" → [start, end) in UTC. */
export function periodBounds(period: string): { from: Date; to: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error(`bad period ${period}`);
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  return {
    from: new Date(Date.UTC(y, mo, 1)),
    to: new Date(Date.UTC(y, mo + 1, 1)),
  };
}

export function periodOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Owner 2026-10-06: «Договор до» is a calendar day and the contract runs
 * through it. Returns the first moment after the contract (the start of
 * the next UTC day), or null when no end date is set.
 */
export function contractCutoff(endsAt: Date | null): Date | null {
  if (!endsAt) return null;
  return new Date(
    Date.UTC(
      endsAt.getUTCFullYear(),
      endsAt.getUTCMonth(),
      endsAt.getUTCDate() + 1,
    ),
  );
}

/** True once [now] is past the contract's last day. */
export function contractEnded(endsAt: Date | null, now: Date): boolean {
  const cutoff = contractCutoff(endsAt);
  return cutoff !== null && now >= cutoff;
}

/** The last moment that may be settled: the earlier of the day the
 * partner was switched off and the contract's last day. */
export function settleUntil(
  disabledAt: Date | null,
  endsAt: Date | null,
): Date | null {
  const cutoff = contractCutoff(endsAt);
  const lastMoment = cutoff ? new Date(cutoff.getTime() - 1) : null;
  if (!disabledAt) return lastMoment;
  if (!lastMoment) return disabledAt;
  return disabledAt < lastMoment ? disabledAt : lastMoment;
}

/** Finished months from [start]'s month up to the month before [now]
 * (and not after [until]'s month), oldest first, at most [max]. */
export function finishedPeriods(
  start: Date,
  now: Date,
  until: Date | null = null,
  max = 24,
): string[] {
  const out: string[] = [];
  const last = periodOf(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
  );
  const stop = until && periodOf(until) < last ? periodOf(until) : last;
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  for (;;) {
    const p = `${y}-${String(m + 1).padStart(2, '0')}`;
    if (p > stop) break;
    out.push(p);
    m += 1;
    if (m === 12) {
      m = 0;
      y += 1;
    }
  }
  return out.slice(-max);
}

export interface RevenueInput {
  /** Amounts of the payments paid in the month (cents). */
  payments: number[];
  refundsCents: number;
}

export interface Settlement {
  grossCents: number;
  refundsCents: number;
  feesCents: number;
  netCents: number;
  amountCents: number;
}

/** Net = paid − refunds − estimated card fees; the share is rounded down
 * and never negative (a month with more refunds than sales pays 0). */
export function settle(
  input: RevenueInput,
  shareBps: number,
  fees: Pick<CountryPartnerSettings, 'feePercent' | 'feeFixedCents'>,
): Settlement {
  const gross = input.payments.reduce((a, b) => a + b, 0);
  const feesCents = input.payments.reduce(
    (a, p) => a + Math.round((p * fees.feePercent) / 100) + fees.feeFixedCents,
    0,
  );
  const net = gross - input.refundsCents - feesCents;
  const amount = net > 0 ? Math.floor((net * shareBps) / 10_000) : 0;
  return {
    grossCents: gross,
    refundsCents: input.refundsCents,
    feesCents,
    netCents: net,
    amountCents: amount,
  };
}

export const GOAL_METRICS = ['attorneys', 'clients', 'revenue_cents'] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];

export interface PartnerGoal {
  metric: GoalMetric;
  target: number;
  /** "2026-12-31" (inclusive, UTC). */
  deadline: string;
  /** The owner was told it was missed. */
  alerted?: boolean;
}

/** Stored JSON → clean goals (bad entries dropped, at most 10). */
export function readGoals(raw: unknown): PartnerGoal[] {
  if (!Array.isArray(raw)) return [];
  const out: PartnerGoal[] = [];
  for (const g of raw) {
    if (!g || typeof g !== 'object') continue;
    const r = g as Record<string, unknown>;
    if (!GOAL_METRICS.includes(r.metric as GoalMetric)) continue;
    if (typeof r.target !== 'number' || !(r.target > 0)) continue;
    if (
      typeof r.deadline !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(r.deadline)
    )
      continue;
    out.push({
      metric: r.metric as GoalMetric,
      target: Math.round(r.target),
      deadline: r.deadline,
      ...(r.alerted === true ? { alerted: true } : {}),
    });
    if (out.length === 10) break;
  }
  return out;
}

export type GoalState = 'on_track' | 'met' | 'missed';

export function goalState(
  goal: PartnerGoal,
  progress: number,
  now: Date,
): GoalState {
  if (progress >= goal.target) return 'met';
  const end = new Date(`${goal.deadline}T23:59:59.999Z`);
  return now > end ? 'missed' : 'on_track';
}

/** "20 %" ↔ 2000 basis points. */
export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}
