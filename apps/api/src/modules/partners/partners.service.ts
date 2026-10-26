import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  type Partner,
  type PartnerCommission,
  type Referral,
} from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { legalLangOf, readLegalSettings } from '../legal/legal.settings';
import { NotificationsService } from '../notifications/notifications.service';
import {
  generateReferralCode,
  referralShareUrl,
} from '../referrals/referral-code.util';
import type { QualifyingEventKind } from '../referrals/referrals.settings';
import type {
  PartnerCommissionDto,
  PartnerMeDto,
  PartnerMeTextsDto,
  PartnerRatesDto,
  PartnerReferredUserDto,
  PartnerTotalsDto,
  ReferredStatus,
} from './partners.dto';
import {
  effectiveRates,
  PARTNER_SETTINGS_KEY,
  PARTNER_TERMS_VERSION,
  parsePartnerSettings,
  periodOf,
  type CommissionKind,
  type CommissionStatus,
  type PartnerLang,
  type PartnerProgramSettings,
  type PartnerStatus,
} from './partners.settings';

const DAY_MS = 86_400_000;
const CODE_ATTEMPTS = 6;
const LIST_LIMIT = 200;

type Db = Prisma.TransactionClient | PrismaService;

/** Commission kinds tied to one referred person. */
const PER_PERSON_KINDS: CommissionKind[] = [
  'attorney_subscription',
  'client_qualified',
];

export function isUniqueViolation(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
  );
}

export function commissionDto(c: PartnerCommission): PartnerCommissionDto {
  return {
    id: c.id,
    kind: c.kind as CommissionKind,
    amountCents: c.amount_cents,
    status: c.status as CommissionStatus,
    period: c.period,
    referredUserId: c.referred_user_id,
    holdUntil: c.hold_until?.toISOString() ?? null,
    approvedAt: c.approved_at?.toISOString() ?? null,
    paidAt: c.paid_at?.toISOString() ?? null,
    payoutRef: c.payout_ref,
    reversedAt: c.reversed_at?.toISOString() ?? null,
    reversedReason: c.reversed_reason,
    note: c.note,
    createdAt: c.created_at.toISOString(),
  };
}

/** Who may join by themselves: attorneys and clients (not assistants). */
export function canSelfEnroll(role: string | null | undefined): boolean {
  return role === 'attorney' || role === 'client';
}

/** joined → qualified (commission held/approved) → paid; reversed. */
export function referredStatusOf(
  c: PartnerCommission | undefined,
): ReferredStatus {
  if (!c) return 'joined';
  if (c.status === 'paid') return 'paid';
  if (c.status === 'reversed') return 'reversed';
  return 'qualified';
}

/**
 * Owner 2026-10-05: the partner (affiliate) program. A partner is a user
 * the admin marked as such; their referral code is the attribution.
 * Commissions accrue only on the qualifying event — an attorney's first
 * paid subscription invoice, a client's hire (or first case, per rule) —
 * go through an anti-fraud hold, and are reversed on refund / rejection.
 * Payout happens from the admin (Деньги → Партнёры → «Выплатить») or by
 * the payroll module through [listPayable] / [markPaid].
 */
@Injectable()
export class PartnersService {
  private readonly logger = new Logger(PartnersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  // ---- settings ---------------------------------------------------------

  async settings(db: Db = this.prisma): Promise<PartnerProgramSettings> {
    const row = await db.appConfig.findUnique({
      where: { key: PARTNER_SETTINGS_KEY },
    });
    return parsePartnerSettings(row?.value);
  }

  /** The owner's master switch (settings `partners.program.enabled`). */
  async programEnabled(): Promise<boolean> {
    return (await this.settings()).enabled;
  }

  shareUrl(code: string): string {
    return referralShareUrl(this.config.get<string>('APP_LINK_BASE_URL'), code);
  }

  /** The user's referral code, created on first use (same code as the
   * referral screen — one link per person). */
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
        if (!isUniqueViolation(e)) throw e;
        const row = await this.prisma.referralCode.findUnique({
          where: { user_id: userId },
        });
        if (row) return row.code;
      }
    }
    throw new Error('Could not allocate a unique referral code');
  }

  /** The active partner behind a referral code owner, or null. */
  async activePartnerOf(userId: string): Promise<Partner | null> {
    const p = await this.prisma.partner.findUnique({
      where: { user_id: userId },
    });
    return p && p.status === 'active' ? p : null;
  }

  // ---- app --------------------------------------------------------------

  /**
   * Owner 2026-10-05 (legal): the partner's words plus the FTC disclosure
   * and the rules from legal.settings (read straight from app_config so
   * the partners module does not depend on LegalModule).
   */
  private async texts(
    settings: PartnerProgramSettings,
    lang: PartnerLang,
  ): Promise<PartnerMeTextsDto> {
    const legal = await readLegalSettings(this.prisma);
    const t = legal.texts[legalLangOf(lang)];
    return {
      ...settings.texts[lang],
      disclosure: t.partnerDisclosure,
      terms: t.partnerTerms,
    };
  }

  /** GET /partners/me. Non-partners get `isPartner: false` and no data. */
  async me(userId: string): Promise<PartnerMeDto> {
    const partner = await this.prisma.partner.findUnique({
      where: { user_id: userId },
    });
    const settings = await this.settings();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ui_language: true, role: true },
    });
    const lang: PartnerLang = user?.ui_language === 'ru' ? 'ru' : 'en';
    const texts = await this.texts(settings, lang);
    const canJoin =
      settings.enabled &&
      settings.joinMode !== 'closed' &&
      !partner &&
      canSelfEnroll(user?.role);
    const empty: PartnerMeDto = {
      enabled: settings.enabled,
      isPartner: false,
      canJoin,
      joinMode: settings.joinMode,
      status: null,
      code: '',
      shareUrl: '',
      // Program rates, so the app can show what joining pays.
      rates: {
        attorneyRateCents: settings.attorneyRateCents,
        clientRateCents: settings.clientRateCents,
        monthlyBaseCents: 0,
        clientRule: settings.clientRule,
        holdDays: settings.holdDays,
      },
      totals: emptyTotals(),
      referred: [],
      commissions: [],
      texts,
      termsVersion: PARTNER_TERMS_VERSION,
      termsAcceptedVersion: null,
      w9Required: settings.requireW9,
      w9Received: false,
    };
    if (!partner) return empty;
    const code = await this.ensureCode(userId);
    const [totals, referred, commissions] = await Promise.all([
      this.totals(partner.id),
      this.referredOf(partner),
      this.prisma.partnerCommission.findMany({
        where: { partner_id: partner.id },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: LIST_LIMIT,
      }),
    ]);
    return {
      enabled: settings.enabled,
      isPartner: true,
      canJoin: false,
      joinMode: settings.joinMode,
      status: partner.status as PartnerStatus,
      code,
      shareUrl: this.shareUrl(code),
      rates: this.rates(settings, partner),
      totals,
      referred: referred.map((r) => ({
        id: r.id,
        // The partner sees first name + initial, not the full identity.
        name: r.name ? shortName(r.name) : null,
        role: r.role,
        status: r.status,
        amountCents: r.amountCents,
        joinedAt: r.joinedAt,
        qualifiedAt: r.qualifiedAt,
      })),
      commissions: commissions.map(commissionDto),
      texts,
      termsVersion: PARTNER_TERMS_VERSION,
      // Only an acceptance of the CURRENT version counts: after a rules
      // change the app shows the sheet again.
      termsAcceptedVersion:
        partner.terms_accepted_at &&
        partner.terms_version === PARTNER_TERMS_VERSION
          ? partner.terms_version
          : null,
      w9Required: settings.requireW9,
      w9Received: partner.w9_received_at !== null,
    };
  }

  /**
   * POST /partners/me/join — owner 2026-10-05: attorneys and clients take
   * their partner link themselves; the admin no longer has to hand out
   * codes one by one. Program defaults apply (the admin can still set own
   * rates later). joinMode 'open' activates at once; 'approval' creates a
   * pending request the admin confirms (no attribution until then);
   * 'closed' and a switched-off program refuse. A partnership the admin
   * ended cannot be rejoined.
   *
   * Owner 2026-10-05 (legal): joining requires accepting the partner
   * rules (FTC disclosure, no spam, independent contractor, ...); the
   * acceptance is recorded with its version and the request IP.
   */
  async join(
    userId: string,
    opts: { termsAccepted: boolean; ip?: string | null },
  ): Promise<PartnerMeDto> {
    if (opts.termsAccepted !== true) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Accept the partner rules to join.',
        details: { field: 'termsAccepted' },
      });
    }
    const settings = await this.settings();
    if (!settings.enabled || settings.joinMode === 'closed') {
      throw new ForbiddenException({
        code: ErrorCode.FEATURE_DISABLED,
        message: 'The partner program is not open for joining right now.',
      });
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true, deleted_at: true },
    });
    if (
      !user ||
      user.deleted_at ||
      user.status !== 'active' ||
      !canSelfEnroll(user.role)
    ) {
      throw new ForbiddenException({
        code: ErrorCode.FEATURE_DISABLED,
        message: 'Only active attorney and client accounts can join.',
      });
    }
    const existing = await this.prisma.partner.findUnique({
      where: { user_id: userId },
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.PARTNER_INVALID_STATE,
        message:
          existing.status === 'ended'
            ? 'This partnership was ended by the administrator.'
            : existing.status === 'pending'
              ? 'Your request is waiting for the administrator.'
              : 'You are already a partner.',
      });
    }
    try {
      await this.prisma.partner.create({
        data: {
          user_id: userId,
          status: settings.joinMode === 'approval' ? 'pending' : 'active',
          note: 'self-enrolled',
          ...termsAcceptance(opts.ip),
        },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // joined twice at once: fine
    }
    await this.ensureCode(userId);
    return this.me(userId);
  }

  /**
   * POST /partners/me/accept-terms — an existing partner (added by the
   * admin, or one who joined before the rules existed / under an older
   * version) accepts the current rules. Same record as on join.
   */
  async acceptTerms(userId: string, ip?: string | null): Promise<PartnerMeDto> {
    const partner = await this.prisma.partner.findUnique({
      where: { user_id: userId },
    });
    if (!partner || partner.status === 'ended') {
      throw new ConflictException({
        code: ErrorCode.PARTNER_INVALID_STATE,
        message: 'You are not a partner.',
      });
    }
    await this.prisma.partner.update({
      where: { id: partner.id },
      data: termsAcceptance(ip),
    });
    return this.me(userId);
  }

  /** The admin answered a join request (admin-partners.service). */
  async notifyJoinDecision(
    partner: Partner,
    decision: 'approved' | 'declined',
  ): Promise<void> {
    await this.notifications
      ?.emit({
        type: decision === 'approved' ? 'partner_approved' : 'partner_declined',
        recipientId: partner.user_id,
        payload: { partnerId: partner.id },
      })
      .catch((e: unknown) =>
        this.logger.warn(
          `partner ${decision} notification failed: ${String(e)}`,
        ),
      );
  }

  rates(settings: PartnerProgramSettings, partner: Partner): PartnerRatesDto {
    return effectiveRates(settings, partner);
  }

  /** Sums per status for one partner (or for everyone when omitted). */
  async totals(
    partnerId?: string,
    now = new Date(),
  ): Promise<PartnerTotalsDto> {
    const where: Prisma.PartnerCommissionWhereInput = partnerId
      ? { partner_id: partnerId }
      : {};
    const [byStatus, month, referredCount, qualified] = await Promise.all([
      this.prisma.partnerCommission.groupBy({
        by: ['status'],
        where,
        _sum: { amount_cents: true },
      }),
      this.prisma.partnerCommission.aggregate({
        where: { ...where, period: periodOf(now), status: { not: 'reversed' } },
        _sum: { amount_cents: true },
      }),
      partnerId
        ? this.prisma.partner
            .findUnique({ where: { id: partnerId }, select: { user_id: true } })
            .then((p) =>
              p
                ? this.prisma.referral.count({
                    where: {
                      referrer_id: p.user_id,
                      status: { not: 'rejected' },
                    },
                  })
                : 0,
            )
        : this.prisma.referral.count({
            where: {
              status: { not: 'rejected' },
              referrer_id: {
                in: (
                  await this.prisma.partner.findMany({
                    select: { user_id: true },
                  })
                ).map((p) => p.user_id),
              },
            },
          }),
      this.prisma.partnerCommission.count({
        where: {
          ...where,
          kind: { in: PER_PERSON_KINDS },
          status: { not: 'reversed' },
        },
      }),
    ]);
    const sum = (s: CommissionStatus) =>
      byStatus.find((b) => b.status === s)?._sum.amount_cents ?? 0;
    return {
      heldCents: sum('held'),
      approvedCents: sum('approved'),
      paidCents: sum('paid'),
      thisMonthCents: month._sum.amount_cents ?? 0,
      referredCount,
      qualifiedCount: qualified,
    };
  }

  /** Everyone who joined by the partner's code, newest first, with the
   * commission (if any) they earned the partner. */
  async referredOf(partner: Partner): Promise<
    (PartnerReferredUserDto & {
      email: string | null;
      referralId: string;
      referralStatus: string;
    })[]
  > {
    const referrals = await this.prisma.referral.findMany({
      where: { referrer_id: partner.user_id },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: LIST_LIMIT,
    });
    if (referrals.length === 0) return [];
    const ids = referrals.map((r) => r.referee_id);
    const [users, commissions] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, first_name: true, last_name: true, email: true },
      }),
      this.prisma.partnerCommission.findMany({
        where: {
          partner_id: partner.id,
          referral_id: { in: referrals.map((r) => r.id) },
          kind: { in: PER_PERSON_KINDS },
        },
        orderBy: { created_at: 'desc' },
      }),
    ]);
    const byUser = new Map(users.map((u) => [u.id, u]));
    const byReferral = new Map<string, PartnerCommission>();
    for (const c of commissions) {
      if (c.referral_id && !byReferral.has(c.referral_id))
        byReferral.set(c.referral_id, c);
    }
    return referrals.map((r) => {
      const u = byUser.get(r.referee_id);
      const c = byReferral.get(r.id);
      return {
        id: r.referee_id,
        name: u
          ? [u.first_name, u.last_name].filter(Boolean).join(' ') || null
          : null,
        email: u?.email ?? null,
        role: r.referee_role,
        status: r.status === 'rejected' ? 'reversed' : referredStatusOf(c),
        amountCents: c && c.status !== 'reversed' ? c.amount_cents : 0,
        joinedAt: r.created_at.toISOString(),
        qualifiedAt: c?.created_at.toISOString() ?? null,
        referralId: r.id,
        referralStatus: r.status,
      };
    });
  }

  // ---- accrual ------------------------------------------------------------

  /**
   * Called by ReferralsService.onQualifyingEvent for every event
   * (subscription_payment, case_published, bid_accepted) of a referred
   * user. Accrues at most one commission per referred person (event_ref
   * unique). Never throws.
   */
  async onQualifyingEvent(
    refereeUserId: string,
    kind: QualifyingEventKind,
    now = new Date(),
  ): Promise<PartnerCommission | null> {
    try {
      const referral = await this.prisma.referral.findUnique({
        where: { referee_id: refereeUserId },
      });
      if (!referral || referral.status === 'rejected') return null;
      const partner = await this.activePartnerOf(referral.referrer_id);
      if (!partner) return null;
      const settings = await this.settings();
      if (!settings.enabled) return null;
      const rates = effectiveRates(settings, partner);
      let commissionKind: CommissionKind;
      let amount: number;
      if (referral.referee_role === 'attorney') {
        if (kind !== 'subscription_payment') return null;
        commissionKind = 'attorney_subscription';
        amount = rates.attorneyRateCents;
      } else if (referral.referee_role === 'client') {
        if (kind !== rates.clientRule) return null;
        commissionKind = 'client_qualified';
        amount = rates.clientRateCents;
      } else {
        return null;
      }
      if (amount <= 0) return null;
      // Self-referral is refused at apply time; this is the belt to those
      // braces (a code moved by an admin, an account merged, ...).
      if (referral.referee_id === partner.user_id) return null;
      return await this.accrue({
        partner,
        referral,
        kind: commissionKind,
        amountCents: amount,
        holdDays: rates.holdDays,
        eventRef: `referral:${referral.id}:${commissionKind}`,
        now,
      });
    } catch (e) {
      this.logger.warn(
        { refereeUserId, kind, err: String(e) },
        'partner commission accrual failed',
      );
      return null;
    }
  }

  private async accrue(input: {
    partner: Partner;
    referral: Referral | null;
    kind: CommissionKind;
    amountCents: number;
    holdDays: number;
    eventRef: string;
    now: Date;
    note?: string;
  }): Promise<PartnerCommission | null> {
    const held = input.holdDays > 0;
    let created: PartnerCommission;
    try {
      created = await this.prisma.partnerCommission.create({
        data: {
          partner_id: input.partner.id,
          partner_user_id: input.partner.user_id,
          referral_id: input.referral?.id ?? null,
          referred_user_id: input.referral?.referee_id ?? null,
          kind: input.kind,
          amount_cents: input.amountCents,
          status: held ? 'held' : 'approved',
          event_ref: input.eventRef,
          period: periodOf(input.now),
          hold_until: held
            ? new Date(input.now.getTime() + input.holdDays * DAY_MS)
            : null,
          approved_at: held ? null : input.now,
          note: input.note ?? null,
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) return null; // already accrued
      throw e;
    }
    await this.notifications
      ?.emit({
        type: 'partner_commission',
        recipientId: input.partner.user_id,
        payload: {
          commissionId: created.id,
          amountCents: created.amount_cents,
          kind: created.kind,
          held,
        },
      })
      .catch(() => undefined);
    return created;
  }

  /** Daily: held accruals past their hold → approved (a rejected referral
   * or a refunded payment reverses instead); the monthly base of active
   * partners for the current period. */
  async sweep(now = new Date()): Promise<{
    approved: number;
    reversed: number;
    monthlyBase: number;
  }> {
    const released = await this.release(now);
    const monthlyBase = await this.accrueMonthlyBase(now);
    return { ...released, monthlyBase };
  }

  async release(
    now = new Date(),
  ): Promise<{ approved: number; reversed: number }> {
    const due = await this.prisma.partnerCommission.findMany({
      where: { status: 'held', hold_until: { not: null, lte: now } },
      take: 500,
    });
    let approved = 0;
    let reversed = 0;
    for (const c of due) {
      const bad = await this.reversalReason(c);
      if (bad) {
        if (await this.reverseOne(c.id, bad, now)) reversed += 1;
        continue;
      }
      const res = await this.prisma.partnerCommission.updateMany({
        where: { id: c.id, status: 'held' },
        data: { status: 'approved', approved_at: now },
      });
      approved += res.count;
    }
    return { approved, reversed };
  }

  /** Why a held accrual must not be paid, or null. */
  private async reversalReason(c: PartnerCommission): Promise<string | null> {
    if (c.referral_id) {
      const r = await this.prisma.referral.findUnique({
        where: { id: c.referral_id },
        select: { status: true },
      });
      if (!r || r.status === 'rejected') return 'referral_rejected';
    }
    if (c.kind === 'attorney_subscription' && c.referred_user_id) {
      const refunded = await this.prisma.payment.count({
        where: { user_id: c.referred_user_id, status: 'refunded' },
      });
      if (refunded > 0) return 'payment_refunded';
    }
    if (c.referred_user_id) {
      const u = await this.prisma.user.findUnique({
        where: { id: c.referred_user_id },
        select: { status: true, deleted_at: true },
      });
      if (!u || u.deleted_at || u.status === 'deleted') return 'user_deleted';
    }
    return null;
  }

  async accrueMonthlyBase(now = new Date()): Promise<number> {
    const partners = await this.prisma.partner.findMany({
      where: { status: 'active', monthly_base_cents: { gt: 0 } },
    });
    const period = periodOf(now);
    let n = 0;
    for (const p of partners) {
      const c = await this.accrue({
        partner: p,
        referral: null,
        kind: 'monthly_base',
        amountCents: p.monthly_base_cents,
        holdDays: 0,
        eventRef: `base:${p.id}:${period}`,
        now,
        note: period,
      });
      if (c) n += 1;
    }
    return n;
  }

  // ---- reversal -----------------------------------------------------------

  /** A refund / chargeback of the referred attorney's payment, or an
   * account deletion: every commission earned on that person is reversed
   * (paid ones become a deduction). Never throws. */
  async reverseForReferredUser(
    referredUserId: string,
    reason: string,
    now = new Date(),
  ): Promise<number> {
    try {
      const rows = await this.prisma.partnerCommission.findMany({
        where: {
          referred_user_id: referredUserId,
          status: { in: ['held', 'approved', 'paid'] },
        },
      });
      let n = 0;
      for (const c of rows)
        if (await this.reverseOne(c.id, reason, now)) n += 1;
      return n;
    } catch (e) {
      this.logger.warn(
        { referredUserId, reason, err: String(e) },
        'partner commission reversal failed',
      );
      return 0;
    }
  }

  /** An admin rejected the referral (fraud): same as above, by referral. */
  async reverseForReferral(
    referralId: string,
    reason: string,
    now = new Date(),
  ): Promise<number> {
    const rows = await this.prisma.partnerCommission.findMany({
      where: {
        referral_id: referralId,
        status: { in: ['held', 'approved', 'paid'] },
      },
    });
    let n = 0;
    for (const c of rows) if (await this.reverseOne(c.id, reason, now)) n += 1;
    return n;
  }

  /**
   * held/approved → reversed. An already PAID commission cannot be taken
   * back, so it stays paid and a negative `adjustment` (approved, same
   * amount) is added: the next payout nets it out.
   */
  async reverseOne(
    commissionId: string,
    reason: string,
    now = new Date(),
    actorId: string | null = null,
  ): Promise<boolean> {
    return withTxRetry(this.prisma, async (tx) => {
      const c = await tx.partnerCommission.findUnique({
        where: { id: commissionId },
      });
      if (!c) return false;
      if (c.status === 'held' || c.status === 'approved') {
        const res = await tx.partnerCommission.updateMany({
          where: { id: c.id, status: c.status },
          data: {
            status: 'reversed',
            reversed_at: now,
            reversed_reason: reason.slice(0, 300),
          },
        });
        return res.count > 0;
      }
      if (c.status === 'paid') {
        try {
          await tx.partnerCommission.create({
            data: {
              partner_id: c.partner_id,
              partner_user_id: c.partner_user_id,
              referral_id: c.referral_id,
              referred_user_id: c.referred_user_id,
              kind: 'adjustment',
              amount_cents: -c.amount_cents,
              status: 'approved',
              event_ref: `reverse:${c.id}`,
              period: periodOf(now),
              approved_at: now,
              approved_by: actorId,
              note: reason.slice(0, 300),
            },
          });
          return true;
        } catch (e) {
          if (isUniqueViolation(e)) return false;
          throw e;
        }
      }
      return false;
    });
  }

  // ---- payout seam (admin and the payroll module) ---------------------------

  /** Approved commissions ready to be paid, oldest first. */
  listPayable(
    partnerId?: string,
    period?: string,
  ): Promise<PartnerCommission[]> {
    return this.prisma.partnerCommission.findMany({
      where: {
        status: 'approved',
        ...(partnerId ? { partner_id: partnerId } : {}),
        ...(period ? { period } : {}),
      },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: 1000,
    });
  }

  /**
   * Marks approved commissions paid (one payout). Returns what was paid;
   * rows that changed meanwhile are skipped. Tells the partner once.
   */
  async markPaid(
    ids: string[],
    opts: { payoutRef?: string | null; actorId?: string | null; now?: Date },
  ): Promise<{ count: number; totalCents: number; partnerUserIds: string[] }> {
    if (ids.length === 0)
      return { count: 0, totalCents: 0, partnerUserIds: [] };
    const now = opts.now ?? new Date();
    const settings = await this.settings();
    const paid = await withTxRetry(this.prisma, async (tx) => {
      const rows = await tx.partnerCommission.findMany({
        where: { id: { in: ids }, status: 'approved' },
      });
      if (rows.length === 0) return rows;
      // Owner 2026-10-05 (legal): no payout without the tax form on file
      // (IRS 1099 reporting); the admin marks it received on the partner.
      if (settings.requireW9) {
        const missing = await tx.partner.findMany({
          where: {
            id: { in: [...new Set(rows.map((r) => r.partner_id))] },
            w9_received_at: null,
          },
          select: { id: true },
        });
        if (missing.length > 0) {
          throw new ConflictException({
            code: ErrorCode.PARTNER_INVALID_STATE,
            message: 'W-9 not received',
            details: { partnerIds: missing.map((p) => p.id) },
          });
        }
      }
      await tx.partnerCommission.updateMany({
        where: { id: { in: rows.map((r) => r.id) }, status: 'approved' },
        data: {
          status: 'paid',
          paid_at: now,
          paid_by: opts.actorId ?? null,
          payout_ref: opts.payoutRef ?? null,
        },
      });
      return rows;
    });
    const byPartner = new Map<string, { count: number; total: number }>();
    for (const r of paid) {
      const cur = byPartner.get(r.partner_user_id) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += r.amount_cents;
      byPartner.set(r.partner_user_id, cur);
    }
    for (const [userId, agg] of byPartner) {
      await this.notifications
        ?.emit({
          type: 'partner_payout',
          recipientId: userId,
          payload: {
            count: agg.count,
            amountCents: agg.total,
            payoutRef: opts.payoutRef ?? null,
          },
        })
        .catch(() => undefined);
    }
    return {
      count: paid.length,
      totalCents: paid.reduce((s, r) => s + r.amount_cents, 0),
      partnerUserIds: [...byPartner.keys()],
    };
  }
}

/** The columns written when a partner accepts the current rules. */
export function termsAcceptance(
  ip: string | null | undefined,
  now = new Date(),
): { terms_accepted_at: Date; terms_version: string; terms_ip: string | null } {
  return {
    terms_accepted_at: now,
    terms_version: PARTNER_TERMS_VERSION,
    terms_ip: ip ? ip.slice(0, 45) : null,
  };
}

export function emptyTotals(): PartnerTotalsDto {
  return {
    heldCents: 0,
    approvedCents: 0,
    paidCents: 0,
    thisMonthCents: 0,
    referredCount: 0,
    qualifiedCount: 0,
  };
}

/** "Anna K." — what a partner sees about the people they brought. */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}
