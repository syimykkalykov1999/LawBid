import {
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
  ClientReviewDto,
  ClientReviewPage,
  ClientReviewsQueryDto,
  UpsertClientReviewDto,
} from './client-reviews.dto';

const PAGE = 20;

/** Cases in these states have a working relationship to review. */
const REVIEWABLE = [
  'in_progress',
  'pending_completion',
  'disputed',
  'closed',
] as const;

/**
 * Owner 2026-09-30 (OQ-038): attorneys review clients. Only the attorney
 * whose bid the client accepted reviews that client, once per case
 * (editable). Reviews are visible to attorneys and to the client, never
 * to other clients. The client's average feeds client_profiles.
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

  /** GET /clients/:id/reviews — attorneys and the client only. */
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
    if (user.role !== 'attorney' && user.sub !== clientId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Client reviews are visible to attorneys only.',
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

  private async recalc(clientId: string): Promise<void> {
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
        attorney: {
          select: {
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
          caseTitle: r.case.title,
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
          },
          isMine: r.attorney_id === viewerId,
          createdAt: r.created_at.toISOString(),
        },
      ];
    });
  }
}
