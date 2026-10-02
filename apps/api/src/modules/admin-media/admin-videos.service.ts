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
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { AdminContentService } from '../admin-content/admin-content.service';
import { VideosService } from '../videos/videos.service';
import type {
  AdminVideoRowDto,
  AdminVideoStatsDto,
  AdminVideoStatus,
} from './admin-media.dto';

const PAGE = 50;
const DAY_MS = 86_400_000;
type Page<T> = { items: T[]; nextCursor: string | null };
type Named = { first_name: string | null; last_name: string | null } | null;
const nameOf = (u: Named) =>
  [u?.first_name, u?.last_name].filter(Boolean).join(' ') || '—';

export const VIDEO_AUDIT = { takedown: 'admin.video.takedown' } as const;

/**
 * Audit 2026-10-02 — admin panel → Media → Reels: every Bunny video asset
 * (failed uploads included), a takedown and the numbers. The takedown
 * removes the linked post through the same path as
 * POST /admin/content/posts/:id/remove (status, counters, the author's
 * moderation_notice) and deletes the video like the author's own delete
 * (VideosService.markDeleted + purgeNow; the sweep retries Bunny).
 */
@Injectable()
export class AdminVideosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly videos: VideosService,
    private readonly content: AdminContentService,
    private readonly audit: AuditLogService,
  ) {}

  async list(
    status?: AdminVideoStatus,
    ownerId?: string,
    cursor?: string,
  ): Promise<Page<AdminVideoRowDto>> {
    const c = cursor ? decodeCursor(cursor) : undefined;
    // withDeleted: the admin sees taken-down / deleted assets too.
    const where: Prisma.VideoAssetWhereInput = withDeleted({
      ...(status ? { status } : {}),
      ...(ownerId ? { owner_user_id: ownerId } : {}),
      ...(c
        ? {
            OR: [
              { created_at: { lt: c.createdAt } },
              { created_at: c.createdAt, id: { lt: c.id } },
            ],
          }
        : {}),
    });
    const rows = await this.prisma.videoAsset.findMany({
      where,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
      include: {
        owner: { select: { first_name: true, last_name: true } },
        post: { select: { id: true, status: true, deleted_at: true } },
      },
    });
    const slice = rows.slice(0, PAGE);
    const media = await this.videos.present(slice);
    const last = slice[slice.length - 1];
    return {
      items: slice.map((a) => ({
        id: a.id,
        status: a.status,
        ownerId: a.owner_user_id,
        ownerName: nameOf(a.owner),
        postId: a.post?.id ?? null,
        postStatus: a.post
          ? a.post.deleted_at
            ? 'removed'
            : a.post.status
          : null,
        durationSec: a.duration_sec,
        sizeBytes: a.storage_bytes === null ? null : Number(a.storage_bytes),
        failureReason: a.failure_reason,
        playbackUrl: media.get(a.id)?.playbackUrl ?? null,
        thumbnailUrl: media.get(a.id)?.thumbnailUrl ?? null,
        createdAt: a.created_at.toISOString(),
        readyAt: a.ready_at?.toISOString() ?? null,
        deletedAt: a.deleted_at?.toISOString() ?? null,
      })),
      nextCursor:
        rows.length > PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async takedown(admin: AdminActor, id: string, reason: string): Promise<void> {
    const asset = await this.prisma.videoAsset.findFirst({
      where: withDeleted({ id }),
      include: {
        post: { select: { id: true, status: true, deleted_at: true } },
      },
    });
    if (!asset) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Video not found.',
      });
    }
    // A post its author already deleted is not taken down again.
    const postLive =
      asset.post !== null &&
      asset.post.status !== 'removed' &&
      asset.post.deleted_at === null;
    if (asset.status === 'deleted' && !postLive) {
      throw new ConflictException({
        code: ErrorCode.CONTENT_INVALID_STATE,
        message: 'This video is already taken down.',
        details: { status: asset.status },
      });
    }
    // The post first: it disappears from feeds even if Bunny is down.
    if (asset.post && postLive) {
      await this.content.removePost(asset.post.id, reason);
    }
    await this.videos.markDeleted([asset.id]);
    if (!asset.purged_at) await this.videos.purgeNow(asset);
    await this.audit.record({
      adminId: admin.id,
      action: VIDEO_AUDIT.takedown,
      targetType: 'video_asset',
      targetId: asset.id,
      before: {
        status: asset.status,
        postId: asset.post?.id ?? null,
        postStatus: asset.post?.status ?? null,
      },
      after: {
        status: 'deleted',
        postRemoved: Boolean(asset.post && postLive),
        reason,
      },
      ip: admin.ip,
    });
  }

  async stats(): Promise<AdminVideoStatsDto> {
    const since = new Date(Date.now() - 7 * DAY_MS);
    const [groups, storage, uploads7d, failed7d] = await Promise.all([
      this.prisma.videoAsset.groupBy({
        by: ['status'],
        where: withDeleted({}),
        _count: { _all: true },
      }),
      this.prisma.videoAsset.aggregate({
        where: { status: 'ready' },
        _sum: { storage_bytes: true },
      }),
      this.prisma.videoAsset.count({
        where: withDeleted({ created_at: { gte: since } }),
      }),
      this.prisma.videoAsset.count({
        where: withDeleted<Prisma.VideoAssetWhereInput>({
          created_at: { gte: since },
          status: { in: ['failed', 'rejected'] },
        }),
      }),
    ]);
    return {
      byStatus: groups.map((g) => ({
        status: g.status,
        count: g._count._all,
      })),
      storageBytes: Number(storage._sum.storage_bytes ?? 0),
      uploads7d,
      failed7d,
    };
  }
}
