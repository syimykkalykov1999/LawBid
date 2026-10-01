import type { Prisma } from '@prisma/client';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { ReportReason } from '@prisma/client';
import { ModerationService } from '../moderation/moderation.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
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
import { assertNoBlock } from '../blocks/block-guard';

const PAGE = 20;

/** Owner 2026-09-30: an appeal nobody decided removes the review then. */
export const REVIEW_APPEAL_AUTO_REMOVE_DAYS = 30;

/** Owner 2026-10-01: Google-style — no automatic removal. */
const AUTO_REMOVE_UNDECIDED_APPEALS = false;

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
    // Optional: the worker wires this service without the moderation module.
    @Optional() private readonly moderation?: ModerationService,
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
    const photoIds = await this.checkPhotos(user.sub, dto.photoIds);
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
        photo_ids: photoIds,
      },
      update: {
        rating: dto.rating,
        body,
        ...(dto.photoIds !== undefined ? { photo_ids: photoIds } : {}),
      },
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
    await assertNoBlock(this.prisma, user.sub, clientId);
    const body = dto.body?.length ? dto.body : null;
    if (body) assertNoContactInfo({ body });
    const photoIds = await this.checkPhotos(user.sub, dto.photoIds);
    // Audit 2026-10-01: find → write → rating in one serializable
    // transaction — a double submit can't make two reviews, the rating
    // can't be left stale.
    const { existing, row } = await withTxRetry(this.prisma, async (tx) => {
      const existing = await tx.clientReview.findFirst({
        where: {
          client_id: clientId,
          attorney_id: user.sub,
          status: { not: 'removed' },
        },
        orderBy: { created_at: 'desc' },
        select: { id: true },
      });
      const row = existing
        ? await tx.clientReview.update({
            where: { id: existing.id },
            data: {
              rating: dto.rating,
              body,
              edited_at: new Date(),
              ...(dto.photoIds !== undefined ? { photo_ids: photoIds } : {}),
            },
          })
        : await tx.clientReview.create({
            data: {
              attorney_id: user.sub,
              client_id: clientId,
              rating: dto.rating,
              body,
              photo_ids: photoIds,
            },
          });
      await this.recalc(clientId, tx);
      return { existing, row };
    });
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
    await withTxRetry(this.prisma, async (tx) => {
      await tx.clientReview.update({
        where: { id: reviewId },
        data: { status: 'removed' },
      });
      await tx.clientReviewAppeal.updateMany({
        where: { review_id: reviewId, status: 'pending' },
        data: { status: 'accepted', decided_at: new Date() },
      });
      await this.recalc(r.client_id, tx);
    });
  }

  /**
   * PUT /client-reviews/:id/reply — owner 2026-10-01 (Google-style): the
   * reviewed person answers publicly; they can't delete the review.
   */
  async reply(
    user: RequestUser,
    reviewId: string,
    body: string | null,
  ): Promise<ClientReviewDto> {
    const r = await this.prisma.clientReview.findFirst({
      where: { id: reviewId, client_id: user.sub, status: 'published' },
      select: { attorney_id: true },
    });
    if (!r) throw reviewNotFound();
    if (body) assertNoContactInfo({ body });
    await this.prisma.clientReview.update({
      where: { id: reviewId },
      data: body
        ? { reply: body, reply_at: new Date() }
        : { reply: null, reply_at: null },
    });
    if (body) {
      await this.notifications.emit({
        type: 'review_received',
        recipientId: r.attorney_id,
        payload: {
          reviewId,
          reply: true,
          clientReview: true,
          actorId: user.sub,
        },
      });
    }
    return (await this.present([reviewId], user.sub))[0];
  }

  /** POST /client-reviews/:id/helpful — anyone but the author and subject. */
  async helpful(
    user: RequestUser,
    reviewId: string,
    on: boolean,
  ): Promise<ClientReviewDto> {
    const r = await this.prisma.clientReview.findFirst({
      where: { id: reviewId, status: 'published' },
      select: { attorney_id: true, client_id: true },
    });
    if (!r) throw reviewNotFound();
    if (r.attorney_id === user.sub || r.client_id === user.sub) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'You cannot vote on this review.',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      const key = { review_id: reviewId, user_id: user.sub };
      const had = await tx.clientReviewHelpfulVote.findUnique({
        where: { review_id_user_id: key },
      });
      if (on && !had) {
        await tx.clientReviewHelpfulVote.create({ data: key });
        await tx.clientReview.update({
          where: { id: reviewId },
          data: { helpful_count: { increment: 1 } },
        });
      } else if (!on && had) {
        await tx.clientReviewHelpfulVote.delete({
          where: { review_id_user_id: key },
        });
        await tx.clientReview.update({
          where: { id: reviewId },
          data: { helpful_count: { decrement: 1 } },
        });
      }
    });
    return (await this.present([reviewId], user.sub))[0];
  }

  /**
   * POST /client-reviews/:id/report — owner 2026-10-01 (Google-style):
   * anyone but the author flags it against the policy; it lands in the
   * admin moderation queue (three reporters hide it there).
   */
  async report(
    user: RequestUser,
    reviewId: string,
    reason: ReportReason,
    note?: string,
  ): Promise<{ id: string; status: string }> {
    const r = await this.prisma.clientReview.findFirst({
      where: { id: reviewId, status: 'published' },
      select: { attorney_id: true },
    });
    if (!r) throw reviewNotFound();
    if (r.attorney_id === user.sub) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Edit or delete your own review instead.',
      });
    }
    const open = await this.prisma.report.findFirst({
      where: {
        reporter_id: user.sub,
        target_type: 'client_review',
        target_id: reviewId,
        status: 'open',
      },
      select: { id: true, status: true },
    });
    if (open) return open;
    const created = await this.prisma.report.create({
      data: {
        reporter_id: user.sub,
        target_type: 'client_review',
        target_id: reviewId,
        reason,
        note: note ?? null,
      },
      select: { id: true, status: true },
    });
    await this.moderation?.autoHideIfThreshold('client_review', reviewId);
    return created;
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
        authorRole:
          a.review.attorney.role === 'client'
            ? 'client'
            : a.review.attorney.role === 'assistant'
              ? 'assistant'
              : 'attorney',
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

  /** Own, clean `review_photo` files only (owner 2026-10-01). */
  private async checkPhotos(userId: string, ids?: string[]): Promise<string[]> {
    const unique = [...new Set(ids ?? [])];
    for (const id of unique) {
      await this.files.assertAttachable(userId, id, ['review_photo']);
    }
    return unique;
  }

  /** Cron: undecided appeals past their date remove the review.
   * Owner 2026-10-01 (Google-style): nothing is removed automatically any
   * more — reviews are removed by their author or by moderation. */
  async sweepAppeals(now = new Date()): Promise<number> {
    if (!AUTO_REMOVE_UNDECIDED_APPEALS) return 0;
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
    // Owner 2026-10-01: assistants write reviews too.
    const ok =
      me?.status === 'active' &&
      ((me.role === 'attorney' &&
        me.attorney_profile?.verification_status === 'verified') ||
        ((me.role === 'client' || me.role === 'assistant') &&
          me.phone_verified_at != null));
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
    const sort = query.sort ?? 'newest';
    // Owner 2026-10-01 (Google-style): rating / helpful orders by offset.
    if (sort !== 'newest' && sort !== 'oldest') {
      const offset = query.cursor ? Number(query.cursor) || 0 : 0;
      const rows = await this.prisma.clientReview.findMany({
        where: {
          client_id: clientId,
          status: 'published',
          ...(query.rating !== undefined ? { rating: query.rating } : {}),
        },
        orderBy:
          sort === 'highest'
            ? [{ rating: 'desc' }, { created_at: 'desc' }, { id: 'desc' }]
            : sort === 'lowest'
              ? [{ rating: 'asc' }, { created_at: 'desc' }, { id: 'desc' }]
              : [
                  { helpful_count: 'desc' },
                  { created_at: 'desc' },
                  { id: 'desc' },
                ],
        skip: offset,
        take: PAGE + 1,
        select: { id: true },
      });
      const page = rows.slice(0, PAGE);
      return {
        items: await this.present(
          page.map((r) => r.id),
          user.sub,
        ),
        nextCursor: rows.length > PAGE ? String(offset + PAGE) : null,
      };
    }
    const c = query.cursor ? decodeCursor(query.cursor) : undefined;
    const oldest = sort === 'oldest';
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
    if (
      user.role !== 'attorney' &&
      user.role !== 'client' &&
      user.role !== 'assistant'
    ) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Sign in to see client reviews.',
      });
    }
    // Owner 2026-10-01: clients and attorneys' assistants are reviewed here.
    const client = await this.prisma.user.findFirst({
      where: {
        id: clientId,
        role: { in: ['client', 'assistant'] },
        deleted_at: null,
      },
      select: { id: true },
    });
    if (!client) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Client not found.',
      });
    }
  }

  async recalc(
    clientId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const agg = await db.clientReview.aggregate({
      where: { client_id: clientId, status: 'published' },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await db.clientProfile.updateMany({
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
    const photos = await this.files.postImageUrls(
      rows.flatMap((r) => r.photo_ids),
    );
    const authors = [...new Set(rows.map((r) => r.attorney_id))];
    const [onAttorneys, onPeople] = await Promise.all([
      this.prisma.review.groupBy({
        by: ['client_id'],
        where: { client_id: { in: authors }, status: 'published' },
        _count: { _all: true },
      }),
      this.prisma.clientReview.groupBy({
        by: ['attorney_id'],
        where: { attorney_id: { in: authors }, status: 'published' },
        _count: { _all: true },
      }),
    ]);
    const authored = new Map<string, number>();
    for (const g of onAttorneys) authored.set(g.client_id, g._count._all);
    for (const g of onPeople) {
      authored.set(
        g.attorney_id,
        (authored.get(g.attorney_id) ?? 0) + g._count._all,
      );
    }
    const voted = new Set(
      (
        await this.prisma.clientReviewHelpfulVote.findMany({
          where: { user_id: viewerId, review_id: { in: ids } },
          select: { review_id: true },
        })
      ).map((v) => v.review_id),
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
              a.role === 'client'
                ? ('client' as const)
                : a.role === 'assistant'
                  ? ('assistant' as const)
                  : ('attorney' as const),
          },
          isMine: r.attorney_id === viewerId,
          canAppeal: false,
          canReply: r.client_id === viewerId && r.status === 'published',
          reply: r.reply,
          replyAt: r.reply_at?.toISOString() ?? null,
          helpfulCount: r.helpful_count,
          helpfulByMe: voted.has(r.id),
          editedAt: r.edited_at?.toISOString() ?? null,
          photos: r.photo_ids.flatMap((id) => {
            const u = photos.get(id);
            return u
              ? [{ fileId: id, url: u.url, previewUrl: u.previewUrl }]
              : [];
          }),
          authorReviewCount: authored.get(r.attorney_id) ?? 0,
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
