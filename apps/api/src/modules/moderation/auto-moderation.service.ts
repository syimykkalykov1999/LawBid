import { Injectable, Logger } from '@nestjs/common';
import type { ReportTargetType } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { StrikeGate } from '../../common/usage-limits/strike-gate.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReporterReputationService } from './reporter-reputation.service';

const DAY_MS = 24 * 3600 * 1000;

export type AutoKind =
  | 'content_hide'
  | 'account_limit'
  | 'account_suspend_temp'
  | 'account_suspend'
  | 'review_needed';

export type AutoMode = 'off' | 'shadow' | 'enforce';

const RANK: Record<string, number> = {
  account_limit: 1,
  account_suspend_temp: 2,
  account_suspend: 3,
};

export interface AccountScore {
  total: number;
  reporters: number;
  strikes: number;
  detections: number;
}

export interface AutoThresholds {
  limitAt: number;
  tempAt: number;
  suspendAt: number;
}

/** The step a score reaches (thresholds <= 0 are off). */
export function accountLevel(
  score: number,
  t: AutoThresholds,
): AutoKind | null {
  if (t.suspendAt > 0 && score >= t.suspendAt) return 'account_suspend';
  if (t.tempAt > 0 && score >= t.tempAt) return 'account_suspend_temp';
  if (t.limitAt > 0 && score >= t.limitAt) return 'account_limit';
  return null;
}

export function toMode(v: string): AutoMode {
  return v === 'enforce' || v === 'shadow' ? v : 'off';
}

/**
 * Owner 2026-10-27: moderation that works without a person in the loop.
 * The score of an ACCOUNT is the sum of
 *   - the weights of the distinct people who reported anything the account
 *     owns (the same weights as the content auto-hide: sock puppets weigh
 *     almost nothing, see report-weight.ts),
 *   - its live strike points, and
 *   - strong text detections,
 * so no single signal (and no mob) can act alone. Crossing the thresholds
 * limits the account, then pauses it for days, then suspends it. Every
 * step is one `moderation_auto_actions` row (score, threshold, borderline,
 * shadow or enforced) and the owner is told why; only an appeal brings a
 * human (AutoAppealsService). Verified attorneys never lose the account
 * automatically: `verified_attorney_action` = `review` queues them for a
 * priority human look, `higher_bar` multiplies the thresholds. Attorneys'
 * permanent suspension always needs a human (verification, bids, billing).
 */
@Injectable()
export class AutoModerationService {
  private readonly logger = new Logger(AutoModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly reputation: ReporterReputationService,
    private readonly gate: StrikeGate,
    private readonly notifications: NotificationsService,
  ) {}

  async thresholds(): Promise<AutoThresholds> {
    const [limitAt, tempAt, suspendAt] = await Promise.all([
      this.settings.number('moderation.auto.limit_at'),
      this.settings.number('moderation.auto.suspend_temp_at'),
      this.settings.number('moderation.auto.suspend_at'),
    ]);
    return { limitAt, tempAt, suspendAt };
  }

  async accountScore(userId: string): Promise<AccountScore> {
    const s = this.settings;
    const [windowDays, strikeScore, detectScore, holdAt] = await Promise.all([
      s.number('moderation.auto.window_days'),
      s.number('moderation.auto.strike_score'),
      s.number('moderation.auto.detect_score'),
      s.number('moderation.detect.hold_at'),
    ]);
    const now = new Date();
    const since = new Date(now.getTime() - windowDays * DAY_MS);
    const [reporterRows, strikes, detections] = await Promise.all([
      this.prisma.report.findMany({
        where: {
          target_author_id: userId,
          created_at: { gte: since },
          status: { in: ['open', 'actioned'] },
        },
        select: { reporter_id: true },
        distinct: ['reporter_id'],
        take: 100,
      }),
      this.prisma.userStrike.aggregate({
        where: { user_id: userId, revoked_at: null, expires_at: { gt: now } },
        _sum: { points: true },
      }),
      this.prisma.moderationDetection.count({
        where: {
          user_id: userId,
          acted: true,
          score: { gte: holdAt },
          created_at: { gte: since },
        },
      }),
    ]);
    const weights = reporterRows.length
      ? await this.reputation.weigh(
          reporterRows.map((r) => r.reporter_id),
          userId,
        )
      : { total: 0 };
    const strikePoints = strikes._sum.points ?? 0;
    return {
      total:
        Math.round(
          (weights.total +
            strikePoints * strikeScore +
            detections * detectScore) *
            1000,
        ) / 1000,
      reporters: reporterRows.length,
      strikes: strikePoints,
      detections,
    };
  }

  /** A content auto-hide is an appealable automatic decision too. */
  async recordContentHide(input: {
    userId: string;
    targetType: ReportTargetType;
    targetId: string;
    score: number;
    threshold: number;
  }): Promise<void> {
    try {
      const factor = await this.settings.number(
        'moderation.auto.borderline_factor',
      );
      const row = await this.prisma.moderationAutoAction.create({
        data: {
          kind: 'content_hide',
          user_id: input.userId,
          target_type: input.targetType,
          target_id: input.targetId,
          score: input.score,
          threshold: input.threshold,
          borderline: input.score < input.threshold * factor,
          reason: 'Hidden automatically after reports from several people.',
        },
      });
      await this.notifications.emit({
        type: 'moderation_notice',
        recipientId: input.userId,
        payload: {
          action: 'auto_content_hide',
          targetType: input.targetType,
          targetId: input.targetId,
          autoActionId: row.id,
          reason: row.reason,
          canAppeal: true,
        },
      });
      await this.evaluateAccount(input.userId);
    } catch (e) {
      this.logger.error(`auto action record failed: ${String(e)}`);
    }
  }

  /** Re-scores an account and applies the step it reaches (best effort). */
  async evaluateAccount(userId: string): Promise<AutoKind | null> {
    try {
      const mode = toMode(
        await this.settings.string('moderation.auto.account_mode'),
      );
      if (mode === 'off') return null;
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          status: true,
          role: true,
          attorney_profile: { select: { verification_status: true } },
        },
      });
      if (!user || user.status !== 'active') return null;
      const verified =
        user.attorney_profile?.verification_status === 'verified';
      const base = await this.thresholds();
      const score = await this.accountScore(userId);
      const vaAction = await this.settings.string(
        'moderation.auto.verified_attorney_action',
      );
      const mult = await this.settings.number(
        'moderation.auto.verified_attorney_multiplier',
      );
      if (verified && vaAction !== 'higher_bar') {
        // Priority human review instead of any automatic account action.
        if (accountLevel(score.total, base)) {
          await this.queueReview(userId, score.total, base.limitAt);
        }
        return null;
      }
      const t: AutoThresholds = verified
        ? {
            limitAt: base.limitAt * mult,
            tempAt: base.tempAt * mult,
            suspendAt: base.suspendAt * mult,
          }
        : base;
      let kind = accountLevel(score.total, t);
      if (!kind) return null;
      if (kind === 'account_suspend' && user.role === 'attorney') {
        // Permanent suspension of an attorney (verification, bids, billing)
        // is a human decision: queue it.
        await this.queueReview(userId, score.total, t.suspendAt);
        kind = 'account_suspend_temp';
        if (t.tempAt <= 0 || score.total < t.tempAt) return null;
      }
      const threshold =
        kind === 'account_suspend'
          ? t.suspendAt
          : kind === 'account_suspend_temp'
            ? t.tempAt
            : t.limitAt;
      const now = new Date();
      // Already at this step or higher (still in force or unreversed)?
      const prior = await this.prisma.moderationAutoAction.findMany({
        where: {
          user_id: userId,
          kind: { in: Object.keys(RANK) },
          reversed_at: null,
          created_at: { gte: new Date(now.getTime() - 30 * DAY_MS) },
          OR: [{ expires_at: null }, { expires_at: { gt: now } }],
        },
        select: { kind: true, enforced: true },
      });
      const enforce = mode === 'enforce';
      if (
        prior.some(
          (p) => (RANK[p.kind] ?? 0) >= RANK[kind] && p.enforced === enforce,
        )
      ) {
        return null;
      }
      const factor = await this.settings.number(
        'moderation.auto.borderline_factor',
      );
      const days =
        kind === 'account_limit'
          ? await this.settings.number('moderation.auto.limit_days')
          : kind === 'account_suspend_temp'
            ? await this.settings.number('moderation.auto.suspend_temp_days')
            : null;
      const until = days ? new Date(now.getTime() + days * DAY_MS) : null;
      const reason =
        kind === 'account_suspend'
          ? 'Your account was suspended automatically: many independent reports and moderation decisions were recorded.'
          : kind === 'account_suspend_temp'
            ? 'Publishing on your account is paused for a few days automatically: many independent reports and moderation decisions were recorded.'
            : 'Your account was limited automatically: several independent reports and moderation decisions were recorded.';
      const row = await this.prisma.moderationAutoAction.create({
        data: {
          kind,
          user_id: userId,
          score: score.total,
          threshold,
          borderline: score.total < threshold * factor,
          enforced: enforce,
          reason,
          expires_at: until,
        },
      });
      if (!enforce) return kind;
      if (kind === 'account_suspend') {
        await this.prisma.user.update({
          where: { id: userId },
          data: { status: 'suspended', suspended_reason: `auto: ${reason}` },
        });
        await this.prisma.session.updateMany({
          where: { user_id: userId, revoked_at: null },
          data: { revoked_at: now, revoked_reason: 'admin_block' },
        });
      } else {
        await this.prisma.userStrike.create({
          data: {
            user_id: userId,
            action_id: row.id,
            points: 0,
            reason,
            restriction: kind === 'account_limit' ? 'limited' : 'suspended',
            restriction_until: until,
            expires_at: until!,
          },
        });
        await this.gate.invalidate(userId);
      }
      await this.notifications.emit({
        type: 'moderation_notice',
        recipientId: userId,
        payload: {
          action: `auto_${kind}`,
          autoActionId: row.id,
          reason,
          canAppeal: true,
          ...(until ? { until: until.toISOString() } : {}),
        },
      });
      return kind;
    } catch (e) {
      this.logger.error(
        `account evaluation failed for ${userId}: ${String(e)}`,
      );
      return null;
    }
  }

  /** A person must look: one open priority-review row per week. */
  private async queueReview(
    userId: string,
    score: number,
    threshold: number,
  ): Promise<void> {
    const recent = await this.prisma.moderationAutoAction.count({
      where: {
        user_id: userId,
        kind: 'review_needed',
        reversed_at: null,
        created_at: { gte: new Date(Date.now() - 7 * DAY_MS) },
      },
    });
    if (recent > 0) return;
    await this.prisma.moderationAutoAction.create({
      data: {
        kind: 'review_needed',
        user_id: userId,
        score,
        threshold,
        enforced: false,
        reason: 'Priority review: the score passed the automatic threshold.',
      },
    });
  }

  // ----- metrics -----

  async metrics(days = 14): Promise<MetricsDto> {
    const since = new Date(Date.now() - days * DAY_MS);
    const [perDay, totals, detections, overdue] = await Promise.all([
      this.prisma.$queryRaw<
        { day: Date; actions: number; appeals: number; overturned: number }[]
      >`
        SELECT date_trunc('day', created_at) AS day,
               count(*) FILTER (WHERE enforced AND kind <> 'review_needed')::INT AS actions,
               count(*) FILTER (WHERE appeal_status IS NOT NULL)::INT AS appeals,
               count(*) FILTER (WHERE appeal_status = 'accepted')::INT AS overturned
        FROM moderation_auto_actions
        WHERE created_at >= ${since}
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<
        {
          actions: number;
          shadow: number;
          appeals: number;
          decided: number;
          overturned: number;
          pending: number;
          review: number;
        }[]
      >`
        SELECT count(*) FILTER (WHERE enforced AND kind <> 'review_needed')::INT AS actions,
               count(*) FILTER (WHERE NOT enforced AND kind <> 'review_needed')::INT AS shadow,
               count(*) FILTER (WHERE appeal_status IS NOT NULL)::INT AS appeals,
               count(*) FILTER (WHERE appeal_status IN ('accepted', 'rejected'))::INT AS decided,
               count(*) FILTER (WHERE appeal_status = 'accepted')::INT AS overturned,
               count(*) FILTER (WHERE appeal_status = 'pending')::INT AS pending,
               count(*) FILTER (WHERE kind = 'review_needed' AND reversed_at IS NULL)::INT AS review
        FROM moderation_auto_actions WHERE created_at >= ${since}`,
      this.prisma.$queryRaw<{ mode: string; n: number; acted: number }[]>`
        SELECT mode, count(*)::INT AS n, count(*) FILTER (WHERE acted)::INT AS acted
        FROM moderation_detections WHERE created_at >= ${since} GROUP BY mode`,
      this.overdueCount(),
    ]);
    const t = totals[0] ?? {
      actions: 0,
      shadow: 0,
      appeals: 0,
      decided: 0,
      overturned: 0,
      pending: 0,
      review: 0,
    };
    const [alarmPct, alarmMin] = await Promise.all([
      this.settings.number('moderation.auto.alarm_overturn_percent'),
      this.settings.number('moderation.auto.alarm_min_appeals'),
    ]);
    const overturnRate = t.decided > 0 ? t.overturned / t.decided : 0;
    return {
      days,
      perDay: perDay.map((d) => ({
        day: d.day.toISOString().slice(0, 10),
        actions: d.actions,
        appeals: d.appeals,
        overturned: d.overturned,
      })),
      autoActions: t.actions,
      shadowActions: t.shadow,
      appeals: t.appeals,
      decidedAppeals: t.decided,
      overturned: t.overturned,
      pendingAppeals: t.pending,
      overdueAppeals: overdue,
      priorityReviews: t.review,
      appealRate: t.actions > 0 ? t.appeals / t.actions : 0,
      overturnRate,
      alarm: t.decided >= alarmMin && overturnRate * 100 >= alarmPct,
      alarmPercent: alarmPct,
      detections: detections.map((d) => ({
        mode: d.mode,
        count: d.n,
        acted: d.acted,
      })),
    };
  }

  async overdueCount(): Promise<number> {
    const hours = await this.settings.number(
      'moderation.auto.appeal_sla_hours',
    );
    return this.prisma.moderationAutoAction.count({
      where: {
        appeal_status: 'pending',
        appeal_at: { lt: new Date(Date.now() - hours * 3600 * 1000) },
      },
    });
  }
}

export interface MetricsDto {
  days: number;
  perDay: {
    day: string;
    actions: number;
    appeals: number;
    overturned: number;
  }[];
  autoActions: number;
  shadowActions: number;
  appeals: number;
  decidedAppeals: number;
  overturned: number;
  pendingAppeals: number;
  overdueAppeals: number;
  priorityReviews: number;
  appealRate: number;
  overturnRate: number;
  alarm: boolean;
  alarmPercent: number;
  detections: { mode: string; count: number; acted: number }[];
}
