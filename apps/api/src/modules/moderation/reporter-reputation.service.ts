import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { NotificationsService } from '../notifications/notifications.service';
import {
  computeReportWeights,
  type ReporterFacts,
  type WeightConfig,
  type WeightResult,
} from './report-weight';

const DAY_MS = 24 * 3600 * 1000;
const HISTORY_MAX = 20;

export interface ReporterHistoryEntry {
  at: string;
  kind: 'warning' | 'suspended' | 'cleared' | 'appeal_accepted' | 'manual';
  reason: string;
}

export interface ReportingStatusDto {
  warnings: number;
  suspendedUntil: string | null;
  canAppeal: boolean;
  appealStatus: 'pending' | 'accepted' | 'rejected' | null;
  appealNote: string | null;
}

export interface ReporterRowDto {
  userId: string;
  name: string | null;
  accountCreatedAt: string;
  verifiedAttorney: boolean;
  total: number;
  upheld: number;
  rejected: number;
  pending: number;
  warnings: number;
  suspendedUntil: string | null;
  suspensions: number;
  appealStatus: 'pending' | 'accepted' | 'rejected' | null;
  appealMessage: string | null;
  lastReason: string | null;
  history: ReporterHistoryEntry[];
}

/**
 * Owner 2026-10-27: everything about the people who report.
 *  - `weigh`: the weight of each reporter for the auto-hide score;
 *  - the unfounded-reports ladder (DSA Art. 23 style): enough dismissed
 *    reports → a warning; the same again after it → report processing
 *    from that person is paused for a while. Every step is logged on the
 *    reporter's row, shown to admins, told to the person, and can be
 *    appealed. The whole ladder has an OFF switch in the settings.
 */
@Injectable()
export class ReporterReputationService {
  private readonly logger = new Logger(ReporterReputationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly audit: AuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  // ----- weights -----

  async weightConfig(): Promise<WeightConfig> {
    const s = this.settings;
    const [
      newAccountDays,
      newAccount,
      unverifiedContact,
      verifiedReporter,
      accuracyMinReports,
      clusterBySource,
      burstWindowHours,
      burstMinAccounts,
      burst,
    ] = await Promise.all([
      s.number('moderation.weight.new_account_days'),
      s.number('moderation.weight.new_account'),
      s.number('moderation.weight.unverified_contact'),
      s.number('moderation.weight.verified_reporter'),
      s.number('moderation.weight.accuracy_min_reports'),
      s.boolean('moderation.weight.cluster_by_source'),
      s.number('moderation.weight.burst_window_hours'),
      s.number('moderation.weight.burst_min_accounts'),
      s.number('moderation.weight.burst'),
    ]);
    return {
      newAccountDays,
      newAccount,
      unverifiedContact,
      verifiedReporter,
      accuracyMinReports,
      clusterBySource,
      burstWindowHours,
      burstMinAccounts,
      burst,
    };
  }

  /** Weights of [reporterIds] reporting content of [authorId]. */
  async weigh(
    reporterIds: string[],
    authorId: string | null,
  ): Promise<WeightResult> {
    const now = new Date();
    const cfg = await this.weightConfig();
    const lookbackDays = await this.settings.number(
      'moderation.weight.source_lookback_days',
    );
    const ids = [...new Set(reporterIds)];
    const all = authorId ? [...ids, authorId] : ids;
    const since = new Date(now.getTime() - lookbackDays * DAY_MS);
    const [users, accuracy, sessions, standings] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          created_at: true,
          phone_verified_at: true,
          email_verified_at: true,
          attorney_profile: { select: { verification_status: true } },
        },
      }),
      this.prisma.$queryRaw<
        { reporter_id: string; upheld: number; rejected: number }[]
      >`
        SELECT reporter_id,
               count(*) FILTER (WHERE status = 'actioned')::INT AS upheld,
               count(*) FILTER (WHERE status = 'dismissed')::INT AS rejected
        FROM (
          SELECT reporter_id, status,
                 row_number() OVER (PARTITION BY reporter_id ORDER BY handled_at DESC) AS rn
          FROM reports
          WHERE reporter_id = ANY(${ids}::UUID[])
            AND status IN ('actioned', 'dismissed')
        ) r
        WHERE rn <= 100
        GROUP BY reporter_id`,
      this.prisma.session.findMany({
        where: { user_id: { in: all }, created_at: { gte: since } },
        select: { user_id: true, ip: true, device_id: true },
        take: 2000,
      }),
      this.prisma.reporterStanding.findMany({
        where: { user_id: { in: ids }, suspended_until: { gt: now } },
        select: { user_id: true },
      }),
    ]);
    const sourcesOf = (uid: string): string[] => {
      const out = new Set<string>();
      for (const s of sessions) {
        if (s.user_id !== uid) continue;
        if (s.ip) out.add(`ip:${s.ip}`);
        if (s.device_id) out.add(`dev:${s.device_id}`);
      }
      return [...out];
    };
    const paused = new Set(standings.map((x) => x.user_id));
    const acc = new Map(accuracy.map((a) => [a.reporter_id, a]));
    const facts: ReporterFacts[] = users.map((u) => ({
      id: u.id,
      createdAt: u.created_at,
      contactVerified: !!(u.phone_verified_at || u.email_verified_at),
      verifiedAttorney: u.attorney_profile?.verification_status === 'verified',
      upheld: acc.get(u.id)?.upheld ?? 0,
      rejected: acc.get(u.id)?.rejected ?? 0,
      paused: paused.has(u.id),
      sources: sourcesOf(u.id),
    }));
    return computeReportWeights(
      facts,
      authorId ? sourcesOf(authorId) : [],
      now,
      cfg,
    );
  }

  // ----- the reporter's side -----

  /** Throws 403 REPORTING_SUSPENDED while the person's reports are paused. */
  async assertCanReport(userId: string): Promise<void> {
    const st = await this.prisma.reporterStanding.findUnique({
      where: { user_id: userId },
      select: { suspended_until: true },
    });
    if (st?.suspended_until && st.suspended_until > new Date()) {
      throw new ForbiddenException({
        code: ErrorCode.REPORTING_SUSPENDED,
        message:
          'Reports from this account are paused because earlier reports were found unfounded. You can appeal.',
        details: { until: st.suspended_until.toISOString() },
      });
    }
  }

  async status(userId: string): Promise<ReportingStatusDto> {
    const st = await this.prisma.reporterStanding.findUnique({
      where: { user_id: userId },
    });
    const now = new Date();
    const active =
      st?.suspended_until && st.suspended_until > now
        ? st.suspended_until
        : null;
    return {
      warnings: st?.warnings ?? 0,
      suspendedUntil: active?.toISOString() ?? null,
      canAppeal:
        !!st &&
        (active !== null || st.warnings > 0) &&
        st.appeal_status !== 'pending',
      appealStatus: st?.appeal_status ?? null,
      appealNote: st?.appeal_note ?? null,
    };
  }

  async appeal(userId: string, message: string): Promise<ReportingStatusDto> {
    const st = await this.prisma.reporterStanding.findUnique({
      where: { user_id: userId },
    });
    const now = new Date();
    const restricted =
      !!st &&
      ((st.suspended_until && st.suspended_until > now) || st.warnings > 0);
    if (!st || !restricted || st.appeal_status === 'pending') {
      throw new ConflictException({
        code: ErrorCode.APPEAL_NOT_ALLOWED,
        message: 'There is nothing to appeal, or an appeal is already waiting.',
      });
    }
    const claimed = await this.prisma.reporterStanding.updateMany({
      where: {
        user_id: userId,
        OR: [{ appeal_status: null }, { appeal_status: { not: 'pending' } }],
      },
      data: {
        appeal_message: message,
        appeal_status: 'pending',
        appeal_at: now,
        appeal_decided_by: null,
        appeal_decided_at: null,
        appeal_note: null,
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException({
        code: ErrorCode.APPEAL_NOT_ALLOWED,
        message: 'An appeal is already waiting.',
      });
    }
    return this.status(userId);
  }

  // ----- the ladder -----

  /**
   * Called after moderators decide reports: re-checks each reporter whose
   * report was dismissed. Best effort, never breaks the moderation action.
   */
  async onReportsDecided(reporterIds: string[]): Promise<void> {
    try {
      if (!(await this.settings.boolean('moderation.report_abuse.enabled'))) {
        return;
      }
      for (const id of new Set(reporterIds)) await this.evaluate(id);
    } catch (e) {
      this.logger.error(`reporter check failed: ${String(e)}`);
    }
  }

  private async evaluate(userId: string): Promise<void> {
    const s = this.settings;
    const [windowDays, minReports, percent, repeat, suspendDays] =
      await Promise.all([
        s.number('moderation.report_abuse.window_days'),
        s.number('moderation.report_abuse.min_reports'),
        s.number('moderation.report_abuse.unfounded_percent'),
        s.number('moderation.report_abuse.repeat_after_warning'),
        s.number('moderation.report_abuse.suspend_days'),
      ]);
    const now = new Date();
    const st = await this.prisma.reporterStanding.findUnique({
      where: { user_id: userId },
    });
    if (st?.suspended_until && st.suspended_until > now) return;
    const history = (st?.history as unknown as ReporterHistoryEntry[]) ?? [];
    const lastEvent = history.length
      ? new Date(history[history.length - 1].at)
      : null;
    const windowStart = new Date(now.getTime() - windowDays * DAY_MS);
    const since =
      lastEvent && lastEvent > windowStart ? lastEvent : windowStart;
    const warned = (st?.warnings ?? 0) > 0;
    const need = warned ? repeat : minReports;
    const rows = await this.prisma.report.groupBy({
      by: ['status'],
      where: {
        reporter_id: userId,
        status: { in: ['actioned', 'dismissed'] },
        handled_at: { gte: since },
      },
      _count: { _all: true },
    });
    const dismissed =
      rows.find((r) => r.status === 'dismissed')?._count._all ?? 0;
    const decided = rows.reduce((n, r) => n + r._count._all, 0);
    if (decided < need || dismissed * 100 < percent * decided) return;
    const reason = `${dismissed} of ${decided} recent reports were found unfounded.`;
    if (!warned) {
      await this.push(userId, st, {
        warnings: 1,
        warned_at: now,
        last_reason: reason,
        entry: { at: now.toISOString(), kind: 'warning', reason },
      });
      await this.tell(userId, 'reporter_warning', reason);
    } else {
      const n = st?.suspensions ?? 0;
      const days = suspendDays * Math.min(n + 1, 4);
      const until = new Date(now.getTime() + days * DAY_MS);
      await this.push(userId, st, {
        suspended_until: until,
        suspensions: n + 1,
        last_reason: reason,
        entry: {
          at: now.toISOString(),
          kind: 'suspended',
          reason: `${reason} Paused for ${days} days.`,
        },
      });
      await this.tell(userId, 'reporter_suspended', reason, until);
    }
  }

  private async push(
    userId: string,
    st: { history: Prisma.JsonValue } | null,
    change: {
      warnings?: number;
      warned_at?: Date;
      suspended_until?: Date | null;
      suspensions?: number;
      last_reason: string;
      entry: ReporterHistoryEntry;
    },
  ): Promise<void> {
    const prev = (
      (st?.history as unknown as ReporterHistoryEntry[]) ?? []
    ).slice(-(HISTORY_MAX - 1));
    const { entry, ...fields } = change;
    const history = [...prev, entry] as unknown as Prisma.InputJsonValue;
    await this.prisma.reporterStanding.upsert({
      where: { user_id: userId },
      create: { user_id: userId, ...fields, history },
      update: { ...fields, history },
    });
  }

  private async tell(
    userId: string,
    action: string,
    reason: string,
    until?: Date,
  ): Promise<void> {
    await this.notifications.emit({
      type: 'moderation_notice',
      recipientId: userId,
      payload: {
        action,
        reason,
        ...(until ? { until: until.toISOString() } : {}),
      },
    });
  }

  // ----- the admin's side -----

  /** Reporters ordered by how many of their reports were dismissed. */
  async list(
    q: { onlyRestricted?: boolean; appeals?: boolean; limit?: number },
    countries: string[] | null | undefined,
  ): Promise<ReporterRowDto[]> {
    const limit = Math.min(q.limit ?? 50, 100);
    const rows = await this.prisma.$queryRaw<
      {
        reporter_id: string;
        total: number;
        upheld: number;
        rejected: number;
        pending: number;
      }[]
    >`
      SELECT r.reporter_id,
             count(*)::INT AS total,
             count(*) FILTER (WHERE r.status = 'actioned')::INT AS upheld,
             count(*) FILTER (WHERE r.status = 'dismissed')::INT AS rejected,
             count(*) FILTER (WHERE r.status = 'open')::INT AS pending
      FROM reports r
      WHERE r.created_at >= now() - interval '180 days'
        ${
          countries
            ? Prisma.sql`AND r.reporter_id IN (SELECT id FROM users WHERE country_code::TEXT = ANY(${countries}::TEXT[]))`
            : Prisma.empty
        }
        ${
          q.onlyRestricted
            ? Prisma.sql`AND r.reporter_id IN (SELECT user_id FROM reporter_standings WHERE warnings > 0 OR suspended_until > now())`
            : Prisma.empty
        }
        ${
          q.appeals
            ? Prisma.sql`AND r.reporter_id IN (SELECT user_id FROM reporter_standings WHERE appeal_status = 'pending')`
            : Prisma.empty
        }
      GROUP BY r.reporter_id
      ORDER BY count(*) FILTER (WHERE r.status = 'dismissed') DESC, count(*) DESC
      LIMIT ${limit}`;
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.reporter_id);
    const [users, standings] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          created_at: true,
          attorney_profile: { select: { verification_status: true } },
        },
      }),
      this.prisma.reporterStanding.findMany({
        where: { user_id: { in: ids } },
      }),
    ]);
    const u = new Map(users.map((x) => [x.id, x]));
    const st = new Map(standings.map((x) => [x.user_id, x]));
    return rows.map((r) => {
      const user = u.get(r.reporter_id);
      const s = st.get(r.reporter_id);
      return {
        userId: r.reporter_id,
        name:
          [user?.first_name, user?.last_name].filter(Boolean).join(' ') || null,
        accountCreatedAt: (user?.created_at ?? new Date(0)).toISOString(),
        verifiedAttorney:
          user?.attorney_profile?.verification_status === 'verified',
        total: r.total,
        upheld: r.upheld,
        rejected: r.rejected,
        pending: r.pending,
        warnings: s?.warnings ?? 0,
        suspendedUntil: s?.suspended_until?.toISOString() ?? null,
        suspensions: s?.suspensions ?? 0,
        appealStatus: s?.appeal_status ?? null,
        appealMessage: s?.appeal_message ?? null,
        lastReason: s?.last_reason ?? null,
        history: (
          (s?.history as unknown as ReporterHistoryEntry[]) ?? []
        ).slice(-5),
      };
    });
  }

  /** Lift the pause and the warnings (a mistake, or after an appeal). */
  async clear(admin: AdminActor, userId: string, note: string): Promise<void> {
    const st = await this.requireStanding(userId);
    const now = new Date();
    await this.push(userId, st, {
      warnings: 0,
      suspended_until: null,
      last_reason: note,
      entry: { at: now.toISOString(), kind: 'cleared', reason: note },
    });
    await this.audit.record({
      adminId: admin.id,
      action: 'moderation.reporter_cleared',
      targetType: 'user',
      targetId: userId,
      before: {
        warnings: st.warnings,
        suspendedUntil: st.suspended_until?.toISOString() ?? null,
      },
      after: { note },
      ip: admin.ip,
    });
  }

  /** A moderator pauses a clear abuser's reports by hand. */
  async restrict(
    admin: AdminActor,
    userId: string,
    days: number,
    note: string,
  ): Promise<void> {
    const exists = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!exists) throw this.notFound();
    const st = await this.prisma.reporterStanding.findUnique({
      where: { user_id: userId },
    });
    const now = new Date();
    const until = new Date(now.getTime() + days * DAY_MS);
    await this.push(userId, st, {
      suspended_until: until,
      suspensions: (st?.suspensions ?? 0) + 1,
      last_reason: note,
      entry: {
        at: now.toISOString(),
        kind: 'manual',
        reason: `${note} Paused for ${days} days.`,
      },
    });
    await this.tell(userId, 'reporter_suspended', note, until);
    await this.audit.record({
      adminId: admin.id,
      action: 'moderation.reporter_restricted',
      targetType: 'user',
      targetId: userId,
      after: { days, note },
      ip: admin.ip,
    });
  }

  async decideAppeal(
    admin: AdminActor,
    userId: string,
    accept: boolean,
    note: string,
  ): Promise<'accepted' | 'rejected'> {
    const st = await this.requireStanding(userId);
    if (st.appeal_status !== 'pending') {
      throw new ConflictException({
        code: ErrorCode.APPEAL_NOT_ALLOWED,
        message: 'There is no waiting appeal.',
      });
    }
    const status = accept ? 'accepted' : 'rejected';
    const now = new Date();
    const claimed = await this.prisma.reporterStanding.updateMany({
      where: { user_id: userId, appeal_status: 'pending' },
      data: {
        appeal_status: status,
        appeal_decided_by: admin.id,
        appeal_decided_at: now,
        appeal_note: note,
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException({
        code: ErrorCode.APPEAL_NOT_ALLOWED,
        message: 'This appeal was already decided.',
      });
    }
    if (accept) {
      await this.push(userId, st, {
        warnings: 0,
        suspended_until: null,
        last_reason: note,
        entry: {
          at: now.toISOString(),
          kind: 'appeal_accepted',
          reason: note,
        },
      });
    }
    await this.audit.record({
      adminId: admin.id,
      action: `moderation.reporter_appeal_${status}`,
      targetType: 'user',
      targetId: userId,
      after: { status, note },
      ip: admin.ip,
    });
    await this.tell(userId, `reporter_appeal_${status}`, note);
    return status;
  }

  private async requireStanding(userId: string) {
    const st = await this.prisma.reporterStanding.findUnique({
      where: { user_id: userId },
    });
    if (!st) throw this.notFound();
    return st;
  }

  private notFound() {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'Reporter not found.',
    });
  }
}
