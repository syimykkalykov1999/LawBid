import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { withDeleted } from '../../prisma/soft-delete.extension';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { ModerationService, type Tx } from '../moderation/moderation.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AdminClientReviewRowDto } from './admin-content.dto';

const PAGE = 50;
type Page<T> = { items: T[]; nextCursor: string | null };
type Named = { first_name: string | null; last_name: string | null } | null;
const nameOf = (u: Named) =>
  [u?.first_name, u?.last_name].filter(Boolean).join(' ') || '—';

export type RestorableType = 'post' | 'comment' | 'case_comment';

/** Raw moderation state of a post/comment (deleted rows included). */
interface RawState {
  status: string;
  videoDeleted: boolean;
}

/**
 * Audit 2026-10-02 — the admin content gaps: restoring what moderation
 * removed or hid (posts, post comments, case comments), the reviews of
 * clients (list, hide, restore) and the audit row of a CSV export.
 * Status changes go through ModerationService like the remove path, so
 * counters and ratings stay in sync.
 */
@Injectable()
export class AdminContentExtrasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditLogService,
  ) {}

  // --- restore -----------------------------------------------------------------

  /**
   * Back to `published`. Only what moderation took down (status `removed`
   * or `hidden`) comes back: a post its author deleted keeps
   * status `published` with `deleted_at` and stays deleted; a reel whose
   * video was taken down can't come back without its video.
   */
  async restore(
    admin: AdminActor,
    type: RestorableType,
    id: string,
    reason: string,
  ): Promise<void> {
    const after: (() => Promise<void>)[] = [];
    await withTxRetry(this.prisma, async (tx) => {
      after.length = 0;
      const raw = await this.rawState(tx, type, id);
      if (!raw) throw notFound();
      if (raw.status !== 'removed' && raw.status !== 'hidden') {
        throw invalidState(
          'Only content removed or hidden by moderation can be restored.',
          { status: raw.status },
        );
      }
      if (raw.videoDeleted) {
        throw invalidState('The video of this post was taken down.', {
          video: 'deleted',
        });
      }
      const target = await this.moderation.resolve(type, id, tx);
      if (!target) throw notFound();
      await this.moderation.setContentStatus(tx, target, 'restore', after);
      await this.audit.record(
        {
          adminId: admin.id,
          action: `admin.${type}.restore`,
          targetType: type,
          targetId: id,
          before: { status: raw.status },
          after: { status: 'published', reason },
          ip: admin.ip,
        },
        tx,
      );
    });
    for (const f of after) await f();
  }

  private async rawState(
    tx: Tx,
    type: RestorableType,
    id: string,
  ): Promise<RawState | null> {
    if (type === 'post') {
      const p = await tx.post.findUnique({
        where: withDeleted({ id }),
        select: { status: true, video_asset: { select: { status: true } } },
      });
      return p
        ? {
            status: p.status,
            videoDeleted: p.video_asset?.status === 'deleted',
          }
        : null;
    }
    const select = { status: true } as const;
    const row =
      type === 'comment'
        ? await tx.comment.findUnique({ where: withDeleted({ id }), select })
        : await tx.caseComment.findUnique({
            where: withDeleted({ id }),
            select,
          });
    return row ? { status: row.status, videoDeleted: false } : null;
  }

  // --- reviews of clients --------------------------------------------------------

  async clientReviews(
    q?: string,
    status?: 'published' | 'hidden' | 'removed',
    cursor?: string,
  ): Promise<Page<AdminClientReviewRowDto>> {
    const c = cursor ? decodeCursor(cursor) : undefined;
    const term = q?.trim();
    const like = { contains: term ?? '', mode: 'insensitive' as const };
    const person = { OR: [{ first_name: like }, { last_name: like }] };
    const where: Prisma.ClientReviewWhereInput = {
      ...(status ? { status } : {}),
      AND: [
        term
          ? { OR: [{ body: like }, { attorney: person }, { client: person }] }
          : {},
        c
          ? {
              OR: [
                { created_at: { lt: c.createdAt } },
                { created_at: c.createdAt, id: { lt: c.id } },
              ],
            }
          : {},
      ],
    };
    const rows = await this.prisma.clientReview.findMany({
      where,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
      include: {
        attorney: { select: { first_name: true, last_name: true, role: true } },
        client: { select: { first_name: true, last_name: true } },
        case: { select: { title: true } },
        appeal: { select: { status: true } },
      },
    });
    const slice = rows.slice(0, PAGE);
    const last = slice[slice.length - 1];
    return {
      items: slice.map((r) => ({
        id: r.id,
        rating: r.rating,
        body: r.body,
        authorId: r.attorney_id,
        authorName: nameOf(r.attorney),
        authorRole:
          r.attorney.role === 'client' || r.attorney.role === 'assistant'
            ? r.attorney.role
            : 'attorney',
        clientId: r.client_id,
        clientName: nameOf(r.client),
        caseTitle: r.case?.title ?? null,
        status: r.status,
        appealStatus: r.appeal?.status ?? null,
        createdAt: r.created_at.toISOString(),
      })),
      nextCursor:
        rows.length > PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  /** Hide (the author learns why) or show again; the client's rating is
   * recalculated by ModerationService. */
  async setClientReviewStatus(
    id: string,
    action: 'hide' | 'restore',
    reason: string,
  ): Promise<void> {
    const after: (() => Promise<void>)[] = [];
    const authorId = await withTxRetry(this.prisma, async (tx) => {
      after.length = 0;
      const target = await this.moderation.resolve('client_review', id, tx);
      if (!target) throw notFound();
      const prev = await this.moderation.setContentStatus(
        tx,
        target,
        action,
        after,
      );
      if (prev === null) {
        throw invalidState('The review is already in this state.', {
          status: target.status,
        });
      }
      return target.authorId;
    });
    for (const f of after) await f();
    if (action === 'hide' && authorId) {
      await this.notifications.emit({
        type: 'moderation_notice',
        recipientId: authorId,
        payload: { reason, clientReviewId: id },
      });
    }
  }

  // --- CSV export audit ---------------------------------------------------------------

  /** Audit 2026-10-02: every CSV export leaves a row (GETs are not
   * auto-audited); the users export carries its X-Justification. */
  async recordExport(
    admin: AdminActor,
    entity: string,
    justification: string | null,
    bytes: number,
  ): Promise<void> {
    await this.audit.record({
      adminId: admin.id,
      action: `admin.export.${entity}`,
      targetType: 'export',
      targetId: null,
      after: { entity, bytes },
      ip: admin.ip,
      justification,
    });
  }
}

function notFound() {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Not found.',
  });
}

function invalidState(message: string, details: Record<string, string>) {
  return new ConflictException({
    code: ErrorCode.CONTENT_INVALID_STATE,
    message,
    details,
  });
}
