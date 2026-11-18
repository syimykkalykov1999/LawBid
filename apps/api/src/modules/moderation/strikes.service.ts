import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, ReportTargetType } from '../../generated/prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  StrikeGate,
  type StrikeLevel,
  type StrikeLimit,
} from '../../common/usage-limits/strike-gate.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { NotificationsService } from '../notifications/notifications.service';

const DAY_MS = 24 * 3600 * 1000;
const LEVEL_RANK: Record<StrikeLevel, number> = {
  none: 0,
  cooldown: 1,
  limited: 2,
  suspended: 3,
};
const HOUR_MS = 3600 * 1000;

export interface StrikeDto {
  id: string;
  userId: string;
  points: number;
  reason: string | null;
  targetType: ReportTargetType | null;
  targetId: string | null;
  actionId: string | null;
  restriction: StrikeLevel | null;
  restrictionUntil: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedNote: string | null;
  active: boolean;
}

export interface StandingDto {
  enabled: boolean;
  points: number;
  limit: StrikeLimit;
  strikes: StrikeDto[];
}

export interface Thresholds {
  cooldownAt: number;
  limitedAt: number;
  suspendAt: number;
}

/** The highest ladder step [points] reaches (a threshold <= 0 is off). */
export function levelFor(points: number, t: Thresholds): StrikeLevel {
  if (t.suspendAt > 0 && points >= t.suspendAt) return 'suspended';
  if (t.limitedAt > 0 && points >= t.limitedAt) return 'limited';
  if (t.cooldownAt > 0 && points >= t.cooldownAt) return 'cooldown';
  return 'none';
}

/**
 * Owner 2026-10-27: strikes on content owners (YouTube-style ladder). A
 * moderator's `remove` (and, if the admin sets points for it, `hide`)
 * gives the owner a strike. Strikes expire; the live points choose a step:
 * cooldown → limited → suspended (thresholds, durations and the OFF
 * switch are settings). Auto-hides never count: only a human decision does.
 * Appealing the decision (the existing moderation appeal) and winning
 * revokes the strike; an admin can also revoke one by hand. Every step is
 * logged (audit) and told to the owner.
 */
@Injectable()
export class StrikesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly gate: StrikeGate,
    private readonly audit: AuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Inside the moderator's transaction: give [userId] a strike for [action]
   * on [target]. Returns a function to run after the commit (cache drop).
   */
  async issue(
    tx: Prisma.TransactionClient,
    input: {
      admin: AdminActor;
      userId: string;
      actionId: string;
      action: 'hide' | 'remove';
      targetType: ReportTargetType;
      targetId: string;
      reason: string;
    },
  ): Promise<(() => Promise<void>) | null> {
    const s = this.settings;
    if (!(await s.boolean('moderation.strikes.enabled'))) return null;
    const points = await s.number(
      input.action === 'remove'
        ? 'moderation.strikes.points_remove'
        : 'moderation.strikes.points_hide',
    );
    if (points <= 0) return null;
    const now = new Date();
    // One strike per object: a hide followed by a remove is the same case.
    const same = await tx.userStrike.count({
      where: {
        user_id: input.userId,
        target_type: input.targetType,
        target_id: input.targetId,
        revoked_at: null,
        expires_at: { gt: now },
      },
    });
    if (same > 0) return null;
    const [expiryDays, cooldownAt, limitedAt, suspendAt] = await Promise.all([
      s.number('moderation.strikes.expiry_days'),
      s.number('moderation.strikes.cooldown_at'),
      s.number('moderation.strikes.limited_at'),
      s.number('moderation.strikes.suspend_at'),
    ]);
    const live = await tx.userStrike.aggregate({
      where: {
        user_id: input.userId,
        revoked_at: null,
        expires_at: { gt: now },
      },
      _sum: { points: true },
    });
    const total = (live._sum.points ?? 0) + points;
    const level = levelFor(total, { cooldownAt, limitedAt, suspendAt });
    let until: Date | null = null;
    if (level !== 'none') {
      until = new Date(now.getTime() + (await this.duration(level)));
    }
    const strike = await tx.userStrike.create({
      data: {
        user_id: input.userId,
        action_id: input.actionId,
        target_type: input.targetType,
        target_id: input.targetId,
        points,
        reason: input.reason,
        restriction: level === 'none' ? null : level,
        restriction_until: until,
        expires_at: new Date(now.getTime() + expiryDays * DAY_MS),
      },
    });
    await this.audit.record(
      {
        adminId: input.admin.id,
        action: 'moderation.strike_issued',
        targetType: 'user',
        targetId: input.userId,
        after: {
          strikeId: strike.id,
          points,
          totalPoints: total,
          level,
          until: until?.toISOString() ?? null,
        },
        ip: input.admin.ip,
      },
      tx,
    );
    await this.notifications.emit(
      {
        type: 'moderation_notice',
        recipientId: input.userId,
        payload: {
          action: 'strike',
          targetType: input.targetType,
          targetId: input.targetId,
          reason: input.reason,
          points,
          totalPoints: total,
          level,
          ...(until ? { until: until.toISOString() } : {}),
        },
      },
      tx,
    );
    return () => this.gate.invalidate(input.userId);
  }

  /** An accepted appeal of the moderator's decision lifts its strike. */
  async revokeByAction(
    admin: AdminActor | null,
    actionId: string,
    note: string,
  ): Promise<void> {
    const strike = await this.prisma.userStrike.findUnique({
      where: { action_id: actionId },
    });
    if (!strike || strike.revoked_at) return;
    await this.revokeRow(admin, strike.id, strike.user_id, note);
  }

  /** Content restored on appeal: its strike goes with it. */
  async revokeForTarget(
    admin: AdminActor | null,
    userId: string,
    targetType: ReportTargetType,
    targetId: string,
    note: string,
  ): Promise<void> {
    const rows = await this.prisma.userStrike.findMany({
      where: {
        user_id: userId,
        target_type: targetType,
        target_id: targetId,
        revoked_at: null,
      },
      select: { id: true },
    });
    for (const r of rows) await this.revokeRow(admin, r.id, userId, note);
  }

  async revoke(admin: AdminActor, id: string, note: string): Promise<void> {
    const strike = await this.prisma.userStrike.findUnique({ where: { id } });
    if (!strike) throw this.notFound();
    if (strike.revoked_at) return;
    await this.revokeRow(admin, id, strike.user_id, note);
  }

  private async revokeRow(
    admin: AdminActor | null,
    id: string,
    userId: string,
    note: string,
  ): Promise<void> {
    const done = await this.prisma.userStrike.updateMany({
      where: { id, revoked_at: null },
      data: {
        revoked_at: new Date(),
        revoked_by: admin?.id ?? null,
        revoked_note: note,
      },
    });
    if (done.count === 0) return;
    await this.relevel(userId, id);
    await this.gate.invalidate(userId);
    // The audit log needs an admin; the automatic path has none (its
    // decision row is the record).
    if (admin) {
      await this.audit.record({
        adminId: admin.id,
        action: 'moderation.strike_revoked',
        targetType: 'user',
        targetId: userId,
        after: { strikeId: id, note },
        ip: admin.ip,
      });
    }
    await this.notifications.emit({
      type: 'moderation_notice',
      recipientId: userId,
      payload: { action: 'strike_revoked', reason: note },
    });
  }

  /**
   * Verify 18.11 (MO2): the ladder step is stored on the strike that crossed
   * the threshold, so revoking an earlier strike left a step the remaining
   * points no longer reach, and revoking the carrier lifted a step the
   * remaining points still reach. After a revoke the ladder strikes (points
   * > 0; the automatic decisions' 0-point limits are their own) are set to
   * the step their live total reaches, never longer than already decided.
   */
  private async relevel(userId: string, revokedId: string): Promise<void> {
    const s = this.settings;
    const [cooldownAt, limitedAt, suspendAt] = await Promise.all([
      s.number('moderation.strikes.cooldown_at'),
      s.number('moderation.strikes.limited_at'),
      s.number('moderation.strikes.suspend_at'),
    ]);
    const now = new Date();
    const [revoked, live] = await Promise.all([
      this.prisma.userStrike.findUnique({
        where: { id: revokedId },
        select: { restriction: true, restriction_until: true },
      }),
      this.prisma.userStrike.findMany({
        where: {
          user_id: userId,
          revoked_at: null,
          expires_at: { gt: now },
          points: { gt: 0 },
        },
        orderBy: { created_at: 'asc' },
        select: {
          id: true,
          points: true,
          restriction: true,
          restriction_until: true,
        },
      }),
    ]);
    const total = live.reduce((n, r) => n + r.points, 0);
    const level = levelFor(total, { cooldownAt, limitedAt, suspendAt });
    const rank = (l: string | null) =>
      l ? (LEVEL_RANK[l as StrikeLevel] ?? 0) : 0;
    let held = 0;
    for (const r of live) {
      if (!r.restriction || !r.restriction_until) continue;
      if (r.restriction_until <= now) continue;
      if (rank(r.restriction) > LEVEL_RANK[level]) {
        await this.prisma.userStrike.update({
          where: { id: r.id },
          data:
            level === 'none'
              ? { restriction: null, restriction_until: null }
              : { restriction: level },
        });
        held = Math.max(held, LEVEL_RANK[level]);
      } else {
        held = Math.max(held, rank(r.restriction));
      }
    }
    // The revoked strike carried a step the others still reach: it moves to
    // the newest remaining strike with the same end time.
    const carried = revoked?.restriction_until;
    const newest = live[live.length - 1];
    if (
      newest &&
      carried &&
      carried > now &&
      rank(revoked.restriction) > 0 &&
      held < Math.min(rank(revoked.restriction), LEVEL_RANK[level])
    ) {
      const step =
        rank(revoked.restriction) <= LEVEL_RANK[level]
          ? (revoked.restriction as StrikeLevel)
          : level;
      await this.prisma.userStrike.update({
        where: { id: newest.id },
        data: { restriction: step, restriction_until: carried },
      });
    }
  }

  async list(q: { userId?: string; limit?: number }): Promise<StrikeDto[]> {
    const rows = await this.prisma.userStrike.findMany({
      where: q.userId ? { user_id: q.userId } : {},
      orderBy: { created_at: 'desc' },
      take: Math.min(q.limit ?? 50, 100),
    });
    return rows.map((r) => this.dto(r));
  }

  /** What the person sees about their own standing. */
  async standing(userId: string): Promise<StandingDto> {
    const enabled = await this.settings.boolean('moderation.strikes.enabled');
    const rows = await this.prisma.userStrike.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: 20,
    });
    const strikes = rows.map((r) => this.dto(r));
    return {
      enabled,
      points: strikes.filter((x) => x.active).reduce((n, x) => n + x.points, 0),
      limit: await this.gate.limit(userId),
      strikes,
    };
  }

  private async duration(level: StrikeLevel): Promise<number> {
    const s = this.settings;
    if (level === 'cooldown') {
      return (await s.number('moderation.strikes.cooldown_hours')) * HOUR_MS;
    }
    if (level === 'limited') {
      return (await s.number('moderation.strikes.limited_days')) * DAY_MS;
    }
    return (await s.number('moderation.strikes.suspend_days')) * DAY_MS;
  }

  private dto(r: {
    id: string;
    user_id: string;
    points: number;
    reason: string | null;
    target_type: ReportTargetType | null;
    target_id: string | null;
    action_id: string | null;
    restriction: string | null;
    restriction_until: Date | null;
    created_at: Date;
    expires_at: Date;
    revoked_at: Date | null;
    revoked_note: string | null;
  }): StrikeDto {
    return {
      id: r.id,
      userId: r.user_id,
      points: r.points,
      reason: r.reason,
      targetType: r.target_type,
      targetId: r.target_id,
      actionId: r.action_id,
      restriction: r.restriction as StrikeLevel | null,
      restrictionUntil: r.restriction_until?.toISOString() ?? null,
      createdAt: r.created_at.toISOString(),
      expiresAt: r.expires_at.toISOString(),
      revokedAt: r.revoked_at?.toISOString() ?? null,
      revokedNote: r.revoked_note,
      active: !r.revoked_at && r.expires_at > new Date(),
    };
  }

  private notFound() {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'Strike not found.',
    });
  }
}
