import { Injectable, NotFoundException } from '@nestjs/common';
import type { ClientFraudProfile, Prisma } from '@prisma/client';
import { AppSettingsWriter } from '../../common/app-settings/app-settings.writer';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { AdminUsersService } from '../admin-users/admin-users.service';
import {
  DEVICE_KINDS,
  FRAUD_AUDIT,
  FRAUD_EVENT,
  FRAUD_STATUS,
  PRESET_VALUES,
  STRONG_KINDS,
  type FpKind,
  type FraudPreset,
  type FraudStatus,
} from './client-fraud.constants';
import type {
  FraudBanDto,
  FraudBanResultDto,
  FraudCardDto,
  FraudEventDto,
  FraudEventsQueryDto,
  FraudQueueItemDto,
  FraudQueueQueryDto,
  FraudRecomputeAllResultDto,
  FraudSettingsDto,
  FraudSignalDto,
  FraudStatsDto,
  FraudUserDto,
} from './client-fraud.dto';
import { ClientFraudService } from './client-fraud.service';

const DAY_MS = 86_400_000;

const SETTING_KEYS = {
  enabled: 'fraud.enabled',
  auto: 'fraud.auto',
  matchAction: 'fraud.match_action',
  deviceAction: 'fraud.device_action',
  reviewScore: 'fraud.review_score',
  restrictScore: 'fraud.restrict_score',
  banScore: 'fraud.ban_score',
  weightFraudReport: 'fraud.weight_fraud_report',
  weightReport: 'fraud.weight_report',
  weightChargeback: 'fraud.weight_chargeback',
  windowDays: 'fraud.window_days',
  notifyStaff: 'fraud.notify_staff',
  fingerprintRetentionDays: 'fraud.fingerprint_retention_days',
  blockedRetentionDays: 'fraud.blocked_retention_days',
} as const satisfies Record<keyof FraudSettingsDto, string>;

type UserRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  status: string;
  email: string | null;
  phone_e164: string | null;
  created_at: Date;
};
const USER_SELECT = {
  id: true,
  first_name: true,
  last_name: true,
  role: true,
  status: true,
  email: true,
  phone_e164: true,
  created_at: true,
} as const;

/**
 * Admin → Галочки → «Борьба с мошенниками» → «Клиенты» (owner
 * 2026-10-05, docs/CLIENT_FRAUD.md): the queue, one account's card with
 * linked accounts and history, staff decisions and the rules. A block
 * goes through Люди (the same suspension with its audit row, sessions
 * ended, cases archived); this service adds the fraud history on top.
 */
@Injectable()
export class AdminClientFraudService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fraud: ClientFraudService,
    private readonly users: AdminUsersService,
    private readonly audit: AuditLogService,
    private readonly writer: AppSettingsWriter,
  ) {}

  // --- settings ------------------------------------------------------------

  async settingsDto(): Promise<FraudSettingsDto> {
    const c = await this.fraud.config();
    return {
      enabled: c.enabled,
      auto: c.auto,
      matchAction: c.matchAction,
      deviceAction: c.deviceAction,
      reviewScore: c.reviewScore,
      restrictScore: c.restrictScore,
      banScore: c.banScore,
      weightFraudReport: c.weightFraudReport,
      weightReport: c.weightReport,
      weightChargeback: c.weightChargeback,
      windowDays: c.windowDays,
      notifyStaff: c.notifyStaff,
      fingerprintRetentionDays: c.fingerprintRetentionDays,
      blockedRetentionDays: c.blockedRetentionDays,
    };
  }

  async updateSettings(
    admin: AdminActor,
    dto: FraudSettingsDto,
  ): Promise<FraudSettingsDto> {
    const values: Record<string, Prisma.InputJsonValue> = {};
    for (const [field, key] of Object.entries(SETTING_KEYS)) {
      values[key] = dto[field as keyof FraudSettingsDto];
    }
    await this.writer.write(admin.id, FRAUD_AUDIT.settings, values);
    return this.settingsDto();
  }

  async preset(
    admin: AdminActor,
    preset: FraudPreset,
  ): Promise<FraudSettingsDto> {
    if (preset === 'off') {
      await this.writer.write(admin.id, FRAUD_AUDIT.preset, {
        'fraud.enabled': false,
      });
    } else {
      const v = PRESET_VALUES[preset];
      await this.writer.write(admin.id, FRAUD_AUDIT.preset, {
        'fraud.enabled': true,
        'fraud.match_action': v.matchAction,
        'fraud.device_action': v.deviceAction,
        'fraud.review_score': v.reviewScore,
        'fraud.restrict_score': v.restrictScore,
        'fraud.ban_score': v.banScore,
      });
    }
    return this.settingsDto();
  }

  // --- reads ---------------------------------------------------------------

  async stats(): Promise<FraudStatsDto> {
    const since = new Date(Date.now() - 30 * DAY_MS);
    const [c, review, restricted, banned, blockedSignIns30d, autoBanned30d] =
      await Promise.all([
        this.fraud.config(),
        this.prisma.clientFraudProfile.count({ where: { status: 'review' } }),
        this.prisma.clientFraudProfile.count({
          where: { status: 'restricted' },
        }),
        this.prisma.clientFraudProfile.count({ where: { status: 'banned' } }),
        this.prisma.clientFraudEvent.count({
          where: {
            kind: FRAUD_EVENT.signInBlocked,
            created_at: { gte: since },
          },
        }),
        this.prisma.clientFraudEvent.count({
          where: {
            kind: { in: [FRAUD_EVENT.autoBanned, FRAUD_EVENT.linkedBanned] },
            created_at: { gte: since },
          },
        }),
      ]);
    return {
      enabled: c.enabled,
      auto: c.auto,
      review,
      restricted,
      banned,
      blockedSignIns30d,
      autoBanned30d,
    };
  }

  async queue(q: FraudQueueQueryDto): Promise<FraudQueueItemDto[]> {
    const status = q.status ?? 'queue';
    const where: Prisma.ClientFraudProfileWhereInput =
      status === 'all'
        ? { status: { not: FRAUD_STATUS.ok } }
        : status === 'queue'
          ? { status: { in: [FRAUD_STATUS.review, FRAUD_STATUS.restricted] } }
          : { status };
    const needle = q.q?.trim();
    if (needle) {
      const users = await this.prisma.user.findMany({
        where: isUuid(needle)
          ? { id: needle }
          : {
              OR: [
                { email: { contains: needle.toLowerCase() } },
                {
                  phone_e164: {
                    contains: needle.replace(/[^\d+]/g, '') || needle,
                  },
                },
                { full_name_lower: { contains: needle.toLowerCase() } },
              ],
            },
        select: { id: true },
        take: 200,
      });
      where.user_id = { in: users.map((u) => u.id) };
    }
    const rows = await this.prisma.clientFraudProfile.findMany({
      where,
      orderBy: [{ score: 'desc' }, { queued_at: 'asc' }],
      take: q.limit ?? 100,
    });
    const users = await this.usersById(rows.map((r) => r.user_id));
    return rows
      .filter((r) => users.has(r.user_id))
      .map((r) => this.item(r, users.get(r.user_id)!));
  }

  async card(userId: string): Promise<FraudCardDto> {
    let row = await this.prisma.clientFraudProfile.findUnique({
      where: { user_id: userId },
    });
    if (!row) {
      await this.fraud.recompute(userId);
      row = await this.prisma.clientFraudProfile.findUnique({
        where: { user_id: userId },
      });
    }
    const user = (await this.usersById([userId])).get(userId);
    if (!user || !row) throw notFound();
    const linked = await this.fraud.linkedAccounts(userId);
    const linkedUsers = await this.usersById(linked.map((l) => l.userId));
    const events = await this.prisma.clientFraudEvent.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    return {
      ...this.item(row, user),
      clearedScore: row.cleared_score,
      clearedAt: row.cleared_at?.toISOString() ?? null,
      linked: linked
        .filter((l) => linkedUsers.has(l.userId))
        .map((l) => ({
          user: presentUser(linkedUsers.get(l.userId)!),
          kinds: l.kinds,
          blocked: l.blocked,
        })),
      events: await this.presentEvents(events),
    };
  }

  async events(q: FraudEventsQueryDto): Promise<FraudEventDto[]> {
    const actor = q.actor ?? 'staff';
    const rows = await this.prisma.clientFraudEvent.findMany({
      where:
        actor === 'all'
          ? {}
          : { actor_type: actor === 'staff' ? 'admin' : 'system' },
      orderBy: { created_at: 'desc' },
      take: q.limit ?? 100,
    });
    return this.presentEvents(rows);
  }

  // --- decisions -----------------------------------------------------------

  /** «Снять»: nothing to see; automatic actions return only when the
   * score grows past today's. A blocked account is restored. */
  async clear(
    admin: AdminActor,
    userId: string,
    note: string | null,
  ): Promise<FraudCardDto> {
    const user = await this.target(userId);
    if (user.status === 'suspended') await this.users.restore(admin, userId);
    await this.fraud.setByStaff(
      userId,
      FRAUD_STATUS.ok,
      admin.id,
      note,
      user.status === 'suspended'
        ? FRAUD_EVENT.staffUnbanned
        : FRAUD_EVENT.staffCleared,
    );
    await this.audit.record({
      adminId: admin.id,
      action: FRAUD_AUDIT.clear,
      targetType: 'user',
      targetId: userId,
      after: { note },
      ip: admin.ip,
    });
    return this.card(userId);
  }

  async restrict(
    admin: AdminActor,
    userId: string,
    note: string,
  ): Promise<FraudCardDto> {
    await this.target(userId);
    await this.fraud.setByStaff(
      userId,
      FRAUD_STATUS.restricted,
      admin.id,
      note,
      FRAUD_EVENT.staffRestricted,
    );
    await this.audit.record({
      adminId: admin.id,
      action: FRAUD_AUDIT.restrict,
      targetType: 'user',
      targetId: userId,
      after: { note },
      ip: admin.ip,
    });
    return this.card(userId);
  }

  /** «Заблокировать» (optionally with every linked account by a strong
   * signal or the same phone). */
  async ban(
    admin: AdminActor,
    userId: string,
    dto: FraudBanDto,
  ): Promise<FraudBanResultDto> {
    const ids = [userId];
    if (dto.includeLinked) {
      const linked = await this.fraud.linkedAccounts(userId);
      for (const l of linked) {
        const strongish = l.kinds.some(
          (k: FpKind) => STRONG_KINDS.includes(k) || DEVICE_KINDS.includes(k),
        );
        if (strongish && !l.blocked) ids.push(l.userId);
      }
    }
    let banned = 0;
    for (const id of ids) {
      const u = await this.prisma.user.findUnique({
        where: { id },
        select: { status: true, admin_profile: { select: { user_id: true } } },
      });
      if (!u || u.admin_profile || u.status === 'deleted') continue;
      if (u.status !== 'suspended') {
        await this.users.suspend(admin, id, dto.note);
      }
      await this.fraud.setByStaff(
        id,
        FRAUD_STATUS.banned,
        admin.id,
        dto.note,
        id === userId ? FRAUD_EVENT.staffBanned : FRAUD_EVENT.linkedBanned,
      );
      await this.audit.record({
        adminId: admin.id,
        action: FRAUD_AUDIT.ban,
        targetType: 'user',
        targetId: id,
        after: { note: dto.note, linkedTo: id === userId ? null : userId },
        ip: admin.ip,
      });
      banned++;
    }
    // Other accounts sharing weaker signals are re-scored.
    void this.fraud.onBanned(userId);
    return { banned };
  }

  async recompute(admin: AdminActor, userId: string): Promise<FraudCardDto> {
    await this.target(userId);
    await this.fraud.recompute(userId);
    await this.audit.record({
      adminId: admin.id,
      action: FRAUD_AUDIT.recompute,
      targetType: 'user',
      targetId: userId,
      ip: admin.ip,
    });
    return this.card(userId);
  }

  /** «Пересчитать всех»: clients active in the last year, newest first. */
  async recomputeAll(admin: AdminActor): Promise<FraudRecomputeAllResultDto> {
    const since = new Date(Date.now() - 365 * DAY_MS);
    const users = await this.prisma.user.findMany({
      where: {
        role: 'client',
        status: 'active',
        OR: [
          { last_active_at: { gte: since } },
          { created_at: { gte: since } },
        ],
      },
      select: { id: true },
      orderBy: { created_at: 'desc' },
      take: 5000,
    });
    let changed = 0;
    for (const u of users) {
      const before = await this.prisma.clientFraudProfile.findUnique({
        where: { user_id: u.id },
        select: { status: true },
      });
      const after = await this.fraud.recompute(u.id);
      if (after && after !== (before?.status ?? 'ok')) changed++;
    }
    await this.audit.record({
      adminId: admin.id,
      action: FRAUD_AUDIT.recompute,
      targetType: 'app_config',
      targetId: null,
      after: { accounts: users.length, changed },
      ip: admin.ip,
    });
    return { accounts: users.length, changed };
  }

  // --- helpers -------------------------------------------------------------

  private async target(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        admin_profile: { select: { user_id: true } },
      },
    });
    if (!u || u.admin_profile || u.status === 'deleted') throw notFound();
    return u;
  }

  private async usersById(ids: string[]): Promise<Map<string, UserRow>> {
    const list = [...new Set(ids)];
    if (list.length === 0) return new Map();
    const rows = await this.prisma.user.findMany({
      where: { id: { in: list } },
      select: USER_SELECT,
    });
    return new Map(rows.map((r) => [r.id, r]));
  }

  private item(r: ClientFraudProfile, u: UserRow): FraudQueueItemDto {
    return {
      user: presentUser(u),
      score: r.score,
      status: r.status as FraudStatus,
      queueReason: (r.queue_reason as FraudQueueItemDto['queueReason']) ?? null,
      queuedAt: r.queued_at?.toISOString() ?? null,
      signals: Array.isArray(r.signals)
        ? (r.signals as unknown as FraudSignalDto[])
        : [],
      linkedUserId: r.linked_user_id,
      computedAt: r.computed_at.toISOString(),
    };
  }

  private async presentEvents(
    rows: {
      id: string;
      user_id: string | null;
      kind: string;
      actor_type: string;
      actor_id: string | null;
      note: string | null;
      details: Prisma.JsonValue;
      created_at: Date;
    }[],
  ): Promise<FraudEventDto[]> {
    const people = await this.usersById(
      rows
        .flatMap((r) => [r.user_id, r.actor_id])
        .filter((x): x is string => !!x),
    );
    return rows.map((r) => {
      const d = (r.details ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        userId: r.user_id,
        userName: r.user_id ? nameOf(people.get(r.user_id)) : null,
        kind: r.kind,
        actorType: r.actor_type,
        actorId: r.actor_id,
        actorName: r.actor_id ? nameOf(people.get(r.actor_id)) : null,
        note: r.note,
        score: typeof d.score === 'number' ? d.score : null,
        kinds: Array.isArray(d.kinds) ? (d.kinds as FpKind[]) : [],
        createdAt: r.created_at.toISOString(),
      };
    });
  }
}

function presentUser(u: UserRow): FraudUserDto {
  return {
    id: u.id,
    name: nameOf(u),
    role: u.role,
    accountStatus: u.status,
    email: maskEmail(u.email),
    phone: maskPhone(u.phone_e164),
    createdAt: u.created_at.toISOString(),
  };
}

function nameOf(u: UserRow | undefined): string | null {
  if (!u) return null;
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || null;
}

function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  return `${phone.slice(0, 2)}*** ${phone.slice(-4)}`;
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Account not found.',
  });
}
