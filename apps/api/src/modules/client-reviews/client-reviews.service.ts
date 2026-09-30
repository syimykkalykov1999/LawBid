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
import type {
  ClientReviewDto,
  ClientReviewPage,
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
    cursor?: string,
  ): Promise<ClientReviewPage> {
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
    const c = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.prisma.clientReview.findMany({
      where: {
        client_id: clientId,
        status: 'published',
        ...(c
          ? {
              OR: [
                { created_at: { lt: c.createdAt } },
                { created_at: c.createdAt, id: { lt: c.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
      select: { id: true, created_at: true },
    });
    const page = rows.slice(0, PAGE);
    const last = page[page.length - 1];
    return {
      items: await this.present(
        page.map((r) => r.id),
        user.sub,
      ),
      nextCursor:
        rows.length > PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
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
