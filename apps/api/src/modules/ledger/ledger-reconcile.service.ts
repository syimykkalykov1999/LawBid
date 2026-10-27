import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { LedgerPostingService } from './ledger-posting.service';
import {
  LedgerStripeService,
  type StripeBalanceTxn,
} from './ledger-stripe.service';

const LAST_KEY = 'ledger:reconcile:last';
const LAST_FULL_KEY = 'ledger:reconcile:last-full';
const DAY_MS = 24 * 3600 * 1000;
/** The window mode still does a full check at least this often. */
const FULL_EVERY_DAYS = 7;
const LAST_TTL_SEC = 35 * 24 * 3600;
/** A row paid a moment ago may not have its entry yet only if the commit raced; they commit together, so this is only a safety margin. */
const COVERAGE_GRACE_MS = 10 * 60 * 1000;
/** Stripe's rows are compared up to this long ago, so late webhooks have landed. */
const STRIPE_LAG_MS = 2 * 3600 * 1000;
const STRIPE_WINDOW_MS = 3 * 24 * 3600 * 1000;

/** Stripe balance transaction types the app books itself (gross, by event). */
const APP_BOOKED_TYPES = new Set([
  'charge',
  'payment',
  'refund',
  'payment_refund',
  'application_fee',
  'application_fee_refund',
]);
/** Ledger entries that mirror those types on the platform's Stripe balance. */
const APP_SOURCE_TYPES = [
  'payment',
  'payment_refund',
  'payment_refund_sync',
  'case_payment',
  'case_payment_refund',
  'case_payment_refund_reversal',
];

export type LedgerReconcileMode = 'off' | 'on' | 'auto';

/**
 * Review R-26: what tonight's run covers. `off` = nothing; `on` = the whole
 * append-only ledger every night (the old behaviour); `auto` (default) = the
 * last `windowDays` days every night and the whole ledger once every
 * FULL_EVERY_DAYS days (also when no full check is recorded yet), so the
 * nightly cost stops growing with the table.
 */
export function reconcileScope(
  mode: LedgerReconcileMode,
  now: Date,
  lastFullAt: Date | null,
  windowDays: number,
): { run: boolean; since: Date | null } {
  if (mode === 'off') return { run: false, since: null };
  if (mode === 'on') return { run: true, since: null };
  const fullDue =
    !lastFullAt ||
    now.getTime() - lastFullAt.getTime() >= FULL_EVERY_DAYS * DAY_MS;
  if (fullDue) return { run: true, since: null };
  return {
    run: true,
    since: new Date(now.getTime() - Math.max(1, windowDays) * DAY_MS),
  };
}

export interface LedgerReconcileResult {
  ranAt: string;
  /** What was checked: the whole ledger, the recent window, or nothing (switch off). */
  scope?: 'full' | 'window' | 'skipped';
  ok: boolean;
  entries: number;
  /** Entries whose debits differ from credits or with < 2 lines (the DB should make this 0). */
  unbalancedEntries: number;
  /** Per currency: total debits - total credits over all lines (must be 0). */
  imbalanceByCurrency: Record<string, number>;
  /** Paid money rows that have no ledger entry. */
  missingEntries: { payments: number; casePayments: number };
  /** Case payments: refunded_cents on the rows minus the refunds in the ledger. */
  caseRefundDriftCents: number;
  stripe:
    | { status: 'skipped'; reason: string }
    | {
        status: 'compared';
        txns: number;
        syncedMovements: number;
        stripeCents: number;
        ledgerCents: number;
        deltaCents: number;
      };
  problems: string[];
}

/**
 * Nightly reconciliation of the money ledger (`ledger.reconcile`). Read-only
 * on the app's tables; writes only idempotent ledger entries for Stripe's own
 * fees, payouts and unclassified movements (keyed by balance transaction id).
 *
 *  1. every entry balances, every currency nets to zero;
 *  2. every paid payment / case payment has its entry (coverage), and the
 *     refunds on case payments match the ledger;
 *  3. Stripe: the gross movements of the platform balance transactions that
 *     the app books itself equal the ledger's movements on
 *     `stripe_platform_balance` over the same window.
 * A problem logs `alert: ledger_mismatch` (CloudWatch metric LedgerMismatch,
 * infra/modules/monitoring) with details; the last result is kept in Redis
 * for the admin read-only view.
 */
@Injectable()
export class LedgerReconcileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: LedgerStripeService,
    private readonly posting: LedgerPostingService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
    @Optional() private readonly settings?: AppSettingsService,
  ) {
    this.logger.setContext(LedgerReconcileService.name);
  }

  async run(now: Date = new Date()): Promise<LedgerReconcileResult> {
    const problems: string[] = [];

    const mode = await this.mode();
    const lastFullRaw = await this.redis.get(LAST_FULL_KEY).catch(() => null);
    const scope = reconcileScope(
      mode,
      now,
      lastFullRaw ? new Date(lastFullRaw) : null,
      await this.windowDays(),
    );
    if (!scope.run) {
      const skipped: LedgerReconcileResult = {
        ranAt: now.toISOString(),
        scope: 'skipped',
        ok: true,
        entries: 0,
        unbalancedEntries: 0,
        imbalanceByCurrency: {},
        missingEntries: { payments: 0, casePayments: 0 },
        caseRefundDriftCents: 0,
        stripe: { status: 'skipped', reason: 'ledger.reconcile_mode is off' },
        problems,
      };
      await this.redis
        .set(LAST_KEY, JSON.stringify(skipped), 'EX', LAST_TTL_SEC)
        .catch(() => undefined);
      return skipped;
    }
    const since = scope.since;
    // Window: only entries that happened since `since` (indexed on
    // occurred_at); full: the whole table, as before.
    const entryWhere = since
      ? Prisma.sql`WHERE e.occurred_at >= ${since}`
      : Prisma.empty;

    const [{ n: entries }] = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM ledger_entries e ${entryWhere}`;

    const [{ n: unbalanced }] = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM (
        SELECT e.id
          FROM ledger_entries e
          LEFT JOIN ledger_lines l ON l.entry_id = e.id
          ${entryWhere}
         GROUP BY e.id
        HAVING COUNT(l.id) < 2
            OR COALESCE(SUM(l.amount_cents) FILTER (WHERE l.direction = 'debit'), 0)
            <> COALESCE(SUM(l.amount_cents) FILTER (WHERE l.direction = 'credit'), 0)
      ) bad`;

    const perCurrency = await this.prisma.$queryRaw<
      { currency: string; diff: bigint }[]
    >`
      SELECT e.currency,
             COALESCE(SUM(l.amount_cents) FILTER (WHERE l.direction = 'debit'), 0)
           - COALESCE(SUM(l.amount_cents) FILTER (WHERE l.direction = 'credit'), 0) AS diff
        FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
        ${entryWhere}
       GROUP BY e.currency`;
    const imbalanceByCurrency: Record<string, number> = {};
    for (const r of perCurrency) {
      if (r.diff !== 0n) imbalanceByCurrency[r.currency] = Number(r.diff);
    }

    const coverage = await this.coverage(now, since);
    // The refund drift is a cumulative comparison of two whole-table sums:
    // it only makes sense over everything, so the window skips it.
    const drift = since ? 0 : await this.caseRefundDrift();

    if (Number(unbalanced) > 0) {
      problems.push(`${unbalanced} unbalanced entries`);
    }
    if (Object.keys(imbalanceByCurrency).length > 0) {
      problems.push(
        `currency imbalance ${JSON.stringify(imbalanceByCurrency)}`,
      );
    }
    if (coverage.payments > 0) {
      problems.push(
        `${coverage.payments} paid payments without a ledger entry`,
      );
    }
    if (coverage.casePayments > 0) {
      problems.push(
        `${coverage.casePayments} paid case payments without a ledger entry`,
      );
    }
    if (drift !== 0) {
      problems.push(
        `case payment refunds differ from the ledger by ${drift} cents`,
      );
    }

    const stripe = await this.compareWithStripe(now, problems);

    const result: LedgerReconcileResult = {
      ranAt: now.toISOString(),
      scope: since ? 'window' : 'full',
      ok: problems.length === 0,
      entries: Number(entries),
      unbalancedEntries: Number(unbalanced),
      imbalanceByCurrency,
      missingEntries: coverage,
      caseRefundDriftCents: drift,
      stripe,
      problems,
    };
    if (!result.ok) {
      this.logger.error(
        { alert: 'ledger_mismatch', problems, stripe },
        'ledger reconciliation found a mismatch',
      );
    } else {
      this.logger.info(
        { entries: result.entries, stripe: stripe.status },
        'ledger reconciliation ok',
      );
    }
    await this.redis
      .set(LAST_KEY, JSON.stringify(result), 'EX', LAST_TTL_SEC)
      .catch(() => undefined);
    if (!since) {
      await this.redis
        .set(LAST_FULL_KEY, now.toISOString(), 'EX', LAST_TTL_SEC)
        .catch(() => undefined);
    }
    return result;
  }

  /** The last nightly result (admin read-only view), or null. */
  async last(): Promise<LedgerReconcileResult | null> {
    const raw = await this.redis.get(LAST_KEY).catch(() => null);
    return raw ? (JSON.parse(raw) as LedgerReconcileResult) : null;
  }

  /** Balances per account (admin read-only view). */
  async balances(): Promise<
    {
      code: string;
      type: string;
      currency: string;
      ownerKey: string;
      debitCents: number;
      creditCents: number;
    }[]
  > {
    const rows = await this.prisma.$queryRaw<
      {
        code: string;
        type: string;
        currency: string;
        owner_key: string;
        debit: bigint;
        credit: bigint;
      }[]
    >`
      SELECT a.code, a.type::text AS type, a.currency,
             CASE WHEN a.owner_key = 'platform' THEN 'platform' ELSE 'users' END AS owner_key,
             COALESCE(SUM(l.amount_cents) FILTER (WHERE l.direction = 'debit'), 0) AS debit,
             COALESCE(SUM(l.amount_cents) FILTER (WHERE l.direction = 'credit'), 0) AS credit
        FROM ledger_accounts a LEFT JOIN ledger_lines l ON l.account_id = a.id
       GROUP BY a.code, a.type, a.currency, 4
       ORDER BY a.type, a.code`;
    return rows.map((r) => ({
      code: r.code,
      type: r.type,
      currency: r.currency,
      ownerKey: r.owner_key,
      debitCents: Number(r.debit),
      creditCents: Number(r.credit),
    }));
  }

  // ---------------------------------------------------------------------

  private async mode(): Promise<LedgerReconcileMode> {
    try {
      const v = await this.settings?.string('ledger.reconcile_mode');
      return v === 'off' || v === 'on' ? v : 'auto';
    } catch {
      return 'auto';
    }
  }

  private async windowDays(): Promise<number> {
    try {
      return (await this.settings?.number('ledger.reconcile_window_days')) ?? 7;
    } catch {
      return 7;
    }
  }

  private async coverage(
    now: Date,
    windowSince: Date | null = null,
  ): Promise<{ payments: number; casePayments: number }> {
    let since: Date;
    if (windowSince) {
      since = windowSince;
    } else {
      const [first] = await this.prisma.$queryRaw<{ t: Date | null }[]>`
        SELECT MIN(occurred_at) AS t FROM ledger_entries`;
      // Before the first entry there is nothing to compare (rows from before the ledger).
      if (!first?.t) return { payments: 0, casePayments: 0 };
      since = new Date(first.t.getTime() - 24 * 3600 * 1000);
    }
    const until = new Date(now.getTime() - COVERAGE_GRACE_MS);
    const [p] = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM payments p
       WHERE p.status IN ('succeeded', 'refunded') AND p.paid_at IS NOT NULL
         AND p.paid_at >= ${since} AND p.paid_at < ${until} AND p.amount_cents > 0
         AND NOT EXISTS (SELECT 1 FROM ledger_entries e
              WHERE e.source_type = 'payment' AND e.source_id = p.id::text AND e.event = 'paid')`;
    const [c] = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM case_payments p
       WHERE p.status IN ('succeeded', 'partially_refunded', 'refunded', 'disputed')
         AND p.paid_at IS NOT NULL AND p.paid_at >= ${since} AND p.paid_at < ${until}
         AND p.client_total_cents > 0
         AND NOT EXISTS (SELECT 1 FROM ledger_entries e
              WHERE e.source_type = 'case_payment' AND e.source_id = p.id::text AND e.event = 'paid')`;
    return { payments: Number(p.n), casePayments: Number(c.n) };
  }

  /** refunded_cents on case payments that have an entry minus the refunds booked. */
  private async caseRefundDrift(): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ diff: bigint | null }[]>`
      SELECT (
        SELECT COALESCE(SUM(p.refunded_cents), 0) FROM case_payments p
         WHERE EXISTS (SELECT 1 FROM ledger_entries e
              WHERE e.source_type = 'case_payment' AND e.source_id = p.id::text AND e.event = 'paid')
      ) - (
        SELECT COALESCE(SUM(l.amount_cents), 0) FROM ledger_lines l
          JOIN ledger_entries e ON e.id = l.entry_id
         WHERE e.source_type = 'case_payment_refund' AND l.direction = 'debit'
      ) + (
        -- a refund that failed / a chargeback won late is booked back (reversal entries)
        SELECT COALESCE(SUM(l.amount_cents), 0) FROM ledger_lines l
          JOIN ledger_entries e ON e.id = l.entry_id
          JOIN ledger_accounts a ON a.id = l.account_id
         WHERE e.source_type = 'case_payment_refund_reversal' AND l.direction = 'credit'
           AND a.code IN ('connect_attorney', 'revenue_case_fees')
      ) AS diff`;
    return Number(row?.diff ?? 0);
  }

  private async compareWithStripe(
    now: Date,
    problems: string[],
  ): Promise<LedgerReconcileResult['stripe']> {
    if (!(await this.stripe.available())) {
      return { status: 'skipped', reason: 'no Stripe key saved' };
    }
    const to = new Date(now.getTime() - STRIPE_LAG_MS);
    const from = new Date(to.getTime() - STRIPE_WINDOW_MS);
    let txns: StripeBalanceTxn[];
    try {
      txns = await this.stripe.balanceTransactions(from, to);
    } catch (e) {
      problems.push(
        `could not read Stripe balance transactions: ${(e as Error).message}`,
      );
      return { status: 'skipped', reason: 'Stripe read failed' };
    }

    // Stripe's own cuts and anything the app does not book: idempotent entries.
    let synced = 0;
    for (const t of txns) {
      if (APP_BOOKED_TYPES.has(t.type)) {
        // The fee on a charge is Stripe's: book it apart from the gross.
        if (t.fee > 0) {
          const r = await this.syncMovement(t, 'fee', -t.fee, `${t.id}:fee`);
          if (r) synced += 1;
        }
        continue;
      }
      // A transfer the app already booked (payroll) carries its Stripe id.
      if (t.source && (await this.alreadyBooked(t.source))) continue;
      const kind =
        t.type === 'stripe_fee'
          ? 'fee'
          : t.type === 'payout'
            ? 'payout'
            : 'other';
      const r = await this.syncMovement(t, kind, t.amount - 0, t.id);
      if (r) synced += 1;
    }

    const stripeCents = txns
      .filter((t) => APP_BOOKED_TYPES.has(t.type) && t.currency === 'usd')
      .reduce((s, t) => s + t.amount, 0);
    const [led] = await this.prisma.$queryRaw<{ net: bigint | null }[]>`
      SELECT COALESCE(SUM(CASE WHEN l.direction = 'debit' THEN l.amount_cents ELSE -l.amount_cents END), 0) AS net
        FROM ledger_lines l
        JOIN ledger_entries e ON e.id = l.entry_id
        JOIN ledger_accounts a ON a.id = l.account_id
       WHERE a.code = 'stripe_platform_balance' AND e.currency = 'usd'
         AND e.source_type = ANY(${APP_SOURCE_TYPES})
         AND e.occurred_at >= ${from} AND e.occurred_at < ${to}`;
    const ledgerCents = Number(led?.net ?? 0);
    const deltaCents = stripeCents - ledgerCents;
    if (deltaCents !== 0) {
      problems.push(
        `Stripe balance movements differ from the ledger by ${deltaCents} cents (Stripe ${stripeCents}, ledger ${ledgerCents}) between ${from.toISOString()} and ${to.toISOString()}`,
      );
    }
    return {
      status: 'compared',
      txns: txns.length,
      syncedMovements: synced,
      stripeCents,
      ledgerCents,
      deltaCents,
    };
  }

  private async alreadyBooked(stripeRef: string): Promise<boolean> {
    const hit = await this.prisma.ledgerEntry.findFirst({
      where: { stripe_ref: stripeRef },
      select: { id: true },
    });
    return hit !== null;
  }

  private async syncMovement(
    t: StripeBalanceTxn,
    kind: 'fee' | 'payout' | 'other',
    signedCents: number,
    id: string,
  ): Promise<boolean> {
    if (signedCents === 0) return false;
    const r = await this.prisma.$transaction((tx) =>
      this.posting.stripeMovement(tx, {
        balanceTxnId: id,
        kind,
        signedCents,
        currency: t.currency,
        occurredAt: t.created,
        description:
          `Stripe ${t.type}${t.description ? `: ${t.description}` : ''}`.slice(
            0,
            200,
          ),
      }),
    );
    return r.created;
  }
}
