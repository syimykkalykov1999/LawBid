import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { assertNoContactInfo } from '../cases/domain/contact-detector';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { ReviewSummaryDto } from '../reviews/dto/review-responses.dto';
import { displayRating } from '../reviews/review-rating';
import type {
  AdminReviewAppealDto,
  AdminReviewAppealsDecisionDto,
  ClientReviewDto,
  ClientReviewPage,
  ClientReviewsQueryDto,
  UpsertClientReviewDto,
} from './client-reviews.dto';

const PAGE = 20;

/** Owner 2026-09-30: an appeal nobody decided removes the review then. */
export const REVIEW_APPEAL_AUTO_REMOVE_DAYS = 30;

/** Cases in these states have a working relationship to review. */
const REVIEWABLE = [
  'in_progress',
  'pending_completion',
  'disputed',
  'closed',
] as const;

/**
 * Owner 2026-09-30 (OQ-038, OQ-046): reviews of clients. The hired
 * attorney reviews from the case; besides, anyone — attorney or client,
 * with or without a shared case — may review a client once (editable) to
 * warn others. Every signed-in user sees them. The author deletes theirs
 * at any time; the reviewed client may appeal once: admins accept (the
 * review goes) or reject (it stays), and an appeal nobody decided in 30
 * days removes it. The client's average feeds client_profiles.
 */
@Injectable()
export class ClientReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly notifications: NotificationsService,
  ) {}

  async upsert(
    user: RequestUser,
    caseId: string,
    dto: UpsertClientReviewDto,
  ): Promise<ClientReviewDto> {
    const kase = await this.prisma.case.findFirst({
      where: { id: caseId, deleted_at: null },
      select: {
        client_id: true,
        status: true,
        accepted_bid: { select: { attorney_id: true } },
      },
    });
    if (
      user.role !== 'attorney' ||
      !kase ||
      kase.accepted_bid?.attorney_id !== user.sub ||
      !(REVIEWABLE as readonly string[]).includes(kase.status)
    ) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the attorney hired on this case can review the client.',
      });
    }
    const body = dto.body?.length ? dto.body : null;
    if (body) assertNoContactInfo({ body });
    const existing = await this.prisma.clientReview.findUnique({
      where: {
        case_id_attorney_id: { case_id: caseId, attorney_id: user.sub },
      },
      select: { id: true },
    });
    const row = await this.prisma.clientReview.upsert({
      where: {
        case_id_attorney_id: { case_id: caseId, attorney_id: user.sub },
      },
      create: {
        case_id: caseId,
        attorney_id: user.sub,
        client_id: kase.client_id,
        rating: dto.rating,
        body,
      },
      update: { rating: dto.rating, body },
    });
    await this.recalc(kase.client_id);
    if (!existing) {
      await this.notifications.emit({
        type: 'review_received',
        recipientId: kase.client_id,
        payload: { caseId, actorId: user.sub, clientReview: true },
      });
    }
    return (await this.present([row.id], user.sub))[0];
  }

  /** GET /cases/:id/client-review — the caller's own review, if any. */
  async mine(
    user: RequestUser,
    caseId: string,
  ): Promise<ClientReviewDto | null> {
    const row = await this.prisma.clientReview.findUnique({
      where: {
        case_id_attorney_id: { case_id: caseId, attorney_id: user.sub },
      },
      select: { id: true },
    });
    return row ? (await this.present([row.id], user.sub))[0] : null;
  }

  /** PUT /clients/:id/reviews/mine (owner 2026-09-30): any attorney or
   * client reviews a client, once (an edit replaces it). */
  async upsertOpen(
    user: RequestUser,
    clientId: string,
    dto: UpsertClientReviewDto,
  ): Promise<ClientReviewDto> {
    if (user.sub === clientId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'You cannot review yourself.',
      });
    }
    await this.assertCanWrite(user);
    await this.assertCanSee(user, clientId);
    const body = dto.body?.length ? dto.body : null;
    if (body) assertNoContactInfo({ body });
    const existing = await this.prisma.clientReview.findFirst({
      where: {
        client_id: clientId,
        attorney_id: user.sub,
        status: { not: 'removed' },
      },
      orderBy: { created_at: 'desc' },
      select: { id: true },
    });
    const row = existing
      ? await this.prisma.clientReview.update({
          where: { id: existing.id },
          data: { rating: dto.rating, body },
        })
      : await this.prisma.clientReview.create({
          data: {
            attorney_id: user.sub,
            client_id: clientId,
            rating: dto.rating,
            body,
          },
        });
    await this.recalc(clientId);
    if (!existing) {
      await this.notifications.emit({
        type: 'review_received',
        recipientId: clientId,
        payload: { actorId: user.sub, clientReview: true, reviewId: row.id },
      });
    }
    return (await this.present([row.id], user.sub))[0];
  }

  /** GET /clients/:id/reviews/mine — my review of that client, or null. */
  async mineFor(
    user: RequestUser,
    clientId: string,
  ): Promise<ClientReviewDto | null> {
    const row = await this.prisma.clientReview.findFirst({
      where: {
        client_id: clientId,
        attorney_id: user.sub,
        status: { not: 'removed' },
      },
      orderBy: { created_at: 'desc' },
      select: { id: true },
    });
    return row ? (await this.present([row.id], user.sub))[0] : null;
  }

  /** DELETE /client-reviews/:id — the author removes their review. */
  async remove(user: RequestUser, reviewId: string): Promise<void> {
    const r = await this.prisma.clientReview.findFirst({
      where: {
        id: reviewId,
        attorney_id: user.sub,
        status: { not: 'removed' },
      },
      select: { client_id: true },
    });
    if (!r) throw reviewNotFound();
    await this.prisma.clientReview.update({
      where: { id: reviewId },
      data: { status: 'removed' },
    });
    await this.prisma.clientReviewAppeal.updateMany({
      where: { review_id: reviewId, status: 'pending' },
      data: { status: 'accepted', decided_at: new Date() },
    });
    await this.recalc(r.client_id);
  }

  /** POST /client-reviews/:id/appeal — the reviewed client, once. */
  async appeal(
    user: RequestUser,
    reviewId: string,
    reason: string,
  ): Promise<ClientReviewDto> {
    const r = await this.prisma.clientReview.findFirst({
      where: { id: reviewId, client_id: user.sub, status: 'published' },
      select: { id: true, appeal: { select: { id: true } } },
    });
    if (!r) throw reviewNotFound();
    if (r.appeal) {
      throw new ConflictException({
        code: ErrorCode.REVIEW_APPEAL_EXISTS,
        message: 'This review was already appealed.',
      });
    }
    const now = new Date();
    await this.prisma.clientReviewAppeal.create({
      data: {
        review_id: reviewId,
        appellant_id: user.sub,
        reason,
        auto_remove_at: new Date(
          now.getTime() + REVIEW_APPEAL_AUTO_REMOVE_DAYS * 24 * 3600 * 1000,
        ),
      },
    });
    return (await this.present([reviewId], user.sub))[0];
  }

  /** Admin queue (owner 2026-09-30), oldest first. */
  async listAppeals(
    status: 'pending' | 'accepted' | 'rejected' | 'auto_removed' = 'pending',
    cursor?: string,
  ): Promise<{ items: AdminReviewAppealDto[]; nextCursor: string | null }> {
    const c = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.prisma.clientReviewAppeal.findMany({
      where: {
        status,
        ...(c
          ? {
              OR: [
                { created_at: { gt: c.createdAt } },
                { created_at: c.createdAt, id: { gt: c.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: PAGE + 1,
      include: {
        review: {
          include: {
            attorney: {
              select: { first_name: true, last_name: true, role: true },
            },
            client: { select: { first_name: true, last_name: true } },
          },
        },
      },
    });
    const page = rows.slice(0, PAGE);
    const last = page[page.length - 1];
    const name = (u: { first_name: string | null; last_name: string | null }) =>
      [u.first_name, u.last_name].filter(Boolean).join(' ') || '—';
    return {
      items: page.map((a) => ({
        id: a.id,
        status: a.status,
        reason: a.reason,
        createdAt: a.created_at.toISOString(),
        autoRemoveAt: a.auto_remove_at.toISOString(),
        reviewId: a.review_id,
        rating: a.review.rating,
        body: a.review.body,
        authorName: name(a.review.attorney),
        authorRole: a.review.attorney.role === 'client' ? 'client' : 'attorney',
        clientId: a.review.client_id,
        clientName: name(a.review.client),
      })),
      nextCursor:
        rows.length > PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  /** Admin: accept (remove the reviews) or reject (keep them), in bulk;
   * only pending appeals change. */
  async decideAppeals(
    adminId: string,
    dto: AdminReviewAppealsDecisionDto,
  ): Promise<{ decided: number }> {
    const pending = await this.prisma.clientReviewAppeal.findMany({
      where: { id: { in: dto.ids }, status: 'pending' },
      select: {
        id: true,
        review_id: true,
        review: { select: { client_id: true } },
      },
    });
    if (pending.length === 0) return { decided: 0 };
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.clientReviewAppeal.updateMany({
        where: { id: { in: pending.map((p) => p.id) }, status: 'pending' },
        data: {
          status: dto.decision === 'accept' ? 'accepted' : 'rejected',
          decided_at: now,
          decided_by: adminId,
          admin_note: dto.note ?? null,
        },
      }),
      ...(dto.decision === 'accept'
        ? [
            this.prisma.clientReview.updateMany({
              where: { id: { in: pending.map((p) => p.review_id) } },
              data: { status: 'removed' },
            }),
          ]
        : []),
    ]);
    if (dto.decision === 'accept') {
      for (const id of new Set(pending.map((p) => p.review.client_id))) {
        await this.recalc(id);
      }
    }
    return { decided: pending.length };
  }

  /** Cron: undecided appeals past their date remove the review. */
  async sweepAppeals(now = new Date()): Promise<number> {
    const due = await this.prisma.clientReviewAppeal.findMany({
      where: { status: 'pending', auto_remove_at: { lte: now } },
      select: {
        id: true,
        review_id: true,
        review: { select: { client_id: true } },
      },
      take: 500,
    });
    if (due.length === 0) return 0;
    await this.prisma.$transaction([
      this.prisma.clientReviewAppeal.updateMany({
        where: { id: { in: due.map((d) => d.id) }, status: 'pending' },
        data: { status: 'auto_removed', decided_at: now },
      }),
      this.prisma.clientReview.updateMany({
        where: { id: { in: due.map((d) => d.review_id) } },
        data: { status: 'removed' },
      }),
    ]);
    for (const id of new Set(due.map((d) => d.review.client_id))) {
      await this.recalc(id);
    }
    return due.length;
  }

  private async assertCanWrite(user: RequestUser): Promise<void> {
    const me = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: {
        status: true,
        role: true,
        phone_verified_at: true,
        attorney_profile: { select: { verification_status: true } },
      },
    });
    const ok =
      me?.status === 'active' &&
      ((me.role === 'attorney' &&
        me.attorney_profile?.verification_status === 'verified') ||
        (me.role === 'client' && me.phone_verified_at != null));
    if (!ok) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Verify your account to write reviews.',
      });
    }
  }

  /** GET /clients/:id/reviews — every signed-in user (owner 2026-09-30). */
  async list(
    user: RequestUser,
    clientId: string,
    query: ClientReviewsQueryDto = {},
  ): Promise<ClientReviewPage> {
    await this.assertCanSee(user, clientId);
    const c = query.cursor ? decodeCursor(query.cursor) : undefined;
    const oldest = query.sort === 'oldest';
    const rows = await this.prisma.clientReview.findMany({
      where: {
        client_id: clientId,
        status: 'published',
        ...(query.rating !== undefined ? { rating: query.rating } : {}),
        ...(c
          ? {
              OR: oldest
                ? [
                    { created_at: { gt: c.createdAt } },
                    { created_at: c.createdAt, id: { gt: c.id } },
                  ]
                : [
                    { created_at: { lt: c.createdAt } },
                    { created_at: c.createdAt, id: { lt: c.id } },
                  ],
            }
          : {}),
      },
      orderBy: oldest
        ? [{ created_at: 'asc' }, { id: 'asc' }]
        : [{ created_at: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
      select: { id: true, created_at: true },
    });
    const page = rows.slice(0, PAGE);
    const last = page[page.length - 1];
    const items = await this.present(
      page.map((r) => r.id),
      user.sub,
    );
    const order = new Map(page.map((r, i) => [r.id, i]));
    items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return {
      items,
      nextCursor:
        rows.length > PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  /**
   * GET /clients/:id/reviews/summary — average, count and 5 → 1
   * distribution, like the attorney's Reviews tab (owner 2026-09-30).
   */
  async summary(
    user: RequestUser,
    clientId: string,
  ): Promise<ReviewSummaryDto> {
    await this.assertCanSee(user, clientId);
    const groups = await this.prisma.clientReview.groupBy({
      by: ['rating'],
      where: { client_id: clientId, status: 'published' },
      _count: { _all: true },
    });
    const counts = new Map(groups.map((g) => [g.rating, g._count._all]));
    let total = 0;
    let sum = 0;
    for (const [stars, count] of counts) {
      total += count;
      sum += stars * count;
    }
    return {
      ratingAvg: total === 0 ? null : displayRating(sum / total),
      ratingCount: total,
      distribution: [5, 4, 3, 2, 1].map((stars) => ({
        stars,
        count: counts.get(stars) ?? 0,
      })),
    };
  }

  private async assertCanSee(
    user: RequestUser,
    clientId: string,
  ): Promise<void> {
    if (user.role !== 'attorney' && user.role !== 'client') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Sign in to see client reviews.',
      });
    }
    const client = await this.prisma.user.findFirst({
      where: { id: clientId, role: 'client', deleted_at: null },
      select: { id: true },
    });
    if (!client) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Client not found.',
      });
    }
  }

  async recalc(clientId: string): Promise<void> {
    const agg = await this.prisma.clientReview.aggregate({
      where: { client_id: clientId, status: 'published' },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await this.prisma.clientProfile.updateMany({
      where: { user_id: clientId },
      data: {
        rating_avg: agg._avg.rating ?? 0,
        rating_count: agg._count._all,
      },
    });
  }

  private async present(
    ids: string[],
    viewerId: string,
  ): Promise<ClientReviewDto[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.clientReview.findMany({
      where: { id: { in: ids } },
      include: {
        case: { select: { title: true } },
        appeal: { select: { status: true } },
        attorney: {
          select: {
            role: true,
            first_name: true,
            last_name: true,
            avatar_file_id: true,
            phone_verified_at: true,
            attorney_profile: { select: { username: true } },
          },
        },
      },
    });
    const avatars = await this.files.avatarUrlsMany(
      rows.map((r) => r.attorney.avatar_file_id),
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.flatMap((id) => {
      const r = byId.get(id);
      if (!r) return [];
      const a = r.attorney;
      const username = a.attorney_profile?.username ?? '';
      return [
        {
          id: r.id,
          caseId: r.case_id,
          caseTitle: r.case?.title ?? null,
          rating: r.rating,
          body: r.body,
          attorney: {
            id: r.attorney_id,
            username,
            displayName:
              [a.first_name, a.last_name].filter(Boolean).join(' ') ||
              `@${username}`,
            avatarUrl: a.avatar_file_id
              ? (avatars.get(a.avatar_file_id)?.url256 ?? null)
              : null,
            verifiedBadge: a.phone_verified_at != null,
            role:
              a.role === 'client' ? ('client' as const) : ('attorney' as const),
          },
          isMine: r.attorney_id === viewerId,
          canAppeal:
            r.client_id === viewerId && r.status === 'published' && !r.appeal,
          appealStatus:
            r.client_id === viewerId || r.attorney_id === viewerId
              ? (r.appeal?.status ?? null)
              : null,
          createdAt: r.created_at.toISOString(),
        },
      ];
    });
  }
}

function reviewNotFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Review not found.',
  });
}
