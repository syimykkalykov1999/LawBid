import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AccountBan } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import {
  normalizeBanValue,
  type BanKind,
} from '../account-bans/account-bans.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { SessionRevocationService } from '../auth/services/session-revocation.service';
import type {
  AdminBanDto,
  BansQueryDto,
  BlockResultDto,
  BlockUserDto,
  CreateBanDto,
} from './admin-sanctions.dto';

export const SANCTIONS_AUDIT = {
  ban: 'sanctions.ban',
  lift: 'sanctions.lift',
  block: 'sanctions.block_user',
} as const;

const PAGE = 50;
const DAY_MS = 86_400_000;

/**
 * Sign-in blocks (owner 2026-10-02): block a user (for days or for good),
 * and ban a phone number, an e-mail or a device. Data is never deleted
 * here: a block keeps everything the law requires us to keep; erasing an
 * account is the user's own deletion request. Every action is audited, ends
 * the user's sessions at once, and can be lifted.
 */
@Injectable()
export class AdminSanctionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly revocation: SessionRevocationService,
  ) {}

  async list(
    q: BansQueryDto,
  ): Promise<{ items: AdminBanDto[]; nextCursor: string | null }> {
    const now = new Date();
    const status = q.status ?? 'active';
    const active = {
      lifted_at: null,
      OR: [{ expires_at: null }, { expires_at: { gt: now } }],
    };
    const ended = {
      OR: [{ lifted_at: { not: null } }, { expires_at: { lte: now } }],
    };
    const needle = q.q?.trim();
    const rows = await this.prisma.accountBan.findMany({
      where: {
        AND: [
          status === 'active' ? active : status === 'ended' ? ended : {},
          q.kind ? { kind: q.kind } : {},
          needle
            ? {
                OR: [
                  {
                    value: {
                      contains: needle.toLowerCase(),
                      mode: 'insensitive',
                    },
                  },
                  { value: { contains: needle } },
                  ...(isUuid(needle) ? [{ user_id: needle }] : []),
                ],
              }
            : {},
        ],
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, PAGE);
    const names = await this.names(page.map((r) => r.user_id));
    return {
      items: page.map((r) =>
        present(r, names.get(r.user_id ?? '') ?? null, now),
      ),
      nextCursor: rows.length > PAGE ? page[page.length - 1].id : null,
    };
  }

  async create(admin: AdminActor, dto: CreateBanDto): Promise<AdminBanDto> {
    const kind = dto.kind;
    const value = normalizeBanValue(kind, dto.value);
    this.assertValue(kind, value);
    let userId: string | null = null;
    if (kind === 'user') {
      await this.assertTargetable(value);
      userId = value;
    }
    const row = await withTxRetry(this.prisma, async (tx) => {
      const created = await this.insert(
        tx,
        admin,
        kind,
        value,
        userId,
        dto.reason,
        dto.days,
      );
      await this.audit.record(
        {
          adminId: admin.id,
          action: SANCTIONS_AUDIT.ban,
          targetType: 'ban',
          targetId: created.id,
          after: { kind, value, reason: dto.reason, days: dto.days ?? null },
          ip: admin.ip,
        },
        tx,
      );
      return created;
    });
    if (userId)
      await this.revocation.revokeAllChainsForUser(userId, 'admin_block');
    return present(row, null, new Date());
  }

  async lift(
    admin: AdminActor,
    id: string,
    reason: string,
  ): Promise<AdminBanDto> {
    const before = await this.prisma.accountBan.findUnique({ where: { id } });
    if (!before) throw notFound();
    if (before.lifted_at) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'The block is already lifted.',
      });
    }
    const row = await withTxRetry(this.prisma, async (tx) => {
      const updated = await tx.accountBan.update({
        where: { id },
        data: {
          lifted_at: new Date(),
          lifted_by: admin.id,
          lift_reason: reason,
        },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: SANCTIONS_AUDIT.lift,
          targetType: 'ban',
          targetId: id,
          before: { kind: before.kind, value: before.value },
          after: { reason },
          ip: admin.ip,
        },
        tx,
      );
      return updated;
    });
    return present(row, null, new Date());
  }

  /** One click: block the person, optionally their phone, e-mail and every
   * device they signed in from. */
  async blockUser(
    admin: AdminActor,
    userId: string,
    dto: BlockUserDto,
  ): Promise<BlockResultDto> {
    const user = await this.assertTargetable(userId);
    const sessions = dto.banDevices
      ? await this.prisma.session.findMany({
          where: { user_id: userId, device_id: { not: null } },
          select: { device_id: true },
          distinct: ['device_id'],
        })
      : [];
    const rows = await withTxRetry(this.prisma, async (tx) => {
      const out: AccountBan[] = [];
      const add = async (kind: BanKind, value: string, uid: string | null) =>
        out.push(
          await this.insert(tx, admin, kind, value, uid, dto.reason, dto.days),
        );
      await add('user', userId, userId);
      if (dto.banPhone && user.phone_e164)
        await add('phone', user.phone_e164, userId);
      if (dto.banEmail && user.email)
        await add('email', normalizeBanValue('email', user.email), userId);
      for (const s of sessions)
        if (s.device_id) await add('device', s.device_id, userId);
      await this.audit.record(
        {
          adminId: admin.id,
          action: SANCTIONS_AUDIT.block,
          targetType: 'user',
          targetId: userId,
          after: {
            reason: dto.reason,
            days: dto.days ?? null,
            kinds: out.map((b) => b.kind),
          },
          ip: admin.ip,
        },
        tx,
      );
      return out;
    });
    const chains = await this.revocation.revokeAllChainsForUser(
      userId,
      'admin_block',
    );
    const now = new Date();
    return {
      bans: rows.map((r) => present(r, null, now)),
      revokedSessions: chains.length,
    };
  }

  private insert(
    tx: Pick<PrismaService, 'accountBan'>,
    admin: AdminActor,
    kind: BanKind,
    value: string,
    userId: string | null,
    reason: string,
    days?: number,
  ) {
    return tx.accountBan.create({
      data: {
        kind,
        value,
        user_id: userId,
        reason,
        created_by: admin.id,
        expires_at: days ? new Date(Date.now() + days * DAY_MS) : null,
      },
    });
  }

  /** Clients, attorneys and assistants only: admins are managed in
   * /admin/admins, and a deleted account has nothing left to block. */
  private async assertTargetable(id: string) {
    if (!isUuid(id)) throw notFound();
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        status: true,
        phone_e164: true,
        email: true,
        admin_profile: { select: { user_id: true } },
      },
    });
    if (!u || u.status === 'deleted' || u.admin_profile) throw notFound();
    return u;
  }

  private assertValue(kind: BanKind, value: string): void {
    const ok =
      kind === 'phone'
        ? /^\+[1-9]\d{6,14}$/.test(value)
        : kind === 'email'
          ? /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
          : kind === 'user'
            ? isUuid(value)
            : value.length >= 3;
    if (!ok) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message:
          kind === 'phone'
            ? 'Phone must look like +15551234567.'
            : kind === 'email'
              ? 'Enter a valid e-mail.'
              : kind === 'user'
                ? 'Enter a user id.'
                : 'Enter the device id.',
      });
    }
  }

  private async names(ids: (string | null)[]): Promise<Map<string, string>> {
    const list = [...new Set(ids.filter((x): x is string => !!x))];
    if (list.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: list } },
      select: { id: true, first_name: true, last_name: true, email: true },
    });
    return new Map(
      users.map((u) => [
        u.id,
        [u.first_name, u.last_name].filter(Boolean).join(' ') ||
          u.email ||
          u.id.slice(0, 8),
      ]),
    );
  }
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Not found.',
  });
}

function present(
  r: AccountBan,
  userName: string | null,
  now: Date,
): AdminBanDto {
  return {
    id: r.id,
    kind: r.kind,
    value: r.value,
    userId: r.user_id,
    userName,
    reason: r.reason,
    expiresAt: r.expires_at ? r.expires_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    createdBy: r.created_by,
    liftedAt: r.lifted_at ? r.lifted_at.toISOString() : null,
    liftReason: r.lift_reason,
    active: !r.lifted_at && (!r.expires_at || r.expires_at > now),
  };
}
