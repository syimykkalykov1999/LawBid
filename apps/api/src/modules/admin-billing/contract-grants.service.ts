import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ContractGrant, Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { NotificationsService } from '../notifications/notifications.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import type {
  AdminBillingUserDto,
  ContractGrantDto,
  CreateContractGrantDto,
  GrantStatus,
} from './admin-billing.dto';
import {
  ADMIN_BILLING_PAGE,
  addMonthsUtc,
  afterCursor,
  type Page,
  toPage,
  usersById,
} from './admin-billing.util';

/** DB CHECK: 1–24 months in total (create allows 3–12, extend adds). */
export const GRANT_MAX_TOTAL_MONTHS = 24;

export function grantStatus(g: ContractGrant, now = new Date()): GrantStatus {
  if (g.revoked_at) return 'revoked';
  if (g.starts_at > now) return 'scheduled';
  return g.ends_at > now ? 'active' : 'expired';
}

export function grantStatusWhere(
  status: GrantStatus,
  now = new Date(),
): Prisma.ContractGrantWhereInput {
  switch (status) {
    case 'revoked':
      return { revoked_at: { not: null } };
    case 'scheduled':
      return { revoked_at: null, starts_at: { gt: now } };
    case 'active':
      return {
        revoked_at: null,
        starts_at: { lte: now },
        ends_at: { gt: now },
      };
    case 'expired':
      return { revoked_at: null, ends_at: { lte: now } };
  }
}

/**
 * Owner 2026-10-02: free subscriptions under a contract (blogger
 * attorneys). SubscriptionAccessService.isActive() treats an active grant
 * as a subscription; every change drops its cache.
 */
@Injectable()
export class ContractGrantsService {
  private readonly logger = new Logger(ContractGrantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SubscriptionAccessService,
    private readonly audit: AuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(q: {
    status?: GrantStatus;
    userId?: string;
    cursor?: string;
  }): Promise<Page<ContractGrantDto>> {
    const rows = await this.prisma.contractGrant.findMany({
      where: {
        AND: [
          q.status ? grantStatusWhere(q.status) : {},
          q.userId ? { user_id: q.userId } : {},
          afterCursor(q.cursor),
        ],
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: ADMIN_BILLING_PAGE + 1,
    });
    const users = await usersById(
      this.prisma,
      rows.map((r) => r.user_id),
    );
    return toPage(rows, ADMIN_BILLING_PAGE, (r) => present(r, users));
  }

  async forUser(userId: string): Promise<ContractGrantDto[]> {
    const rows = await this.prisma.contractGrant.findMany({
      where: { user_id: userId },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    const users = await usersById(this.prisma, [userId]);
    return rows.map((r) => present(r, users));
  }

  async create(
    admin: AdminActor,
    dto: CreateContractGrantDto,
  ): Promise<ContractGrantDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, role: true, deleted_at: true },
    });
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'User not found.',
      });
    }
    if (user.role !== 'attorney' || user.deleted_at) {
      throw new ConflictException({
        code: ErrorCode.CONTRACT_GRANT_NOT_ATTORNEY,
        message: 'Contract subscriptions are for attorneys only.',
      });
    }
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
    const row = await this.prisma.contractGrant.create({
      data: {
        user_id: dto.userId,
        months: dto.months,
        assistant_seats: dto.assistantSeats ?? 0,
        starts_at: startsAt,
        ends_at: addMonthsUtc(startsAt, dto.months),
        contract_ref: dto.contractRef || null,
        note: dto.note || null,
        created_by: admin.id,
      },
    });
    await this.access.invalidate(row.user_id);
    await this.audit.record({
      adminId: admin.id,
      action: 'billing.contract_grant.create',
      targetType: 'contract_grant',
      targetId: row.id,
      after: snapshot(row),
      ip: admin.ip,
    });
    await this.notify(row, 'contract');
    return this.one(row);
  }

  async extend(
    admin: AdminActor,
    id: string,
    months: number,
    reason?: string,
  ): Promise<ContractGrantDto> {
    const row = await this.must(id);
    if (row.revoked_at) throw revoked();
    const total = row.months + months;
    if (total > GRANT_MAX_TOTAL_MONTHS) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `A contract grant spans at most ${GRANT_MAX_TOTAL_MONTHS} months.`,
        details: { field: 'months', max: GRANT_MAX_TOTAL_MONTHS - row.months },
      });
    }
    const updated = await this.prisma.contractGrant.update({
      where: { id },
      data: { months: total, ends_at: addMonthsUtc(row.ends_at, months) },
    });
    await this.access.invalidate(row.user_id);
    await this.audit.record({
      adminId: admin.id,
      action: 'billing.contract_grant.extend',
      targetType: 'contract_grant',
      targetId: id,
      before: snapshot(row),
      after: {
        ...snapshot(updated),
        addedMonths: months,
        reason: reason ?? null,
      },
      ip: admin.ip,
    });
    await this.notify(updated, 'contract');
    return this.one(updated);
  }

  async revoke(
    admin: AdminActor,
    id: string,
    reason: string,
  ): Promise<ContractGrantDto> {
    const row = await this.must(id);
    if (row.revoked_at) throw revoked();
    const updated = await this.prisma.contractGrant.update({
      where: { id },
      data: {
        revoked_at: new Date(),
        revoked_by: admin.id,
        revoke_reason: reason,
      },
    });
    await this.access.invalidate(row.user_id);
    await this.audit.record({
      adminId: admin.id,
      action: 'billing.contract_grant.revoke',
      targetType: 'contract_grant',
      targetId: id,
      before: snapshot(row),
      after: { ...snapshot(updated), reason },
      ip: admin.ip,
    });
    await this.notify(updated, 'contract_revoked');
    return this.one(updated);
  }

  // ------------------------------------------------------------------

  private async one(row: ContractGrant): Promise<ContractGrantDto> {
    return present(row, await usersById(this.prisma, [row.user_id]));
  }

  private async must(id: string): Promise<ContractGrant> {
    const row = await this.prisma.contractGrant.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Contract grant not found.',
      });
    }
    return row;
  }

  /** `subscription_status` (the closest NotificationType; no new enum). */
  private async notify(
    row: ContractGrant,
    status: 'contract' | 'contract_revoked',
  ): Promise<void> {
    try {
      await this.notifications.emit({
        type: 'subscription_status',
        recipientId: row.user_id,
        payload: {
          status,
          grantId: row.id,
          contractUntil: row.ends_at.toISOString(),
          assistantSeats: row.assistant_seats,
        },
      });
    } catch (e) {
      // The grant is saved; a failed notification must not undo it.
      this.logger.warn(`grant notification failed: ${String(e)}`);
    }
  }
}

function revoked() {
  return new ConflictException({
    code: ErrorCode.CONTRACT_GRANT_REVOKED,
    message: 'This contract grant was revoked.',
  });
}

function snapshot(g: ContractGrant): Prisma.InputJsonObject {
  return {
    userId: g.user_id,
    months: g.months,
    assistantSeats: g.assistant_seats,
    startsAt: g.starts_at.toISOString(),
    endsAt: g.ends_at.toISOString(),
    revokedAt: g.revoked_at?.toISOString() ?? null,
  };
}

export function present(
  g: ContractGrant,
  users: Map<string, AdminBillingUserDto>,
  now = new Date(),
): ContractGrantDto {
  return {
    id: g.id,
    userId: g.user_id,
    user: users.get(g.user_id) ?? null,
    months: g.months,
    assistantSeats: g.assistant_seats,
    startsAt: g.starts_at.toISOString(),
    endsAt: g.ends_at.toISOString(),
    status: grantStatus(g, now),
    contractRef: g.contract_ref,
    note: g.note,
    createdBy: g.created_by,
    revokedAt: g.revoked_at?.toISOString() ?? null,
    revokedBy: g.revoked_by,
    revokeReason: g.revoke_reason,
    createdAt: g.created_at.toISOString(),
  };
}
