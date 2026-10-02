import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Referral } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import type {
  AdminReferralRowDto,
  AdminReferralsQueryDto,
  AdminReferralStatsDto,
  ReferralSettingsDto,
  ReferralStatus,
} from './referrals.dto';
import { ReferralsService } from './referrals.service';
import {
  REFERRAL_SETTINGS_KEY,
  snapshotOf,
  validateReward,
  type ReferralProgramSettings,
} from './referrals.settings';

const PAGE = 50;

export const REFERRAL_AUDIT = {
  settings: 'referrals.settings',
  qualify: 'referrals.qualify',
  reward: 'referrals.reward',
  reject: 'referrals.reject',
} as const;

type Page<T> = { items: T[]; nextCursor: string | null };

function invalidState(message: string): ConflictException {
  return new ConflictException({
    code: ErrorCode.REFERRAL_INVALID_STATE,
    message,
  });
}

/** Owner 2026-10-02: the admin side of the referral program. */
@Injectable()
export class AdminReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly referrals: ReferralsService,
    private readonly audit: AuditLogService,
  ) {}

  getSettings(): Promise<ReferralProgramSettings> {
    return this.referrals.settings();
  }

  async updateSettings(
    admin: AdminActor,
    dto: ReferralSettingsDto,
  ): Promise<ReferralProgramSettings> {
    const next: ReferralProgramSettings = {
      enabled: dto.enabled,
      attorneyReferrerReward: { ...dto.attorneyReferrerReward },
      attorneyRefereeReward: { ...dto.attorneyRefereeReward },
      clientReferrerReward: { ...dto.clientReferrerReward },
      clientRefereeReward: { ...dto.clientRefereeReward },
      applyWindowDays: dto.applyWindowDays,
    };
    const checks: [keyof ReferralProgramSettings, string | null][] = [
      [
        'attorneyReferrerReward',
        validateReward('referrer', 'attorney', next.attorneyReferrerReward),
      ],
      [
        'attorneyRefereeReward',
        validateReward('referee', 'attorney', next.attorneyRefereeReward),
      ],
      [
        'clientReferrerReward',
        validateReward('referrer', 'client', next.clientReferrerReward),
      ],
      [
        'clientRefereeReward',
        validateReward('referee', 'client', next.clientRefereeReward),
      ],
    ];
    const failed = checks.find(([, err]) => err);
    if (failed) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: failed[1],
        details: { field: failed[0] },
      });
    }
    const value = next as unknown as Prisma.InputJsonValue;
    await withTxRetry(this.prisma, async (tx) => {
      const before = await tx.appConfig.findUnique({
        where: { key: REFERRAL_SETTINGS_KEY },
      });
      await tx.appConfig.upsert({
        where: { key: REFERRAL_SETTINGS_KEY },
        create: { key: REFERRAL_SETTINGS_KEY, value },
        update: { value },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: REFERRAL_AUDIT.settings,
          targetType: 'app_config',
          targetId: null,
          before: before?.value ?? null,
          after: value,
          ip: admin.ip,
        },
        tx,
      );
    });
    return next;
  }

  async list(q: AdminReferralsQueryDto): Promise<Page<AdminReferralRowDto>> {
    const cursor = q.cursor ? decodeCursor(q.cursor) : undefined;
    const rows = await this.prisma.referral.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.role ? { referee_role: q.role } : {}),
        ...(q.referrerId ? { referrer_id: q.referrerId } : {}),
        ...(q.refereeId ? { referee_id: q.refereeId } : {}),
        ...(cursor
          ? {
              OR: [
                { created_at: { lt: cursor.createdAt } },
                { created_at: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
    });
    const page = rows.slice(0, PAGE);
    const items = await this.present(page);
    const last = page[page.length - 1];
    return {
      items,
      nextCursor:
        rows.length > PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async stats(): Promise<AdminReferralStatsDto> {
    const [byStatus, byRole, sums] = await Promise.all([
      this.prisma.referral.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.referral.groupBy({
        by: ['referee_role'],
        _count: { _all: true },
      }),
      // Issued rewards live in the JSON snapshots (issuedAt set).
      this.prisma.$queryRaw<{ balance: bigint | null; days: bigint | null }[]>`
        SELECT
          COALESCE(SUM(CASE WHEN referrer_reward->>'type' = 'balance_cents'
            AND referrer_reward->>'issuedAt' IS NOT NULL
            THEN (referrer_reward->>'value')::INT8 ELSE 0 END), 0)
          + COALESCE(SUM(CASE WHEN referee_reward->>'type' = 'balance_cents'
            AND referee_reward->>'issuedAt' IS NOT NULL
            THEN (referee_reward->>'value')::INT8 ELSE 0 END), 0) AS balance,
          COALESCE(SUM(CASE WHEN referrer_reward->>'type' = 'promotion_days'
            AND referrer_reward->>'issuedAt' IS NOT NULL
            THEN (referrer_reward->>'value')::INT8 ELSE 0 END), 0)
          + COALESCE(SUM(CASE WHEN referee_reward->>'type' = 'promotion_days'
            AND referee_reward->>'issuedAt' IS NOT NULL
            THEN (referee_reward->>'value')::INT8 ELSE 0 END), 0) AS days
        FROM referrals WHERE status <> 'rejected'`,
    ]);
    const used = await this.daysUsed();
    return {
      total: byStatus.reduce((s, r) => s + r._count._all, 0),
      byStatus: byStatus.map((r) => ({ key: r.status, count: r._count._all })),
      byRole: byRole.map((r) => ({
        key: r.referee_role,
        count: r._count._all,
      })),
      balanceCentsIssued: Number(sums[0]?.balance ?? 0),
      promotionDaysIssued: Number(sums[0]?.days ?? 0),
      promotionDaysUsed: used,
    };
  }

  /** pending → qualified, then the rewards are issued where possible. */
  async qualify(
    admin: AdminActor,
    id: string,
    reason: string,
  ): Promise<AdminReferralRowDto> {
    const before = await this.mustFind(id);
    if (before.status !== 'pending') {
      throw invalidState('Only a pending referral can be qualified.');
    }
    await this.referrals.qualify(id);
    const after = (await this.referrals.tryReward(id)) ?? before;
    await this.record(admin, REFERRAL_AUDIT.qualify, before, after, reason);
    return (await this.present([after]))[0];
  }

  /** Retries issuing the rewards of a qualified referral. */
  async reward(
    admin: AdminActor,
    id: string,
    reason: string,
  ): Promise<AdminReferralRowDto> {
    const before = await this.mustFind(id);
    if (before.status !== 'qualified') {
      throw invalidState(
        before.status === 'pending'
          ? 'Qualify the referral first.'
          : 'Only a qualified referral can be rewarded.',
      );
    }
    const after = (await this.referrals.tryReward(id)) ?? before;
    await this.record(admin, REFERRAL_AUDIT.reward, before, after, reason);
    if (after.status !== 'rewarded') {
      throw invalidState(
        'The credit could not be issued: the attorney has no Stripe customer yet (it is issued automatically on their first payment) or Stripe refused it.',
      );
    }
    return (await this.present([after]))[0];
  }

  async reject(
    admin: AdminActor,
    id: string,
    reason: string,
  ): Promise<AdminReferralRowDto> {
    const before = await this.mustFind(id);
    if (before.status !== 'pending' && before.status !== 'qualified') {
      throw invalidState(
        'Only a pending or qualified referral can be rejected.',
      );
    }
    const after = await withTxRetry(this.prisma, async (tx) => {
      const res = await tx.referral.updateMany({
        where: { id, status: { in: ['pending', 'qualified'] } },
        data: { status: 'rejected', rejected_reason: reason },
      });
      if (res.count === 0)
        throw invalidState('The referral changed meanwhile.');
      const row = await tx.referral.findUniqueOrThrow({ where: { id } });
      await this.record(admin, REFERRAL_AUDIT.reject, before, row, reason, tx);
      return row;
    });
    return (await this.present([after]))[0];
  }

  // ---- helpers ------------------------------------------------------------

  private async daysUsed(): Promise<number> {
    const rows = await this.prisma.referral.findMany({
      where: { status: { not: 'rejected' } },
      select: { referrer_reward: true, referee_reward: true },
      take: 10_000,
    });
    let used = 0;
    for (const r of rows) {
      for (const raw of [r.referrer_reward, r.referee_reward]) {
        const s = snapshotOf(raw);
        if (s?.uses) used += Object.values(s.uses).reduce((a, b) => a + b, 0);
      }
    }
    return used;
  }

  private async mustFind(id: string): Promise<Referral> {
    const row = await this.prisma.referral.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Referral not found.',
      });
    }
    return row;
  }

  private async record(
    admin: AdminActor,
    action: string,
    before: Referral,
    after: Referral,
    reason: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const view = (r: Referral) =>
      ({
        status: r.status,
        referrerReward: r.referrer_reward,
        refereeReward: r.referee_reward,
      }) as Prisma.InputJsonObject;
    await this.audit.record(
      {
        adminId: admin.id,
        action,
        targetType: 'referral',
        targetId: before.id,
        before: view(before),
        after: { ...view(after), reason },
        ip: admin.ip,
      },
      tx,
    );
  }

  private async present(rows: Referral[]): Promise<AdminReferralRowDto[]> {
    const ids = [
      ...new Set(rows.flatMap((r) => [r.referrer_id, r.referee_id])),
    ];
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            role: true,
          },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    const user = (id: string) => {
      const u = byId.get(id);
      const name = u
        ? [u.first_name, u.last_name].filter(Boolean).join(' ') || null
        : null;
      return {
        id,
        name,
        email: u?.email ?? null,
        role: u?.role ?? null,
      };
    };
    return rows.map((r) => {
      const rr = snapshotOf(r.referrer_reward);
      const re = snapshotOf(r.referee_reward);
      return {
        id: r.id,
        code: r.code,
        status: r.status as ReferralStatus,
        referrer: user(r.referrer_id),
        referee: user(r.referee_id),
        referrerRole: r.referrer_role,
        refereeRole: r.referee_role,
        referrerReward: rr
          ? { type: rr.type, value: rr.value }
          : { type: 'promotion_days', value: 0 },
        refereeReward: re
          ? { type: re.type, value: re.value }
          : { type: 'promotion_days', value: 0 },
        referrerRewardIssued: !!rr?.issuedAt,
        refereeRewardIssued: !!re?.issuedAt,
        qualifiedAt: r.qualified_at?.toISOString() ?? null,
        rewardedAt: r.rewarded_at?.toISOString() ?? null,
        rejectedReason: r.rejected_reason,
        createdAt: r.created_at.toISOString(),
      };
    });
  }
}
