import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type Referral } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { PAYMENT_PROVIDER } from '../billing/billing.constants';
import type { PaymentProvider } from '../billing/payment-provider';
import {
  generateReferralCode,
  normalizeReferralCode,
  REFERRAL_CODE_PATTERN,
} from './referral-code.util';
import type {
  ApplyReferralResultDto,
  ReferralMeDto,
  ReferralStatus,
} from './referrals.dto';
import {
  parseReferralSettings,
  QUALIFYING_EVENT_FOR_ROLE,
  REFERRAL_SETTINGS_KEY,
  remainingDays,
  rewardFor,
  snapshotOf,
  type QualifyingEventKind,
  type ReferralProgramSettings,
  type ReferralRewardSnapshot,
  type ReferralRole,
} from './referrals.settings';

const DAY_MS = 86_400_000;
const CODE_ATTEMPTS = 6;
const DEEP_LINK_BASE = 'lawbid://referral';

type Db = Prisma.TransactionClient | PrismaService;

function notAllowed(reason: string, message: string): ConflictException {
  return new ConflictException({
    code: ErrorCode.REFERRAL_NOT_ALLOWED,
    message,
    details: { reason },
  });
}

function isUniqueViolation(e: unknown, field?: string): boolean {
  if (
    !(e instanceof Prisma.PrismaClientKnownRequestError) ||
    e.code !== 'P2002'
  ) {
    return false;
  }
  if (!field) return true;
  const target = (e.meta as { target?: unknown } | undefined)?.target;
  return Array.isArray(target)
    ? target.some((t) => String(t).includes(field))
    : typeof target === 'string' && target.includes(field);
}

const asRole = (role: string | null | undefined): ReferralRole | null =>
  role === 'attorney' || role === 'client' ? role : null;

const json = (s: ReferralRewardSnapshot | null): Prisma.InputJsonValue =>
  (s ?? {}) as unknown as Prisma.InputJsonValue;

/**
 * Owner 2026-10-02: referral program. Every user gets one code (created on
 * first read); a new user applies someone's code once, within
 * `applyWindowDays` of sign-up. The referral qualifies on the referee's
 * first paid subscription invoice (attorney) or first published case
 * (client) — billing and cases call [onQualifyingEvent], which never
 * throws. Rewards are snapshotted at apply time: `balance_cents` is a
 * Stripe customer-balance credit (kept `qualified` until the recipient has
 * a Stripe customer), `promotion_days` become case-promotion credit days,
 * `percent_first_invoice` is read by the subscription checkout through
 * [pendingReferralDiscountPercent].
 */
@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional()
    @Inject(PAYMENT_PROVIDER)
    private readonly provider?: PaymentProvider,
  ) {}

  // ---- settings ---------------------------------------------------------

  async settings(db: Db = this.prisma): Promise<ReferralProgramSettings> {
    const row = await db.appConfig.findUnique({
      where: { key: REFERRAL_SETTINGS_KEY },
    });
    return parseReferralSettings(row?.value);
  }

  // ---- codes ------------------------------------------------------------

  /** The user's code, created on first use (unique; retried on collision). */
  async ensureCode(userId: string): Promise<string> {
    const existing = await this.prisma.referralCode.findUnique({
      where: { user_id: userId },
    });
    if (existing) return existing.code;
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
      try {
        const row = await this.prisma.referralCode.create({
          data: { user_id: userId, code: generateReferralCode() },
        });
        return row.code;
      } catch (e) {
        if (isUniqueViolation(e, 'user_id')) {
          // A concurrent first read created it.
          const row = await this.prisma.referralCode.findUnique({
            where: { user_id: userId },
          });
          if (row) return row.code;
        }
        if (!isUniqueViolation(e)) throw e;
        // Code collision: try another one.
      }
    }
    throw new Error('Could not allocate a unique referral code');
  }

  shareUrl(code: string): string {
    const base = this.config.get<string>('APP_LINK_BASE_URL');
    return base
      ? `${base.replace(/\/+$/, '')}/r/${code}`
      : `${DEEP_LINK_BASE}/${code}`;
  }

  // ---- app --------------------------------------------------------------

  /** GET /referrals/me. */
  async me(userId: string): Promise<ReferralMeDto> {
    const code = await this.ensureCode(userId);
    const settings = await this.settings();
    const [user, invited, qualified, rewarded, rows, own] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, created_at: true },
      }),
      this.prisma.referral.count({ where: { referrer_id: userId } }),
      this.prisma.referral.count({
        where: {
          referrer_id: userId,
          status: { in: ['qualified', 'rewarded'] },
        },
      }),
      this.prisma.referral.count({
        where: { referrer_id: userId, status: 'rewarded' },
      }),
      this.prisma.referral.findMany({
        where: { referrer_id: userId },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: 50,
      }),
      this.prisma.referral.findUnique({ where: { referee_id: userId } }),
    ]);
    const role = asRole(user?.role);
    const withinWindow =
      !!user &&
      Date.now() - user.created_at.getTime() <=
        settings.applyWindowDays * DAY_MS;
    return {
      enabled: settings.enabled,
      code,
      shareUrl: this.shareUrl(code),
      invited,
      qualified,
      rewarded,
      rewards: rows.map((r) => ({
        id: r.id,
        status: r.status as ReferralStatus,
        refereeRole: r.referee_role,
        reward: plainReward(snapshotOf(r.referrer_reward)),
        createdAt: r.created_at.toISOString(),
        qualifiedAt: r.qualified_at?.toISOString() ?? null,
        rewardedAt: r.rewarded_at?.toISOString() ?? null,
      })),
      referredBy: own
        ? {
            status: own.status as ReferralStatus,
            reward: plainReward(snapshotOf(own.referee_reward)),
          }
        : null,
      promotionCreditDays: await this.promotionCreditDays(userId),
      pendingDiscountPercent: await this.pendingReferralDiscountPercent(userId),
      applyWindowDays: settings.applyWindowDays,
      canApply: settings.enabled && !own && !!role && withinWindow,
      inviterReward: rewardFor(settings, 'referrer', role ?? 'client'),
    };
  }

  /** POST /referrals/apply. */
  async apply(
    userId: string,
    rawCode: string,
  ): Promise<ApplyReferralResultDto> {
    const settings = await this.settings();
    if (!settings.enabled) {
      throw new ForbiddenException({
        code: ErrorCode.FEATURE_DISABLED,
        message: 'The referral program is not available right now.',
      });
    }
    const code = normalizeReferralCode(rawCode);
    const invalid = new NotFoundException({
      code: ErrorCode.REFERRAL_CODE_INVALID,
      message: 'This referral code does not exist.',
    });
    if (!REFERRAL_CODE_PATTERN.test(code)) throw invalid;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, created_at: true },
    });
    const refereeRole = asRole(user?.role);
    if (!user || !refereeRole) {
      throw notAllowed(
        'role_required',
        'Finish choosing your account type before entering a code.',
      );
    }
    if (
      Date.now() - user.created_at.getTime() >
      settings.applyWindowDays * DAY_MS
    ) {
      throw notAllowed(
        'window_expired',
        `A referral code can be entered only within ${settings.applyWindowDays} days of sign-up.`,
      );
    }
    const owner = await this.prisma.referralCode.findUnique({
      where: { code },
    });
    if (!owner) throw invalid;
    if (owner.user_id === userId) {
      throw notAllowed('self', 'You cannot use your own referral code.');
    }
    const [already, referrer, mutual] = await Promise.all([
      this.prisma.referral.findUnique({ where: { referee_id: userId } }),
      this.prisma.user.findUnique({
        where: { id: owner.user_id },
        select: { role: true, status: true, deleted_at: true },
      }),
      this.prisma.referral.findFirst({
        where: { referrer_id: userId, referee_id: owner.user_id },
        select: { id: true },
      }),
    ]);
    if (already) {
      throw notAllowed('already_referred', 'You have already used a code.');
    }
    const referrerRole = asRole(referrer?.role);
    if (
      !referrer ||
      !referrerRole ||
      referrer.status !== 'active' ||
      referrer.deleted_at
    ) {
      throw invalid;
    }
    if (mutual) {
      throw notAllowed('mutual', 'You invited this person yourself.');
    }

    const referrerReward = rewardFor(settings, 'referrer', referrerRole);
    const refereeReward = rewardFor(settings, 'referee', refereeRole);
    let created: Referral;
    try {
      created = await this.prisma.referral.create({
        data: {
          referrer_id: owner.user_id,
          referee_id: userId,
          code,
          status: 'pending',
          referrer_role: referrerRole,
          referee_role: refereeRole,
          referrer_reward: json(referrerReward),
          referee_reward: json(refereeReward),
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw notAllowed('already_referred', 'You have already used a code.');
      }
      throw e;
    }

    // The qualifying action may already have happened (e.g. the client
    // posted a case before entering the code).
    if (await this.hasQualifyingAction(userId, refereeRole)) {
      await this.onQualifyingEvent(
        userId,
        QUALIFYING_EVENT_FOR_ROLE[refereeRole],
      );
    }
    const after = await this.prisma.referral.findUnique({
      where: { id: created.id },
    });
    return {
      status: (after?.status ?? created.status) as ReferralStatus,
      reward: { type: refereeReward.type, value: refereeReward.value },
    };
  }

  // ---- qualification & rewards -------------------------------------------

  /**
   * Hook for billing (first paid invoice) and cases (case published).
   * Idempotent and never throws: referral bookkeeping must not break the
   * caller. A payment also retries rewards waiting for this user's Stripe
   * customer.
   */
  async onQualifyingEvent(
    userId: string,
    kind: QualifyingEventKind,
  ): Promise<void> {
    try {
      const r = await this.prisma.referral.findUnique({
        where: { referee_id: userId },
      });
      const role = asRole(r?.referee_role);
      if (r && role && r.status === 'pending') {
        if (QUALIFYING_EVENT_FOR_ROLE[role] === kind) {
          if (await this.qualify(r.id)) await this.tryReward(r.id);
        }
      }
      if (kind === 'subscription_payment') {
        const waiting = await this.prisma.referral.findMany({
          where: {
            status: 'qualified',
            OR: [{ referrer_id: userId }, { referee_id: userId }],
          },
          select: { id: true },
          take: 20,
        });
        for (const w of waiting) await this.tryReward(w.id);
      }
    } catch (e) {
      this.logger.warn(
        { userId, kind, err: String(e) },
        'referral qualification failed',
      );
    }
  }

  /** pending → qualified; false when it was not pending (idempotent). */
  async qualify(referralId: string, now = new Date()): Promise<boolean> {
    const res = await this.prisma.referral.updateMany({
      where: { id: referralId, status: 'pending' },
      data: { status: 'qualified', qualified_at: now },
    });
    return res.count > 0;
  }

  /**
   * Issues the rewards of a qualified referral. `balance_cents` needs the
   * recipient's Stripe customer (idempotency key per referral and side);
   * without one the referral stays `qualified` and is retried on that
   * user's next payment. Returns the referral after the attempt.
   */
  async tryReward(referralId: string): Promise<Referral | null> {
    const r = await this.prisma.referral.findUnique({
      where: { id: referralId },
    });
    if (!r || r.status !== 'qualified') return r;
    const issuedAt = new Date();
    const issued: { referrer: boolean; referee: boolean } = {
      referrer: false,
      referee: false,
    };
    let complete = true;
    for (const side of ['referrer', 'referee'] as const) {
      const snap = snapshotOf(
        side === 'referrer' ? r.referrer_reward : r.referee_reward,
      );
      if (!snap || snap.issuedAt) continue;
      if (snap.type === 'balance_cents' && snap.value > 0) {
        const ok = await this.creditBalance(
          side === 'referrer' ? r.referrer_id : r.referee_id,
          snap.value,
          `${r.id}:${side}`,
        );
        if (!ok) {
          complete = false;
          continue;
        }
      }
      // promotion_days: available from now; percent_first_invoice: was
      // applied by the checkout before the first invoice.
      issued[side] = true;
    }
    return withTxRetry(this.prisma, async (tx) => {
      const fresh = await tx.referral.findUnique({ where: { id: r.id } });
      if (!fresh || fresh.status !== 'qualified') return fresh;
      const mark = (raw: unknown, yes: boolean) => {
        const s = snapshotOf(raw);
        return s && yes && !s.issuedAt
          ? { ...s, issuedAt: issuedAt.toISOString() }
          : s;
      };
      return tx.referral.update({
        where: { id: r.id },
        data: {
          referrer_reward: json(mark(fresh.referrer_reward, issued.referrer)),
          referee_reward: json(mark(fresh.referee_reward, issued.referee)),
          ...(complete ? { status: 'rewarded', rewarded_at: issuedAt } : {}),
        },
      });
    });
  }

  private async creditBalance(
    userId: string,
    cents: number,
    key: string,
  ): Promise<boolean> {
    const customer = await this.prisma.stripeCustomer.findUnique({
      where: { user_id: userId },
    });
    if (!customer || !this.provider?.creditCustomerBalance) return false;
    try {
      await this.provider.creditCustomerBalance(
        customer.stripe_customer_id,
        cents,
        'LawBid referral reward',
        `referral-reward:${key}`,
      );
      return true;
    } catch (e) {
      this.logger.warn(
        { userId, key, err: String(e) },
        'referral balance credit failed',
      );
      return false;
    }
  }

  private async hasQualifyingAction(
    userId: string,
    role: ReferralRole,
  ): Promise<boolean> {
    if (role === 'client') {
      return (
        (await this.prisma.case.count({ where: { client_id: userId } })) > 0
      );
    }
    return (
      (await this.prisma.payment.count({
        where: {
          user_id: userId,
          status: 'succeeded',
          amount_cents: { gt: 0 },
          stripe_invoice_id: { not: null },
        },
      })) > 0
    );
  }

  // ---- integration points -------------------------------------------------

  /**
   * For the subscription checkout: percent off the referee attorney's first
   * invoice, or 0. Applies while the referral is pending and no paid
   * subscription invoice exists yet.
   */
  async pendingReferralDiscountPercent(userId: string): Promise<number> {
    const r = await this.prisma.referral.findUnique({
      where: { referee_id: userId },
    });
    if (!r || r.status !== 'pending' || r.referee_role !== 'attorney') return 0;
    const snap = snapshotOf(r.referee_reward);
    if (!snap || snap.type !== 'percent_first_invoice' || snap.value <= 0) {
      return 0;
    }
    if (await this.hasQualifyingAction(userId, 'attorney')) return 0;
    return Math.min(100, snap.value);
  }

  /** Case-promotion days the user earned through referrals and has not
   * spent yet. */
  async promotionCreditDays(
    userId: string,
    db: Db = this.prisma,
  ): Promise<number> {
    const rows = await this.creditRows(db, userId);
    return rows.reduce((sum, row) => sum + remainingDays(row.snap), 0);
  }

  /** Spends up to [days] credit days on a promotion; returns how many. */
  async consumePromotionCredits(
    tx: Prisma.TransactionClient,
    userId: string,
    promotionId: string,
    days: number,
  ): Promise<number> {
    let left = days;
    for (const row of await this.creditRows(tx, userId)) {
      if (left <= 0) break;
      const take = Math.min(left, remainingDays(row.snap));
      if (take <= 0) continue;
      const snap = {
        ...row.snap,
        uses: { ...(row.snap.uses ?? {}), [promotionId]: take },
      };
      await tx.referral.update({
        where: { id: row.id },
        data:
          row.side === 'referrer'
            ? { referrer_reward: json(snap) }
            : { referee_reward: json(snap) },
      });
      left -= take;
    }
    return days - left;
  }

  /** Gives back the days a promotion took (it never ran). */
  async restorePromotionCredits(
    tx: Prisma.TransactionClient,
    userId: string,
    promotionId: string,
  ): Promise<number> {
    let restored = 0;
    for (const row of await this.creditRows(tx, userId, true)) {
      const used = row.snap.uses?.[promotionId];
      if (!used) continue;
      const uses = { ...(row.snap.uses ?? {}) };
      delete uses[promotionId];
      const snap = { ...row.snap, uses };
      await tx.referral.update({
        where: { id: row.id },
        data:
          row.side === 'referrer'
            ? { referrer_reward: json(snap) }
            : { referee_reward: json(snap) },
      });
      restored += used;
    }
    return restored;
  }

  /** Issued promotion-day rewards of the user, oldest first. */
  private async creditRows(
    db: Db,
    userId: string,
    includeRejected = false,
  ): Promise<
    { id: string; side: 'referrer' | 'referee'; snap: ReferralRewardSnapshot }[]
  > {
    const rows = await db.referral.findMany({
      where: {
        OR: [{ referrer_id: userId }, { referee_id: userId }],
        ...(includeRejected ? {} : { status: { not: 'rejected' } }),
      },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: 500,
    });
    const out: {
      id: string;
      side: 'referrer' | 'referee';
      snap: ReferralRewardSnapshot;
    }[] = [];
    for (const r of rows) {
      const side = r.referrer_id === userId ? 'referrer' : 'referee';
      const snap = snapshotOf(
        side === 'referrer' ? r.referrer_reward : r.referee_reward,
      );
      if (snap?.type === 'promotion_days' && snap.issuedAt) {
        out.push({ id: r.id, side, snap });
      }
    }
    return out;
  }
}

function plainReward(s: ReferralRewardSnapshot | null): {
  type: ReferralRewardSnapshot['type'];
  value: number;
} {
  return s
    ? { type: s.type, value: s.value }
    : { type: 'promotion_days', value: 0 };
}
