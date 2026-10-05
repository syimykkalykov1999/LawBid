import {
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import type { ClientFraudProfile, Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type { EmailProvider } from '../auth/providers/email/email-provider.interface';
import { EMAIL_PROVIDER } from '../auth/providers/provider.tokens';
import { SessionRevocationService } from '../auth/services/session-revocation.service';
import { CaseLifecycleService } from '../cases/lifecycle/case-lifecycle.service';
import {
  DEVICE_KINDS,
  FP_KIND,
  FRAUD_EVENT,
  FRAUD_STATUS,
  FRAUD_SUSPENDED_REASON,
  IP_MATCH_DAYS,
  MATCH_ACTIONS,
  SIGNALS,
  STRONG_KINDS,
  WEIGHTS,
  type FpKind,
  type FraudEventKind,
  type FraudStatus,
  type MatchAction,
  type SignalCode,
} from './client-fraud.constants';
import { fingerprintHash, isComparableText } from './fingerprint.util';
import {
  decideStatus,
  maxStatus,
  rankOf,
  statusOfAction,
  statusOfScore,
} from './fraud-decision';

const DAY_MS = 86_400_000;
/** Reports with these reasons count as a fraud complaint. */
const FRAUD_REASONS = ['fraud', 'impersonation'] as const;
/** At most this many linked accounts are re-scored after one ban. */
const PROPAGATE_LIMIT = 200;
/** One staff e-mail per admin per this many seconds. */
const STAFF_MAIL_THROTTLE_SECONDS = 30 * 60;

export interface SignInSignals {
  phone?: string | null;
  email?: string | null;
  social?: { provider: 'apple' | 'google'; uid: string } | null;
  /** `X-Device-Key`: Android ID / iOS Keychain id. */
  deviceKey?: string | null;
  ip?: string | null;
}

export interface FpPair {
  kind: FpKind;
  hash: string;
}

export interface SignalItem {
  code: SignalCode;
  points: number;
  count: number;
}

export interface SignInVerdict {
  action: 'allow' | 'review' | 'block';
  matchedUserId: string | null;
  kinds: FpKind[];
}

export interface FraudSettings {
  enabled: boolean;
  auto: boolean;
  matchAction: MatchAction;
  deviceAction: MatchAction;
  reviewScore: number;
  restrictScore: number;
  banScore: number;
  weightFraudReport: number;
  weightReport: number;
  weightChargeback: number;
  windowDays: number;
  notifyStaff: boolean;
  fingerprintRetentionDays: number;
  blockedRetentionDays: number;
}

interface Actor {
  type: 'system' | 'admin';
  id?: string | null;
}

/**
 * Owner 2026-10-05 (docs/CLIENT_FRAUD.md): repeat accounts of blocked
 * fraudsters and the client risk score.
 *
 * - Every sign-in records hashed signals of the account (phone, e-mail,
 *   Apple / Google subject, on-device key, card, IP) and each published
 *   case its text.
 * - A sign-in sharing a strong signal with a blocked account is refused
 *   (`fraud.match_action` = block) or the account is restricted until
 *   staff look (review); the phone (device) has its own setting.
 * - Complaints of attorneys who dealt with the client, chargebacks,
 *   confirmed fake contacts and cancelled cases add up to a score; the
 *   thresholds queue, restrict or block the account by themselves.
 * - A block re-scores every account sharing a signal with the blocked one,
 *   so the fraudster's other accounts fall with it.
 *
 * `@Global()` core: auth, cases, chat, reports and the admin read it.
 * Session revocation, case archiving and the staff e-mail are resolved
 * lazily (ModuleRef) so this module depends on none of their modules.
 */
@Injectable()
export class ClientFraudService {
  private readonly pepper: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    config: ConfigService,
    private readonly moduleRef: ModuleRef,
    private readonly logger: PinoLogger,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() @Inject(EMAIL_PROVIDER) private readonly email?: EmailProvider,
  ) {
    this.logger.setContext(ClientFraudService.name);
    this.pepper = config.getOrThrow<string>('AUTH_EVENT_PEPPER');
  }

  // --- settings ------------------------------------------------------------

  async config(): Promise<FraudSettings> {
    const s = this.settings;
    const [
      enabled,
      auto,
      matchAction,
      deviceAction,
      reviewScore,
      restrictScore,
      banScore,
      weightFraudReport,
      weightReport,
      weightChargeback,
      windowDays,
      notifyStaff,
      fingerprintRetentionDays,
      blockedRetentionDays,
    ] = await Promise.all([
      s.boolean('fraud.enabled'),
      s.boolean('fraud.auto'),
      s.string('fraud.match_action'),
      s.string('fraud.device_action'),
      s.number('fraud.review_score'),
      s.number('fraud.restrict_score'),
      s.number('fraud.ban_score'),
      s.number('fraud.weight_fraud_report'),
      s.number('fraud.weight_report'),
      s.number('fraud.weight_chargeback'),
      s.number('fraud.window_days'),
      s.boolean('fraud.notify_staff'),
      s.number('fraud.fingerprint_retention_days'),
      s.number('fraud.blocked_retention_days'),
    ]);
    return {
      enabled,
      auto,
      matchAction: asAction(matchAction, 'block'),
      deviceAction: asAction(deviceAction, 'review'),
      reviewScore,
      restrictScore,
      banScore,
      weightFraudReport,
      weightReport,
      weightChargeback,
      windowDays,
      notifyStaff,
      fingerprintRetentionDays,
      blockedRetentionDays,
    };
  }

  // --- hashing -------------------------------------------------------------

  hash(kind: FpKind, value: string): string {
    return fingerprintHash(this.pepper, kind, value);
  }

  pairsOf(s: SignInSignals): FpPair[] {
    const out: FpPair[] = [];
    const add = (kind: FpKind, v: string | null | undefined) => {
      if (v && v.trim().length >= 3)
        out.push({ kind, hash: this.hash(kind, v) });
    };
    add(FP_KIND.phone, s.phone);
    add(FP_KIND.email, s.email);
    if (s.social) add(s.social.provider, s.social.uid);
    add(FP_KIND.device, s.deviceKey);
    add(FP_KIND.ip, s.ip);
    return out;
  }

  // --- sign-in -------------------------------------------------------------

  /**
   * Does this sign-in share a strong signal (or the phone) with a blocked
   * account? `userId` = the account signing in, if it already exists (its
   * own signals never match itself).
   */
  async checkSignIn(
    signals: SignInSignals,
    userId?: string | null,
  ): Promise<SignInVerdict> {
    const allow: SignInVerdict = {
      action: 'allow',
      matchedUserId: null,
      kinds: [],
    };
    const cfg = await this.config();
    if (!cfg.enabled) return allow;
    if (userId && (await this.isStaff(userId))) return allow;
    const pairs = this.pairsOf(signals).filter(
      (p) => STRONG_KINDS.includes(p.kind) || DEVICE_KINDS.includes(p.kind),
    );
    const matches = await this.blockedMatches(pairs, userId ?? null);
    if (matches.length === 0) return allow;
    const strong = matches.filter((m) => STRONG_KINDS.includes(m.kind));
    const action = strong.length > 0 ? cfg.matchAction : cfg.deviceAction;
    if (action === 'off') return allow;
    const first = (strong[0] ?? matches[0]).userId;
    const kinds = [
      ...new Set((strong.length ? strong : matches).map((m) => m.kind)),
    ];
    const verdict: SignInVerdict['action'] =
      action === 'block' && cfg.auto ? 'block' : 'review';
    return { action: verdict, matchedUserId: first, kinds };
  }

  /**
   * Before a code is sent / an account is created: refuse a blocked
   * fraudster's new attempt. The answer is the same 403 a blocked account
   * gets, with nothing that says which signal matched.
   */
  async assertSignInAllowed(
    signals: SignInSignals,
    userId?: string | null,
  ): Promise<SignInVerdict> {
    let verdict: SignInVerdict;
    try {
      verdict = await this.checkSignIn(signals, userId);
    } catch (e) {
      // Never lock everyone out because the check itself failed.
      this.logger.warn({ err: e }, 'fraud sign-in check failed');
      return { action: 'allow', matchedUserId: null, kinds: [] };
    }
    if (verdict.action !== 'block') return verdict;
    await this.event(
      this.prisma,
      verdict.matchedUserId,
      FRAUD_EVENT.signInBlocked,
      { type: 'system' },
      {
        kinds: verdict.kinds,
        attemptUserId: userId ?? null,
      },
    ).catch(() => undefined);
    throw new ForbiddenException({
      code: ErrorCode.ACCOUNT_SUSPENDED,
      message: 'This account has been blocked. Contact support.',
      details: { blocked: true, reason: null, until: null },
    });
  }

  /**
   * After a successful sign-in: store the account's signals (hashes) and
   * re-score it. Never fails the sign-in.
   */
  async recordSignIn(userId: string, signals: SignInSignals): Promise<void> {
    try {
      const cfg = await this.config();
      if (!cfg.enabled || (await this.isStaff(userId))) return;
      const pairs = this.pairsOf(signals);
      const card = await this.prisma.subscription.findUnique({
        where: { user_id: userId },
        select: { card_fingerprint: true },
      });
      if (card?.card_fingerprint) {
        pairs.push({
          kind: FP_KIND.card,
          hash: this.hash(FP_KIND.card, card.card_fingerprint),
        });
      }
      await this.upsertPairs(userId, pairs);
      await this.recompute(userId);
    } catch (e) {
      this.logger.warn({ err: e, userId }, 'fraud record failed');
    }
  }

  /** A published case: its text is a signal (the same scam from several
   * accounts), then the author is re-scored. Never fails the request. */
  async onCaseCreated(userId: string, text: string): Promise<void> {
    try {
      const cfg = await this.config();
      if (!cfg.enabled) return;
      if (isComparableText(text)) {
        await this.upsertPairs(userId, [
          { kind: FP_KIND.text, hash: this.hash(FP_KIND.text, text) },
        ]);
      }
      await this.recompute(userId);
    } catch (e) {
      this.logger.warn({ err: e, userId }, 'fraud case hook failed');
    }
  }

  /** A report on a user or on a client's case: re-score the client. */
  async onReport(targetType: string, targetId: string): Promise<void> {
    try {
      let userId: string | null = null;
      if (targetType === 'user') userId = targetId;
      else if (targetType === 'case') {
        const c = await this.prisma.case.findUnique({
          where: { id: targetId },
          select: { client_id: true },
        });
        userId = c?.client_id ?? null;
      }
      if (userId) await this.recompute(userId);
    } catch (e) {
      this.logger.warn({ err: e, targetId }, 'fraud report hook failed');
    }
  }

  /**
   * An account was blocked (by staff, by a rule or here): every account
   * sharing a signal with it is re-scored, so the other accounts of the
   * same person fall with it.
   */
  async onBanned(userId: string): Promise<number> {
    try {
      const cfg = await this.config();
      if (!cfg.enabled) return 0;
      // Only real links spread a ban: a shared case text or network
      // address is never enough to block someone else.
      const own = await this.prisma.identityFingerprint.findMany({
        where: {
          user_id: userId,
          kind: { in: [...STRONG_KINDS, ...DEVICE_KINDS] },
        },
        select: { kind: true, hash: true },
      });
      if (own.length === 0) return 0;
      const others = await this.prisma.identityFingerprint.findMany({
        where: {
          user_id: { not: userId },
          OR: own.map((p) => ({ kind: p.kind, hash: p.hash })),
        },
        select: { user_id: true },
        distinct: ['user_id'],
        take: PROPAGATE_LIMIT,
      });
      let changed = 0;
      for (const o of others) {
        const before = await this.statusOf(o.user_id);
        const after = await this.recompute(o.user_id, { linkedFrom: userId });
        if (after && after !== before) changed++;
      }
      return changed;
    } catch (e) {
      this.logger.warn({ err: e, userId }, 'fraud ban propagation failed');
      return 0;
    }
  }

  /** The account is deleted while blocked: its hashes keep blocking. */
  async freezeBanned(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma).identityFingerprint.updateMany({
      where: { user_id: userId, banned_at: null },
      data: { banned_at: new Date() },
    });
  }

  // --- gate ----------------------------------------------------------------

  /** Publishing a case, writing in a chat: refused while restricted. */
  async assertNotRestricted(userId: string): Promise<void> {
    const row = await this.prisma.clientFraudProfile.findUnique({
      where: { user_id: userId },
      select: { status: true },
    });
    if (row?.status !== FRAUD_STATUS.restricted) return;
    if (!(await this.settings.boolean('fraud.enabled'))) return;
    throw new ForbiddenException({
      code: ErrorCode.ACCOUNT_RESTRICTED,
      message:
        'Your account is limited while we check it. Contact support if you think this is a mistake.',
      details: { restricted: true },
    });
  }

  /** The account's own view: ok / review read as "ok" (no hint). */
  async standing(userId: string): Promise<'ok' | 'restricted'> {
    const row = await this.prisma.clientFraudProfile.findUnique({
      where: { user_id: userId },
      select: { status: true },
    });
    return row?.status === FRAUD_STATUS.restricted ? 'restricted' : 'ok';
  }

  // --- score ---------------------------------------------------------------

  /**
   * Recompute one account: signals → score → status, apply the status.
   * Returns the new status (null when the module is off or the account is
   * staff / gone).
   */
  async recompute(
    userId: string,
    opts: { linkedFrom?: string } = {},
  ): Promise<FraudStatus | null> {
    const cfg = await this.config();
    if (!cfg.enabled) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        status: true,
        admin_profile: { select: { user_id: true } },
      },
    });
    if (!user || user.admin_profile || user.status === 'deleted') return null;

    const { signals, linkStatus, linkedUserId } = await this.signalsOf(
      userId,
      user.role === 'client',
      cfg,
    );
    const score = signals.reduce((a, s) => a + s.points, 0);
    const linkPoints = signals
      .filter((s) => s.code === SIGNALS.sharedWithBlocked)
      .reduce((a, s) => a + s.points, 0);
    const scoreStatus =
      user.role === 'client'
        ? statusOfScore(score - linkPoints, cfg)
        : FRAUD_STATUS.ok;

    const row = await this.prisma.clientFraudProfile.findUnique({
      where: { user_id: userId },
    });
    // A person restored a blocked account elsewhere (Люди → Восстановить):
    // that counts as a staff «Снять» at the current score.
    const restored =
      row?.status === FRAUD_STATUS.banned && user.status === 'active';
    const clearedScore = restored
      ? Math.max(row.cleared_score ?? 0, row.score, score)
      : (row?.cleared_score ?? null);
    const current: FraudStatus =
      user.status === 'suspended'
        ? FRAUD_STATUS.banned
        : restored
          ? FRAUD_STATUS.ok
          : asStatus(row?.status);
    const next = decideStatus({
      linkStatus,
      scoreStatus,
      score,
      current,
      currentByStaff: !restored && row?.queue_reason === 'staff',
      clearedScore,
      auto: cfg.auto,
    });

    const now = new Date();
    const entering = rankOf(next) > rankOf(current);
    const reason =
      rankOf(linkStatus) >= rankOf(scoreStatus) && linkStatus !== 'ok'
        ? 'linked'
        : 'score';
    await this.prisma.clientFraudProfile.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        score,
        status: next,
        signals: signals as unknown as Prisma.InputJsonValue,
        linked_user_id: linkedUserId,
        queue_reason: next === 'ok' ? null : reason,
        queued_at: next === 'ok' ? null : now,
        computed_at: now,
      },
      update: {
        score,
        status: next,
        signals: signals as unknown as Prisma.InputJsonValue,
        linked_user_id: linkedUserId ?? row?.linked_user_id ?? null,
        ...(restored ? { cleared_score: clearedScore, cleared_at: now } : {}),
        ...(entering
          ? { queue_reason: reason, queued_at: now }
          : next === 'ok'
            ? { queue_reason: null, queued_at: null }
            : {}),
        computed_at: now,
      },
    });

    if (entering && user.status !== 'suspended') {
      const kind: FraudEventKind =
        next === FRAUD_STATUS.banned
          ? opts.linkedFrom
            ? FRAUD_EVENT.linkedBanned
            : FRAUD_EVENT.autoBanned
          : next === FRAUD_STATUS.restricted
            ? FRAUD_EVENT.autoRestricted
            : FRAUD_EVENT.autoReview;
      await this.event(
        this.prisma,
        userId,
        kind,
        { type: 'system' },
        {
          score,
          signals: signals as unknown as Prisma.InputJsonValue,
          linkedUserId: linkedUserId ?? null,
          reason,
        },
      );
      if (next === FRAUD_STATUS.banned) {
        await this.systemBan(
          userId,
          reason === 'linked'
            ? FRAUD_SUSPENDED_REASON.linked
            : FRAUD_SUSPENDED_REASON.auto,
        );
      }
      await this.notifyStaff(next, userId);
    }
    return next;
  }

  /** Everything the score is made of, plus the link rule. */
  async signalsOf(
    userId: string,
    isClient: boolean,
    cfg: FraudSettings,
  ): Promise<{
    signals: SignalItem[];
    linkStatus: FraudStatus;
    linkedUserId: string | null;
  }> {
    const since = new Date(Date.now() - cfg.windowDays * DAY_MS);
    const out: SignalItem[] = [];
    const push = (code: SignalCode, count: number, per: number) => {
      if (count <= 0) return;
      out.push({
        code,
        count,
        points: Math.min(count * per, WEIGHTS.signalCap),
      });
    };

    // Links with blocked accounts, and other accounts on the same phone.
    const own = await this.prisma.identityFingerprint.findMany({
      where: { user_id: userId },
      select: { kind: true, hash: true },
    });
    let linkStatus: FraudStatus = FRAUD_STATUS.ok;
    let linkedUserId: string | null = null;
    if (own.length > 0) {
      const shared = await this.prisma.identityFingerprint.findMany({
        where: {
          user_id: { not: userId },
          OR: own.map((p) => ({ kind: p.kind, hash: p.hash })),
        },
        select: {
          user_id: true,
          kind: true,
          last_seen_at: true,
          banned_at: true,
        },
        take: 1000,
      });
      const owners = [...new Set(shared.map((s) => s.user_id))];
      const blocked = await this.blockedOwners(owners, shared);
      const ipSince = Date.now() - IP_MATCH_DAYS * DAY_MS;
      const strongBlocked = new Set<string>();
      const deviceBlocked = new Set<string>();
      const weakBlocked = new Set<string>();
      const deviceOthers = new Set<string>();
      const textOthers = new Set<string>();
      for (const s of shared) {
        const kind = s.kind as FpKind;
        const isBlocked = blocked.has(s.user_id);
        if (kind === FP_KIND.ip && s.last_seen_at.getTime() < ipSince) continue;
        if (STRONG_KINDS.includes(kind)) {
          if (isBlocked) strongBlocked.add(s.user_id);
        } else if (DEVICE_KINDS.includes(kind)) {
          if (isBlocked) deviceBlocked.add(s.user_id);
          else deviceOthers.add(s.user_id);
        } else if (kind === FP_KIND.text) {
          // The same scam text: a real link. A shared network address is
          // not (carrier NAT, offices, Wi-Fi): it is shown to staff in the
          // linked accounts, never scored.
          if (isBlocked) weakBlocked.add(s.user_id);
          else textOthers.add(s.user_id);
        }
      }
      const matchOn = cfg.matchAction !== 'off';
      const deviceOn = cfg.deviceAction !== 'off';
      const linked = [
        ...(matchOn ? strongBlocked : []),
        ...(deviceOn
          ? [...deviceBlocked].filter((u) => !strongBlocked.has(u))
          : []),
      ];
      push(SIGNALS.sharedWithBlocked, linked.length, WEIGHTS.sharedWithBlocked);
      if (matchOn && strongBlocked.size > 0) {
        linkStatus = statusOfAction(cfg.matchAction);
        linkedUserId = [...strongBlocked][0];
      }
      if (deviceOn && deviceBlocked.size > 0) {
        linkStatus = maxStatus(linkStatus, statusOfAction(cfg.deviceAction));
        linkedUserId = linkedUserId ?? [...deviceBlocked][0];
      }
      const weakOnly = [...weakBlocked].filter(
        (u) => !strongBlocked.has(u) && !deviceBlocked.has(u),
      );
      push(
        SIGNALS.weakSharedWithBlocked,
        weakOnly.length,
        WEIGHTS.weakSharedWithBlocked,
      );
      push(
        SIGNALS.manyAccountsOnDevice,
        deviceOthers.size + 1 - WEIGHTS.accountsPerDeviceAllowance,
        WEIGHTS.manyAccountsOnDevice,
      );
      push(
        SIGNALS.duplicateText,
        Math.min(textOthers.size, WEIGHTS.duplicateTextMaxAccounts),
        WEIGHTS.duplicateText,
      );
    }

    if (isClient) {
      // Complaints from attorneys who actually dealt with the client.
      const cases = await this.prisma.case.findMany({
        where: { client_id: userId },
        select: { id: true },
        take: 500,
      });
      const reports = await this.prisma.report.findMany({
        where: {
          created_at: { gte: since },
          status: { not: 'dismissed' },
          OR: [
            { target_type: 'user', target_id: userId },
            ...(cases.length
              ? [
                  {
                    target_type: 'case' as const,
                    target_id: { in: cases.map((c) => c.id) },
                  },
                ]
              : []),
          ],
        },
        select: { reporter_id: true, reason: true },
      });
      const reporters = [...new Set(reports.map((r) => r.reporter_id))];
      const dealt = await this.dealtWith(userId, reporters);
      const fraudBy = new Set<string>();
      const otherBy = new Set<string>();
      for (const r of reports) {
        if (!dealt.has(r.reporter_id)) continue;
        if ((FRAUD_REASONS as readonly string[]).includes(r.reason))
          fraudBy.add(r.reporter_id);
      }
      for (const r of reports) {
        if (dealt.has(r.reporter_id) && !fraudBy.has(r.reporter_id))
          otherBy.add(r.reporter_id);
      }
      push(SIGNALS.fraudReports, fraudBy.size, cfg.weightFraudReport);
      push(SIGNALS.otherReports, otherBy.size, cfg.weightReport);

      const [contactIssues, chargebacks, cancelled] = await Promise.all([
        this.prisma.contactIssueReport.count({
          where: {
            client_id: userId,
            status: 'confirmed',
            created_at: { gte: since },
          },
        }),
        this.prisma.casePayment.count({
          where: { client_id: userId, disputed_at: { not: null, gte: since } },
        }),
        this.prisma.case.count({
          where: {
            client_id: userId,
            accepted_bid_id: null,
            status: { in: ['archived', 'closed'] },
            updated_at: { gte: since },
            bids: { some: {} },
          },
        }),
      ]);
      push(SIGNALS.contactIssues, contactIssues, WEIGHTS.contactIssue);
      push(SIGNALS.chargebacks, chargebacks, cfg.weightChargeback);
      push(
        SIGNALS.cancelledAfterBids,
        cancelled - WEIGHTS.cancelledFreeAllowance,
        WEIGHTS.cancelledAfterBids,
      );
    }
    return { signals: out, linkStatus, linkedUserId };
  }

  /** Accounts linked by any signal, with what they share (kinds only). */
  async linkedAccounts(
    userId: string,
  ): Promise<{ userId: string; kinds: FpKind[]; blocked: boolean }[]> {
    const own = await this.prisma.identityFingerprint.findMany({
      where: { user_id: userId },
      select: { kind: true, hash: true },
    });
    if (own.length === 0) return [];
    const shared = await this.prisma.identityFingerprint.findMany({
      where: {
        user_id: { not: userId },
        OR: own.map((p) => ({ kind: p.kind, hash: p.hash })),
      },
      select: {
        user_id: true,
        kind: true,
        last_seen_at: true,
        banned_at: true,
      },
      take: 1000,
    });
    const ipSince = Date.now() - IP_MATCH_DAYS * DAY_MS;
    const byUser = new Map<string, Set<FpKind>>();
    for (const s of shared) {
      if (s.kind === FP_KIND.ip && s.last_seen_at.getTime() < ipSince) continue;
      const set = byUser.get(s.user_id) ?? new Set<FpKind>();
      set.add(s.kind as FpKind);
      byUser.set(s.user_id, set);
    }
    const blocked = await this.blockedOwners([...byUser.keys()], shared);
    return [...byUser.entries()]
      .map(([id, kinds]) => ({
        userId: id,
        kinds: [...kinds],
        blocked: blocked.has(id),
      }))
      .sort(
        (a, b) =>
          Number(b.blocked) - Number(a.blocked) ||
          b.kinds.length - a.kinds.length,
      )
      .slice(0, 100);
  }

  // --- staff decisions (the admin service wraps these with audit) ----------

  async setByStaff(
    userId: string,
    status: FraudStatus,
    adminId: string,
    note: string | null,
    kind: FraudEventKind,
  ): Promise<ClientFraudProfile> {
    const now = new Date();
    const existing = await this.prisma.clientFraudProfile.findUnique({
      where: { user_id: userId },
    });
    const clearing = status === FRAUD_STATUS.ok;
    const row = await this.prisma.clientFraudProfile.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        status,
        queue_reason: clearing ? null : 'staff',
        queued_at: clearing ? null : now,
        ...(clearing
          ? { cleared_score: 0, cleared_by: adminId, cleared_at: now }
          : {}),
      },
      update: {
        status,
        queue_reason: clearing ? null : 'staff',
        queued_at: clearing ? null : now,
        ...(clearing
          ? {
              cleared_score: existing?.score ?? 0,
              cleared_by: adminId,
              cleared_at: now,
            }
          : {}),
      },
    });
    await this.event(
      this.prisma,
      userId,
      kind,
      { type: 'admin', id: adminId },
      {
        score: row.score,
        status,
      },
      note,
    );
    return row;
  }

  // --- maintenance ---------------------------------------------------------

  /**
   * Nightly: re-score the queue and the accounts blocked in the last two
   * days (their other accounts fall with them), record the card of
   * subscribers, and delete old hashes (retention).
   */
  async sweep(now = new Date()): Promise<{
    rescored: number;
    propagated: number;
    purged: number;
  }> {
    const cfg = await this.config();
    if (!cfg.enabled) return { rescored: 0, propagated: 0, purged: 0 };
    const queued = await this.prisma.clientFraudProfile.findMany({
      where: { status: { in: [FRAUD_STATUS.review, FRAUD_STATUS.restricted] } },
      select: { user_id: true },
      take: 2000,
    });
    for (const q of queued) await this.recompute(q.user_id).catch(() => null);
    const recentlyBlocked = await this.prisma.user.findMany({
      where: {
        status: 'suspended',
        updated_at: { gte: new Date(now.getTime() - 2 * DAY_MS) },
      },
      select: { id: true },
      take: 500,
    });
    let propagated = 0;
    for (const u of recentlyBlocked) propagated += await this.onBanned(u.id);
    const purged = await this.purge(cfg, now);
    return { rescored: queued.length, propagated, purged };
  }

  /** Retention (privacy): ordinary hashes after N days without use, those
   * of deleted ordinary accounts at once, blocked ones after the longer
   * period. */
  async purge(cfg: FraudSettings, now = new Date()): Promise<number> {
    const stale = new Date(
      now.getTime() - cfg.fingerprintRetentionDays * DAY_MS,
    );
    const blockedStale = new Date(
      now.getTime() - cfg.blockedRetentionDays * DAY_MS,
    );
    const suspended = await this.prisma.user.findMany({
      where: { status: 'suspended' },
      select: { id: true },
      take: 10_000,
    });
    const keep = suspended.map((u) => u.id);
    const a = await this.prisma.identityFingerprint.deleteMany({
      where: {
        banned_at: null,
        last_seen_at: { lt: stale },
        ...(keep.length ? { user_id: { notIn: keep } } : {}),
      },
    });
    const deleted = await this.prisma.user.findMany({
      where: { status: 'deleted', anonymized_at: { not: null } },
      select: { id: true },
      take: 5000,
    });
    const b = deleted.length
      ? await this.prisma.identityFingerprint.deleteMany({
          where: { banned_at: null, user_id: { in: deleted.map((d) => d.id) } },
        })
      : { count: 0 };
    const c = await this.prisma.identityFingerprint.deleteMany({
      where: {
        OR: [
          { banned_at: { lt: blockedStale } },
          ...(keep.length
            ? [{ user_id: { in: keep }, last_seen_at: { lt: blockedStale } }]
            : []),
        ],
      },
    });
    return a.count + b.count + c.count;
  }

  // --- internals -----------------------------------------------------------

  private async upsertPairs(userId: string, pairs: FpPair[]): Promise<void> {
    const now = new Date();
    for (const p of dedupe(pairs)) {
      await this.prisma.identityFingerprint.upsert({
        where: {
          user_id_kind_hash: { user_id: userId, kind: p.kind, hash: p.hash },
        },
        create: { user_id: userId, kind: p.kind, hash: p.hash },
        update: { last_seen_at: now },
      });
    }
  }

  /** Blocked accounts among the owners of matching signals. */
  private async blockedMatches(
    pairs: FpPair[],
    excludeUserId: string | null,
  ): Promise<{ userId: string; kind: FpKind }[]> {
    if (pairs.length === 0) return [];
    const rows = await this.prisma.identityFingerprint.findMany({
      where: {
        ...(excludeUserId ? { user_id: { not: excludeUserId } } : {}),
        OR: pairs.map((p) => ({ kind: p.kind, hash: p.hash })),
      },
      select: { user_id: true, kind: true, banned_at: true },
      take: 200,
    });
    if (rows.length === 0) return [];
    const blocked = await this.blockedOwners(
      [...new Set(rows.map((r) => r.user_id))],
      rows,
    );
    return rows
      .filter((r) => blocked.has(r.user_id))
      .map((r) => ({ userId: r.user_id, kind: r.kind as FpKind }));
  }

  /** An owner is blocked when the account is suspended, has an active
   * user ban, or its hash was frozen when the blocked account was deleted. */
  private async blockedOwners(
    owners: string[],
    rows: { user_id: string; banned_at: Date | null }[],
  ): Promise<Set<string>> {
    const out = new Set<string>(
      rows.filter((r) => r.banned_at !== null).map((r) => r.user_id),
    );
    if (owners.length === 0) return out;
    const [suspended, bans] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: owners }, status: 'suspended' },
        select: { id: true },
      }),
      this.prisma.accountBan.findMany({
        where: {
          kind: 'user',
          value: { in: owners },
          lifted_at: null,
          OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
        },
        select: { value: true },
      }),
    ]);
    for (const u of suspended) out.add(u.id);
    for (const b of bans) out.add(b.value);
    return out;
  }

  /** Reporters who had a bid on the client's case or a chat with them. */
  private async dealtWith(
    clientId: string,
    reporters: string[],
  ): Promise<Set<string>> {
    if (reporters.length === 0) return new Set();
    const [bids, chats] = await Promise.all([
      this.prisma.bid.findMany({
        where: {
          attorney_id: { in: reporters },
          case: { client_id: clientId },
        },
        select: { attorney_id: true },
        distinct: ['attorney_id'],
      }),
      this.prisma.conversation.findMany({
        where: { attorney_id: { in: reporters }, client_id: clientId },
        select: { attorney_id: true },
        distinct: ['attorney_id'],
      }),
    ]);
    return new Set([
      ...bids.map((b) => b.attorney_id),
      ...chats.map((c) => c.attorney_id),
    ]);
  }

  private async statusOf(userId: string): Promise<FraudStatus> {
    const row = await this.prisma.clientFraudProfile.findUnique({
      where: { user_id: userId },
      select: { status: true },
    });
    return asStatus(row?.status);
  }

  private async isStaff(userId: string): Promise<boolean> {
    const p = await this.prisma.adminProfile.findUnique({
      where: { user_id: userId },
      select: { user_id: true },
    });
    return p !== null;
  }

  /** Suspend the account, end its sessions, archive a client's open
   * cases; then its other accounts are re-scored. */
  private async systemBan(userId: string, reason: string): Promise<void> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, role: true },
    });
    if (!u || u.status !== 'active') return;
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'suspended', suspended_reason: reason },
    });
    const revocation = this.lazy(SessionRevocationService);
    await revocation
      ?.revokeAllChainsForUser(userId, 'admin_block')
      .catch((e: unknown) =>
        this.logger.warn({ err: e }, 'fraud revoke failed'),
      );
    if (u.role === 'client') {
      const lifecycle = this.lazy(CaseLifecycleService);
      await lifecycle
        ?.archiveOpenCasesOfClient(userId)
        .catch((e: unknown) =>
          this.logger.warn({ err: e }, 'fraud archive failed'),
        );
    }
    await this.onBanned(userId);
  }

  private lazy<T>(token: new (...args: never[]) => T): T | null {
    try {
      return this.moduleRef.get(token, { strict: false });
    } catch {
      return null;
    }
  }

  async event(
    db: Pick<PrismaService, 'clientFraudEvent'>,
    userId: string | null,
    kind: FraudEventKind,
    actor: Actor,
    details: Prisma.InputJsonObject,
    note?: string | null,
  ): Promise<void> {
    await db.clientFraudEvent.create({
      data: {
        user_id: userId,
        kind,
        actor_type: actor.type,
        actor_id: actor.id ?? null,
        note: note ?? null,
        details,
      },
    });
  }

  /** The verifiers (or the super admins) hear about a new block or queue
   * entry by e-mail, at most once per half hour each. */
  private async notifyStaff(
    status: FraudStatus,
    userId: string,
  ): Promise<void> {
    if (!this.email || status === FRAUD_STATUS.ok) return;
    if (!(await this.settings.boolean('fraud.notify_staff'))) return;
    try {
      let staff = await this.prisma.adminProfile.findMany({
        where: { admin_role: 'verifier' },
        select: { user_id: true },
      });
      if (staff.length === 0) {
        staff = await this.prisma.adminProfile.findMany({
          where: { admin_role: 'super_admin' },
          select: { user_id: true },
        });
      }
      const people = await this.prisma.user.findMany({
        where: { id: { in: staff.map((s) => s.user_id) }, deleted_at: null },
        select: { id: true, email: true },
      });
      const what =
        status === FRAUD_STATUS.banned
          ? 'blocked automatically'
          : status === FRAUD_STATUS.restricted
            ? 'restricted and waiting for a check'
            : 'waiting for a check';
      for (const p of people) {
        if (!p.email) continue;
        const key = `fraud:staff-mail:${p.id}`;
        if (
          (await this.redis.set(
            key,
            '1',
            'EX',
            STAFF_MAIL_THROTTLE_SECONDS,
            'NX',
          )) !== 'OK'
        )
          continue;
        await this.email.sendEmail({
          to: p.email,
          subject: 'LawBid: suspected fraud account',
          text: `An account was ${what} (id ${userId}).\n\nAdmin → Галочки → «Борьба с мошенниками» → «Клиенты».`,
        });
      }
    } catch (e) {
      this.logger.warn({ err: e }, 'fraud staff alert failed');
    }
  }
}

function asAction(v: string, fallback: MatchAction): MatchAction {
  return (MATCH_ACTIONS as readonly string[]).includes(v)
    ? (v as MatchAction)
    : fallback;
}

function asStatus(v: string | null | undefined): FraudStatus {
  return v === 'review' || v === 'restricted' || v === 'banned' ? v : 'ok';
}

function dedupe(pairs: FpPair[]): FpPair[] {
  const seen = new Set<string>();
  return pairs.filter((p) => {
    const k = `${p.kind}:${p.hash}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
