import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { SeatLimitRequest } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { getAssistantLimit } from '../billing/seat-limit';
import { NotificationsService } from '../notifications/notifications.service';
import { EntitlementsService } from '../plans/entitlements.service';
import {
  ADMIN_BILLING_PAGE,
  afterCursor,
  toPage,
  usersById,
  type Page,
} from './admin-billing.util';
import type {
  AdminSeatLimitRequestDto,
  CreateSeatLimitRequestDto,
  SeatLimitRequestDto,
  SeatLimitRequestStatus,
  SeatLimitStateDto,
} from './seat-limit-requests.dto';

/**
 * Owner 2026-10-05: an attorney who needs more assistants than the
 * global limit sends a request; an admin approves it with a personal
 * limit (attorney_profiles.assistant_seat_limit) or rejects it.
 */
@Injectable()
export class SeatLimitRequestsService {
  private readonly logger = new Logger(SeatLimitRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly settings?: AppSettingsService,
    @Optional() private readonly entitlements?: EntitlementsService,
  ) {}

  async create(
    user: RequestUser,
    dto: CreateSeatLimitRequestDto,
  ): Promise<SeatLimitRequestDto> {
    if (user.role !== 'attorney' || user.assistant) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the attorney asks for more assistant seats.',
      });
    }
    const limit = await getAssistantLimit(
      this.prisma,
      user.sub,
      this.settings,
      this.entitlements,
    );
    if (dto.seats <= limit) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `Your limit is already ${limit}.`,
        details: { field: 'seats', min: limit + 1 },
      });
    }
    const pending = await this.prisma.seatLimitRequest.findFirst({
      where: { attorney_id: user.sub, status: 'pending' },
      select: { id: true },
    });
    if (pending) {
      throw new ConflictException({
        code: ErrorCode.SEAT_LIMIT_REQUEST_PENDING,
        message: 'A request is already waiting for review.',
      });
    }
    const row = await this.prisma.seatLimitRequest.create({
      data: {
        attorney_id: user.sub,
        requested_seats: dto.seats,
        note: dto.note?.trim() || null,
      },
    });
    return present(row);
  }

  /** The attorney's limit and latest request (the subscription screen). */
  async state(attorneyId: string): Promise<SeatLimitStateDto> {
    const [row, profile, limit] = await Promise.all([
      this.prisma.seatLimitRequest.findFirst({
        where: { attorney_id: attorneyId },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.attorneyProfile.findUnique({
        where: { user_id: attorneyId },
        select: { assistant_seat_limit: true },
      }),
      getAssistantLimit(
        this.prisma,
        attorneyId,
        this.settings,
        this.entitlements,
      ),
    ]);
    return {
      limit,
      isPersonal: (profile?.assistant_seat_limit ?? 0) > 0,
      request: row ? present(row) : null,
    };
  }

  async list(q: {
    status?: SeatLimitRequestStatus;
    cursor?: string;
  }): Promise<Page<AdminSeatLimitRequestDto>> {
    const rows = await this.prisma.seatLimitRequest.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...afterCursor(q.cursor),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: ADMIN_BILLING_PAGE + 1,
    });
    const ids = [...new Set(rows.map((r) => r.attorney_id))];
    const [users, used, limits] = await Promise.all([
      usersById(this.prisma, ids),
      this.prisma.assistantMembership.groupBy({
        by: ['attorney_id'],
        where: { attorney_id: { in: ids }, status: { not: 'removed' } },
        _count: true,
      }),
      Promise.all(
        ids.map(
          async (id) =>
            [
              id,
              await getAssistantLimit(
                this.prisma,
                id,
                this.settings,
                this.entitlements,
              ),
            ] as const,
        ),
      ),
    ]);
    const usedOf = new Map(used.map((g) => [g.attorney_id, g._count]));
    const limitOf = new Map(limits);
    return toPage(rows, ADMIN_BILLING_PAGE, (r) => ({
      ...present(r),
      attorneyId: r.attorney_id,
      user: users.get(r.attorney_id) ?? null,
      currentLimit: limitOf.get(r.attorney_id) ?? 0,
      assistantsUsed: usedOf.get(r.attorney_id) ?? 0,
    }));
  }

  async approve(
    admin: AdminActor,
    id: string,
    seats: number,
    note?: string,
  ): Promise<SeatLimitRequestDto> {
    const row = await this.pendingRow(id);
    const profile = await this.prisma.attorneyProfile.findUnique({
      where: { user_id: row.attorney_id },
      select: { assistant_seat_limit: true },
    });
    if (!profile) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Attorney profile not found.',
      });
    }
    const [updated] = await this.prisma.$transaction([
      this.prisma.seatLimitRequest.update({
        where: { id },
        data: {
          status: 'approved',
          granted_seats: seats,
          decision_note: note?.trim() || null,
          decided_by: admin.id,
          decided_at: new Date(),
        },
      }),
      this.prisma.attorneyProfile.update({
        where: { user_id: row.attorney_id },
        data: { assistant_seat_limit: seats },
      }),
    ]);
    await this.entitlements?.invalidateUser(row.attorney_id);
    await this.audit.record({
      adminId: admin.id,
      action: 'billing.seat_limit.approve',
      targetType: 'user',
      targetId: row.attorney_id,
      before: { assistantSeatLimit: profile.assistant_seat_limit },
      after: { assistantSeatLimit: seats, requestId: id },
      ip: admin.ip,
    });
    await this.notify(updated);
    return present(updated);
  }

  async reject(
    admin: AdminActor,
    id: string,
    note?: string,
  ): Promise<SeatLimitRequestDto> {
    await this.pendingRow(id);
    const updated = await this.prisma.seatLimitRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        decision_note: note?.trim() || null,
        decided_by: admin.id,
        decided_at: new Date(),
      },
    });
    await this.audit.record({
      adminId: admin.id,
      action: 'billing.seat_limit.reject',
      targetType: 'user',
      targetId: updated.attorney_id,
      after: { requestId: id, note: updated.decision_note },
      ip: admin.ip,
    });
    await this.notify(updated);
    return present(updated);
  }

  private async pendingRow(id: string): Promise<SeatLimitRequest> {
    const row = await this.prisma.seatLimitRequest.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Request not found.',
      });
    }
    if (row.status !== 'pending') {
      throw new ConflictException({
        code: ErrorCode.SEAT_LIMIT_REQUEST_DECIDED,
        message: 'This request is already decided.',
      });
    }
    return row;
  }

  private async notify(row: SeatLimitRequest): Promise<void> {
    const kind =
      row.status === 'approved' ? 'seat_limit_approved' : 'seat_limit_rejected';
    try {
      await this.notifications.emit({
        type: 'subscription_status',
        recipientId: row.attorney_id,
        payload: {
          kind,
          status: kind,
          requestId: row.id,
          seats: row.granted_seats ?? row.requested_seats,
        },
      });
    } catch (e) {
      // The decision is saved; a failed notification must not undo it.
      this.logger.warn(`seat limit notification failed: ${String(e)}`);
    }
  }
}

export function present(r: SeatLimitRequest): SeatLimitRequestDto {
  return {
    id: r.id,
    status: r.status as SeatLimitRequestStatus,
    requestedSeats: r.requested_seats,
    grantedSeats: r.granted_seats,
    note: r.note,
    decisionNote: r.decision_note,
    createdAt: r.created_at.toISOString(),
    decidedAt: r.decided_at?.toISOString() ?? null,
  };
}
