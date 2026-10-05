import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, type StaffReward } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { AppSettingsWriter } from '../../common/app-settings/app-settings.writer';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { breachesHeld } from '../support/support-team.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import { parsePermissions } from '../admin-auth/admin-permissions';
import { PayrollAccrualsService } from '../admin-payroll/payroll-accruals.service';
import type { EmailProvider } from '../auth/providers/email/email-provider.interface';
import { EMAIL_PROVIDER } from '../auth/providers/provider.tokens';
import { AppConfigService } from '../feature-flags/services/app-config.service';
import type {
  CreateRewardAwardDto,
  MyRewardsDto,
  RewardAwardDto,
  RewardDepartmentBoardDto,
  RewardLeaderboardDto,
  RewardsSettingsDto,
  UpdateRewardsSettingsDto,
} from './rewards.dto';
import {
  DEPARTMENT_AREA,
  DEPARTMENT_LABEL,
  METRIC_LABEL,
  periodOf,
  periodRange,
  previousPeriod,
  rank,
  REWARD_DEPARTMENTS,
  score,
  type Metrics,
  type RewardDepartment,
  type RewardPeriodKind,
} from './rewards.rules';

/** Not a typed tunable (it is an object): read and written as raw JSON. */
export const REWARDS_DEPARTMENTS_KEY = 'rewards.departments';
const ROWS_CAP = 20_000;

interface DeptConfig {
  enabled: boolean;
  prize: string;
  bonusCents: number;
}
interface Member {
  id: string;
  name: string;
}

/**
 * Owner 2026-10-05 — «Лучший сотрудник»: the owner's switch (off by
 * default: nothing is shown to anyone), per-department leaderboards
 * computed from finished work already on record (no extra tracking),
 * prizes given by hand or automatically at the end of each period, and a
 * bonus that lands in Деньги → Зарплаты as an accrual.
 */
@Injectable()
export class RewardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly writer: AppSettingsWriter,
    private readonly appConfig: AppConfigService,
    private readonly audit: AuditLogService,
    private readonly accruals: PayrollAccrualsService,
    private readonly logger: PinoLogger,
    @Optional() @Inject(EMAIL_PROVIDER) private readonly email?: EmailProvider,
  ) {
    this.logger.setContext(RewardsService.name);
  }

  // --- settings ------------------------------------------------------------

  async getSettings(): Promise<RewardsSettingsDto> {
    const [enabled, autoAward, period, depts] = await Promise.all([
      this.settings.boolean('rewards.enabled'),
      this.settings.boolean('rewards.auto_award'),
      this.periodKind(),
      this.departments(),
    ]);
    return {
      enabled,
      autoAward,
      period,
      departments: REWARD_DEPARTMENTS.map((key) => ({
        key,
        label: DEPARTMENT_LABEL[key],
        ...depts[key],
      })),
    };
  }

  async updateSettings(
    adminId: string,
    dto: UpdateRewardsSettingsDto,
  ): Promise<RewardsSettingsDto> {
    let departments: Prisma.InputJsonObject | undefined;
    if (dto.departments?.length) {
      const current = await this.departments();
      for (const d of dto.departments) {
        current[d.key] = {
          enabled: d.enabled ?? current[d.key].enabled,
          prize: d.prize ?? current[d.key].prize,
          bonusCents: d.bonusCents ?? current[d.key].bonusCents,
        };
      }
      departments = current as unknown as Prisma.InputJsonObject;
    }
    await this.writer.write(adminId, 'rewards.settings.update', {
      'rewards.enabled': dto.enabled,
      'rewards.auto_award': dto.autoAward,
      'rewards.period': dto.period,
      [REWARDS_DEPARTMENTS_KEY]: departments,
    });
    return this.getSettings();
  }

  // --- leaderboard ---------------------------------------------------------

  async leaderboard(period?: string): Promise<RewardLeaderboardDto> {
    await this.assertEnabled();
    const kind = await this.periodKind();
    const p = period ?? periodOf(kind, new Date());
    const { from, to } = periodRange(p);
    const [depts, members, awards] = await Promise.all([
      this.departments(),
      this.members(),
      this.prisma.staffReward.findMany({ where: { period: p } }),
    ]);
    const names = await this.names(awards.map((a) => a.admin_id));
    const boards: RewardDepartmentBoardDto[] = [];
    for (const key of REWARD_DEPARTMENTS) {
      const cfg = depts[key];
      if (!cfg.enabled) continue;
      const team = members[key];
      const metrics = await this.metrics(
        key,
        team.map((m) => m.id),
        from,
        to,
      );
      const ranked = rank(
        team.map((m) => {
          const mm = metrics.get(m.id) ?? {};
          return {
            ...m,
            metrics: mm,
            score: score(key, mm),
            tiebreak: mm.medianMinutes ?? Number.MAX_SAFE_INTEGER,
          };
        }),
      );
      const award = awards
        .filter((a) => a.department === key)
        .sort((a, b) => a.rank - b.rank)[0];
      boards.push({
        key,
        label: DEPARTMENT_LABEL[key],
        prize: cfg.prize,
        bonusCents: cfg.bonusCents,
        members: team.length,
        rows: ranked.map(({ item, rank: r }) => ({
          adminId: item.id,
          name: item.name,
          rank: r,
          score: item.score,
          metrics: Object.entries(item.metrics).map(([k, v]) => ({
            key: k,
            label: METRIC_LABEL[k] ?? k,
            value: v,
          })),
        })),
        award: award ? this.present(award, names) : null,
      });
    }
    return {
      period: p,
      from: from.toISOString(),
      to: to.toISOString(),
      closed: to.getTime() <= Date.now(),
      departments: boards,
    };
  }

  // --- awards --------------------------------------------------------------

  async awards(period?: string): Promise<RewardAwardDto[]> {
    await this.assertEnabled();
    const rows = await this.prisma.staffReward.findMany({
      where: period ? { period } : {},
      orderBy: [{ created_at: 'desc' }],
      take: 200,
    });
    const names = await this.names(rows.map((r) => r.admin_id));
    return rows.map((r) => this.present(r, names));
  }

  async give(
    actorId: string | null,
    dto: CreateRewardAwardDto,
    auto = false,
  ): Promise<RewardAwardDto> {
    await this.assertEnabled();
    const members = await this.members();
    const member = members[dto.department].find((m) => m.id === dto.adminId);
    if (!member) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'This employee is not in that department.',
        details: { field: 'adminId' },
      });
    }
    const cfg = (await this.departments())[dto.department];
    const board = await this.leaderboard(dto.period);
    const row = board.departments
      .find((d) => d.key === dto.department)
      ?.rows.find((r) => r.adminId === dto.adminId);
    const bonus = dto.bonusCents ?? cfg.bonusCents;
    let award: StaffReward;
    try {
      award = await this.prisma.staffReward.create({
        data: {
          period: dto.period,
          department: dto.department,
          admin_id: dto.adminId,
          rank: row?.rank ?? 1,
          score: row?.score ?? 0,
          prize: (dto.prize ?? cfg.prize).slice(0, 200),
          bonus_cents: bonus,
          auto,
          created_by: actorId,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'This employee already has the prize for this period.',
          details: { field: 'adminId' },
        });
      }
      throw e;
    }
    if (bonus > 0) {
      const acc = await this.accruals.accrue({
        userId: dto.adminId,
        name: member.name,
        source: 'rewards',
        kind: 'bonus',
        eventRef: `reward:${award.id}`,
        amountCents: bonus,
        period: dto.period,
        note: `«Лучший сотрудник» · ${DEPARTMENT_LABEL[dto.department]}`,
        roleTitle: 'Сотрудник',
      });
      award = await this.prisma.staffReward.update({
        where: { id: award.id },
        data: { accrual_id: acc.accrualId },
      });
    }
    if (actorId) {
      await this.audit.record({
        adminId: actorId,
        action: 'rewards.award.create',
        targetType: 'admin',
        targetId: dto.adminId,
        after: {
          period: dto.period,
          department: dto.department,
          prize: award.prize,
          bonusCents: bonus,
        },
      });
    }
    void this.congratulate(award, member.name);
    return this.present(award, new Map([[member.id, member.name]]));
  }

  /** Takes a prize back; a bonus already paid stays paid. */
  async revoke(actorId: string, id: string): Promise<void> {
    const award = await this.prisma.staffReward.findUnique({ where: { id } });
    if (!award) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Prize not found.',
      });
    }
    if (award.accrual_id) {
      const r = await this.accruals.cancel(`reward:${id}`, 'prize revoked');
      if (r === 'paid') {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'The bonus is already paid; adjust it in Зарплаты.',
        });
      }
    }
    await this.prisma.staffReward.delete({ where: { id } });
    await this.audit.record({
      adminId: actorId,
      action: 'rewards.award.revoke',
      targetType: 'admin',
      targetId: award.admin_id,
      before: { period: award.period, department: award.department },
    });
  }

  /** Daily: once a period is over, its best employee of each department
   * gets the department prize (when the owner left it automatic). */
  async autoAward(now = new Date()): Promise<number> {
    const [enabled, auto] = await Promise.all([
      this.settings.boolean('rewards.enabled'),
      this.settings.boolean('rewards.auto_award'),
    ]);
    if (!enabled || !auto) return 0;
    const p = previousPeriod(await this.periodKind(), now);
    const board = await this.leaderboard(p);
    let given = 0;
    for (const d of board.departments) {
      if (d.award) continue;
      for (const r of d.rows.filter((x) => x.rank === 1)) {
        try {
          await this.give(
            null,
            { period: p, department: d.key, adminId: r.adminId },
            true,
          );
          given += 1;
        } catch (e) {
          this.logger.warn(
            { err: e, period: p, department: d.key },
            'auto award skipped',
          );
        }
      }
    }
    return given;
  }

  // --- staff view ----------------------------------------------------------

  /** What an employee sees in their workspace (nothing when off). */
  async mine(adminId: string): Promise<MyRewardsDto> {
    if (!(await this.settings.boolean('rewards.enabled'))) {
      return { enabled: false, period: null, ranks: [], awards: [] };
    }
    const [board, members] = await Promise.all([
      this.leaderboard(),
      this.members(),
    ]);
    const ranks = board.departments
      .filter((d) => members[d.key].some((m) => m.id === adminId))
      .map((d) => {
        const me = d.rows.find((r) => r.adminId === adminId);
        return {
          department: d.key,
          label: d.label,
          rank: me?.rank ?? null,
          score: me?.score ?? 0,
          of: d.rows.length,
          prize: d.prize,
          leaderName: d.rows[0]?.name ?? null,
        };
      });
    const mineRows = await this.prisma.staffReward.findMany({
      where: { admin_id: adminId },
      orderBy: { created_at: 'desc' },
      take: 10,
    });
    const names = await this.names([adminId]);
    return {
      enabled: true,
      period: board.period,
      ranks,
      awards: mineRows.map((r) => this.present(r, names)),
    };
  }

  // --- helpers -------------------------------------------------------------

  private async assertEnabled(): Promise<void> {
    if (!(await this.settings.boolean('rewards.enabled'))) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Rewards are switched off.',
      });
    }
  }

  private async periodKind(): Promise<RewardPeriodKind> {
    return (await this.settings.string('rewards.period')) === 'week'
      ? 'week'
      : 'month';
  }

  private async departments(): Promise<Record<RewardDepartment, DeptConfig>> {
    const raw = (await this.appConfig.getConfig())[REWARDS_DEPARTMENTS_KEY];
    const obj =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    const out = {} as Record<RewardDepartment, DeptConfig>;
    for (const key of REWARD_DEPARTMENTS) {
      const v = (obj[key] ?? {}) as Partial<DeptConfig>;
      out[key] = {
        enabled: typeof v.enabled === 'boolean' ? v.enabled : true,
        prize: typeof v.prize === 'string' ? v.prize : '',
        bonusCents:
          typeof v.bonusCents === 'number' && v.bonusCents >= 0
            ? Math.round(v.bonusCents)
            : 0,
      };
    }
    return out;
  }

  /** Active admins (not the owner) holding each department's area. */
  private async members(): Promise<Record<RewardDepartment, Member[]>> {
    const admins = await this.prisma.user.findMany({
      where: { role: 'admin', status: 'active', deleted_at: null },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        admin_profile: { select: { admin_role: true, permissions: true } },
      },
    });
    const out = Object.fromEntries(
      REWARD_DEPARTMENTS.map((k) => [k, [] as Member[]]),
    ) as Record<RewardDepartment, Member[]>;
    for (const a of admins) {
      if (!a.admin_profile || a.admin_profile.admin_role === 'super_admin') {
        continue;
      }
      const perms = parsePermissions(a.admin_profile.permissions) as Record<
        string,
        string
      >;
      for (const key of REWARD_DEPARTMENTS) {
        if (perms[DEPARTMENT_AREA[key]] === 'manage') {
          out[key].push({ id: a.id, name: fullName(a) });
        }
      }
    }
    return out;
  }

  /** Finished work on record in [from, to), per admin. */
  private async metrics(
    dept: RewardDepartment,
    ids: string[],
    from: Date,
    to: Date,
  ): Promise<Map<string, Metrics>> {
    const out = new Map<string, Metrics>(ids.map((id) => [id, {}]));
    if (ids.length === 0) return out;
    const put = (id: string | null, key: string, v: number | null) => {
      const m = id ? out.get(id) : undefined;
      if (m) m[key] = v;
    };
    const range = { gte: from, lt: to };
    switch (dept) {
      case 'verification': {
        const rows = await this.prisma.verificationRequest.findMany({
          where: {
            reviewed_by: { in: ids },
            reviewed_at: range,
            status: { in: ['approved', 'rejected', 'needs_more_info'] },
          },
          select: { reviewed_by: true, reviewed_at: true, submitted_at: true },
          take: ROWS_CAP,
        });
        const waits = new Map<string, number[]>();
        const count = new Map<string, number>();
        for (const r of rows) {
          if (!r.reviewed_by || !r.reviewed_at) continue;
          count.set(r.reviewed_by, (count.get(r.reviewed_by) ?? 0) + 1);
          if (r.submitted_at) {
            const list = waits.get(r.reviewed_by) ?? [];
            list.push(
              (r.reviewed_at.getTime() - r.submitted_at.getTime()) / 60_000,
            );
            waits.set(r.reviewed_by, list);
          }
        }
        for (const id of ids) {
          put(id, 'decisions', count.get(id) ?? 0);
          put(id, 'medianMinutes', median(waits.get(id) ?? []));
        }
        return out;
      }
      case 'moderation': {
        const [reports, actions] = await Promise.all([
          this.prisma.report.groupBy({
            by: ['handled_by'],
            where: { handled_by: { in: ids }, handled_at: range },
            _count: { _all: true },
          }),
          this.prisma.moderationAction.groupBy({
            by: ['admin_id'],
            where: {
              admin_id: { in: ids },
              created_at: range,
              report_id: null,
            },
            _count: { _all: true },
          }),
        ]);
        for (const id of ids) {
          put(id, 'reports', 0);
          put(id, 'actions', 0);
        }
        for (const r of reports) put(r.handled_by, 'reports', r._count._all);
        for (const a of actions) put(a.admin_id, 'actions', a._count._all);
        return out;
      }
      case 'support': {
        const [resolved, firsts, breaches] = await Promise.all([
          this.prisma.supportTicket.groupBy({
            by: ['resolved_by'],
            where: { resolved_by: { in: ids }, resolved_at: range },
            _count: { _all: true },
          }),
          this.prisma.supportTicket.findMany({
            where: {
              first_response_by: { in: ids },
              first_response_at: range,
            },
            select: {
              first_response_by: true,
              first_response_at: true,
              created_at: true,
            },
            take: ROWS_CAP,
          }),
          this.prisma.supportTicket.findMany({
            where: { assignee_id: { in: ids }, sla_breached_at: range },
            select: {
              assignee_id: true,
              assigned_at: true,
              sla_breached_at: true,
            },
            take: ROWS_CAP,
          }),
        ]);
        const waits = new Map<string, number[]>();
        for (const f of firsts) {
          if (!f.first_response_by || !f.first_response_at) continue;
          const list = waits.get(f.first_response_by) ?? [];
          list.push(
            (f.first_response_at.getTime() - f.created_at.getTime()) / 60_000,
          );
          waits.set(f.first_response_by, list);
        }
        for (const id of ids) {
          put(id, 'resolved', 0);
          put(id, 'firstResponses', waits.get(id)?.length ?? 0);
          put(id, 'slaBreaches', 0);
          put(id, 'medianMinutes', median(waits.get(id) ?? []));
        }
        for (const r of resolved) put(r.resolved_by, 'resolved', r._count._all);
        for (const [id, n] of breachesHeld(breaches)) {
          put(id, 'slaBreaches', n);
        }
        return out;
      }
      case 'finance': {
        const [payouts, money] = await Promise.all([
          this.prisma.payrollPayout.groupBy({
            by: ['created_by'],
            where: {
              created_by: { in: ids },
              created_at: range,
              status: { not: 'canceled' },
            },
            _count: { _all: true },
          }),
          this.prisma.auditLog.groupBy({
            by: ['admin_id'],
            where: {
              admin_id: { in: ids },
              created_at: range,
              OR: [
                { action: { startsWith: 'billing.' } },
                { action: { startsWith: 'payroll.' } },
              ],
            },
            _count: { _all: true },
          }),
        ]);
        for (const id of ids) {
          put(id, 'payouts', 0);
          put(id, 'moneyActions', 0);
        }
        for (const p of payouts) put(p.created_by, 'payouts', p._count._all);
        for (const m of money) put(m.admin_id, 'moneyActions', m._count._all);
        return out;
      }
    }
  }

  private async names(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, first_name: true, last_name: true },
    });
    return new Map(rows.map((r) => [r.id, fullName(r)]));
  }

  private present(r: StaffReward, names: Map<string, string>): RewardAwardDto {
    return {
      id: r.id,
      period: r.period,
      department: r.department as RewardDepartment,
      adminId: r.admin_id,
      name: names.get(r.admin_id) ?? '—',
      rank: r.rank,
      score: r.score,
      prize: r.prize,
      bonusCents: r.bonus_cents,
      currency: r.currency,
      onPayroll: !!r.accrual_id,
      auto: r.auto,
      createdAt: r.created_at.toISOString(),
    };
  }

  private async congratulate(award: StaffReward, name: string): Promise<void> {
    if (!this.email) return;
    try {
      const u = await this.prisma.user.findUnique({
        where: { id: award.admin_id },
        select: { email: true },
      });
      if (!u?.email) return;
      const dept = DEPARTMENT_LABEL[award.department as RewardDepartment];
      const prize = award.prize ? ` Приз: ${award.prize}.` : '';
      const bonus =
        award.bonus_cents > 0
          ? ` Бонус $${(award.bonus_cents / 100).toFixed(2)} придёт с ближайшей зарплатой.`
          : '';
      await this.email.sendEmail({
        to: u.email,
        subject: `LawBid: вы — лучший сотрудник (${dept}, ${award.period})`,
        text: `${name}, поздравляем! Вы — лучший сотрудник отдела «${dept}» за ${award.period}.${prize}${bonus}`,
      });
    } catch (e) {
      this.logger.warn({ err: e, awardId: award.id }, 'reward e-mail failed');
    }
  }
}

function fullName(u: {
  first_name: string | null;
  last_name: string | null;
}): string {
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || '—';
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
}
