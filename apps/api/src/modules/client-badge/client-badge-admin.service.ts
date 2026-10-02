import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { ClientVerification, User } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { PAYMENT_PROVIDER } from '../billing/billing.constants';
import type { PaymentProvider } from '../billing/payment-provider';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  AdminClientBadgeDto,
  AdminClientBadgeRowDto,
} from './client-badge.dto';
import { ClientBadgeService } from './client-badge.service';
import { clientBadgeActive } from './client-badge.util';

const PAGE = 50;
type Row = ClientVerification & {
  user: Pick<User, 'first_name' | 'last_name'> & {
    client_profile: { username: string | null } | null;
  };
};

export const CLIENT_BADGE_AUDIT = {
  approve: 'admin.client_badge.approve',
  reject: 'admin.client_badge.reject',
  revoke: 'admin.client_badge.revoke',
} as const;

/**
 * Owner 2026-10-02 — admin panel → Verification → Client badges: the queue
 * of requests with their documents, approve (or give free), reject with a
 * reason, revoke. Every change is audited and the client is told.
 */
@Injectable()
export class ClientBadgeAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditLogService,
    private readonly badges: ClientBadgeService,
    @Optional()
    @Inject(PAYMENT_PROVIDER)
    private readonly provider?: PaymentProvider,
  ) {}

  async list(
    status: string | undefined,
    cursor: string | undefined,
    subStatus?: string,
    q?: string,
  ): Promise<{ items: AdminClientBadgeRowDto[]; nextCursor: string | null }> {
    const c = cursor ? decodeCursor(cursor) : undefined;
    const rows = (await this.prisma.clientVerification.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(subStatus ? { sub_status: subStatus } : {}),
        ...(q
          ? {
              OR: [
                { user: { first_name: { contains: q, mode: 'insensitive' } } },
                { user: { last_name: { contains: q, mode: 'insensitive' } } },
                {
                  user: {
                    client_profile: {
                      username: {
                        contains: q.replace(/^@/, ''),
                        mode: 'insensitive',
                      },
                    },
                  },
                },
              ],
            }
          : {}),
        ...(c
          ? {
              OR: [
                { submitted_at: { lt: c.createdAt } },
                { submitted_at: c.createdAt, id: { lt: c.id } },
              ],
            }
          : {}),
      },
      include: {
        user: {
          select: {
            first_name: true,
            last_name: true,
            client_profile: { select: { username: true } },
          },
        },
      },
      orderBy: [{ submitted_at: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
    })) as Row[];
    const page = rows.slice(0, PAGE);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => this.row(r)),
      nextCursor:
        rows.length > PAGE && last
          ? encodeCursor({ createdAt: last.submitted_at, id: last.id })
          : null,
    };
  }

  async get(id: string): Promise<AdminClientBadgeDto> {
    const r = await this.load(id);
    const fileIds = r.document_file_ids as string[];
    const documents = await Promise.all(
      fileIds.map(async (fileId) => ({
        fileId,
        url: await this.files
          .verificationFileUrl(fileId)
          .then((x) => x.url)
          .catch(() => null),
      })),
    );
    return {
      ...this.row(r),
      note: r.note,
      rejectReason: r.reject_reason,
      revokeReason: r.revoke_reason,
      currentPeriodEnd: r.current_period_end?.toISOString() ?? null,
      cancelAtPeriodEnd: r.cancel_at_period_end,
      documents,
    };
  }

  /** pending (or rejected / revoked, to reverse) → approved; `free` gives
   * the badge without the $10 subscription. */
  async approve(
    admin: AdminActor,
    id: string,
    free: boolean,
  ): Promise<AdminClientBadgeDto> {
    const before = await this.load(id);
    if (before.status === 'approved' && !free) {
      throw this.invalid(before.status, 'The request is already approved.');
    }
    const updated = await withTxRetry(this.prisma, async (tx) => {
      const row = await tx.clientVerification.update({
        where: { id },
        data: {
          status: 'approved',
          reviewed_at: new Date(),
          reviewed_by: admin.id,
          reject_reason: null,
          revoke_reason: null,
          ...(free ? { sub_status: 'comped' } : {}),
        },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: CLIENT_BADGE_AUDIT.approve,
          targetType: 'client_verification',
          targetId: id,
          before: { status: before.status },
          after: { status: 'approved', free },
          ip: admin.ip,
        },
        tx,
      );
      return row;
    });
    await this.badges.notifyBadge(updated, clientBadgeActive(updated));
    return this.get(id);
  }

  async reject(
    admin: AdminActor,
    id: string,
    reason: string,
  ): Promise<AdminClientBadgeDto> {
    const before = await this.load(id);
    if (before.status !== 'pending') {
      throw this.invalid(
        before.status,
        'Only a pending request can be rejected.',
      );
    }
    const updated = await withTxRetry(this.prisma, async (tx) => {
      const row = await tx.clientVerification.update({
        where: { id },
        data: {
          status: 'rejected',
          reviewed_at: new Date(),
          reviewed_by: admin.id,
          reject_reason: reason,
        },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: CLIENT_BADGE_AUDIT.reject,
          targetType: 'client_verification',
          targetId: id,
          before: { status: before.status },
          after: { status: 'rejected', reason },
          ip: admin.ip,
        },
        tx,
      );
      return row;
    });
    await this.badges.notifyBadge(updated, false);
    return this.get(id);
  }

  /** Takes the badge away now and stops the $10 subscription. */
  async revoke(
    admin: AdminActor,
    id: string,
    reason: string,
  ): Promise<AdminClientBadgeDto> {
    const before = await this.load(id);
    if (before.status !== 'approved') {
      throw this.invalid(
        before.status,
        'Only an approved account can be revoked.',
      );
    }
    if (before.stripe_subscription_id && this.provider) {
      // Stop charging: cancel now; the provider's event syncs the row.
      await this.provider
        .cancelNow(before.stripe_subscription_id)
        .catch(() => undefined);
    }
    const updated = await withTxRetry(this.prisma, async (tx) => {
      const row = await tx.clientVerification.update({
        where: { id },
        data: {
          status: 'revoked',
          reviewed_at: new Date(),
          reviewed_by: admin.id,
          revoke_reason: reason,
          sub_status:
            before.sub_status === 'comped' ? 'none' : before.sub_status,
        },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: CLIENT_BADGE_AUDIT.revoke,
          targetType: 'client_verification',
          targetId: id,
          before: { status: before.status },
          after: { status: 'revoked', reason },
          ip: admin.ip,
        },
        tx,
      );
      return row;
    });
    await this.notifications
      .emit({
        type: 'moderation_notice',
        recipientId: updated.user_id,
        payload: { reason },
      })
      .catch(() => undefined);
    await this.badges.notifyBadge(updated, false);
    return this.get(id);
  }

  /** Several requests at once; one that is not in a state to change is
   * skipped, never fails the rest. */
  async bulkApprove(
    admin: AdminActor,
    ids: string[],
    free: boolean,
  ): Promise<{ done: string[]; skipped: { id: string; reason: string }[] }> {
    return this.each(ids, (id) => this.approve(admin, id, free));
  }

  async bulkReject(
    admin: AdminActor,
    ids: string[],
    reason: string,
  ): Promise<{ done: string[]; skipped: { id: string; reason: string }[] }> {
    return this.each(ids, (id) => this.reject(admin, id, reason));
  }

  private async each(
    ids: string[],
    fn: (id: string) => Promise<unknown>,
  ): Promise<{ done: string[]; skipped: { id: string; reason: string }[] }> {
    const done: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const id of [...new Set(ids)]) {
      try {
        await fn(id);
        done.push(id);
      } catch (e) {
        skipped.push({
          id,
          reason:
            e instanceof ConflictException
              ? 'invalid_state'
              : e instanceof NotFoundException
                ? 'not_found'
                : 'failed',
        });
      }
    }
    return { done, skipped };
  }

  // ---- helpers --------------------------------------------------------------

  private async load(id: string): Promise<Row> {
    const r = await this.prisma.clientVerification.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            first_name: true,
            last_name: true,
            client_profile: { select: { username: true } },
          },
        },
      },
    });
    if (!r) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Request not found.',
      });
    }
    return r;
  }

  private row(r: Row): AdminClientBadgeRowDto {
    return {
      id: r.id,
      userId: r.user_id,
      displayName:
        [r.user.first_name, r.user.last_name].filter(Boolean).join(' ') || null,
      username: r.user.client_profile?.username ?? null,
      status: r.status,
      subStatus: r.sub_status,
      badgeActive: clientBadgeActive(r),
      documentsCount: (r.document_file_ids as string[]).length,
      submittedAt: r.submitted_at.toISOString(),
      reviewedAt: r.reviewed_at?.toISOString() ?? null,
    };
  }

  private invalid(status: string, message: string): ConflictException {
    return new ConflictException({
      code: ErrorCode.CONTENT_INVALID_STATE,
      message,
      details: { status },
    });
  }
}
