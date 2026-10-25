import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
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
import { CounterAggregator } from '../counters/counter-aggregator.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  AdminChannelDto,
  AdminChannelPostDto,
  AdminChannelRowDto,
  AdminChannelStatus,
  AdminChannelsQueryDto,
} from './admin-channels.dto';

const PAGE = 50;
type Page<T> = { items: T[]; nextCursor: string | null };

export const CHANNEL_AUDIT = {
  status: 'admin.channel.status',
  post: 'admin.channel_post.moderate',
} as const;

const missing = () =>
  new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Channel not found.',
  });

/**
 * Owner 2026-10-20 — admin panel → Media → Channels: every channel with
 * its open reports, hide (out of search, still readable by link) / close
 * (nobody but its admins sees it) / reopen, and removing one post. Every
 * change writes an audit row and tells the owner why. Reports about a
 * channel or a post also arrive in the shared moderation queue.
 */
@Injectable()
export class AdminChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditLogService,
    // Owner 2026-10-25 (DB audit finding 8): post_count of a hot channel.
    @Optional() private readonly counters?: CounterAggregator,
  ) {}

  async list(q: AdminChannelsQueryDto): Promise<Page<AdminChannelRowDto>> {
    const limit = q.limit ?? PAGE;
    const c = q.cursor ? decodeCursor(q.cursor) : undefined;
    const and: Prisma.ChannelWhereInput[] = [];
    if (q.status) and.push({ status: q.status });
    if (q.q) {
      const term = q.q.replace(/^@/, '');
      and.push({
        OR: [
          { title: { contains: term, mode: 'insensitive' } },
          { username: { contains: term.toLowerCase() } },
        ],
      });
    }
    if (c) {
      and.push({
        OR: [
          { created_at: { lt: c.createdAt } },
          { created_at: c.createdAt, id: { lt: c.id } },
        ],
      });
    }
    const rows = await this.prisma.channel.findMany({
      where: { AND: and },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { owner: { select: { first_name: true, last_name: true } } },
    });
    const slice = rows.slice(0, limit);
    const reports = await this.openReports(slice.map((r) => r.id));
    const last = slice[slice.length - 1];
    return {
      items: slice.map((r) => row(r, reports.get(r.id) ?? 0)),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async get(id: string): Promise<AdminChannelDto> {
    const ch = await this.prisma.channel.findFirst({
      where: { id },
      include: { owner: { select: { first_name: true, last_name: true } } },
    });
    if (!ch) throw missing();
    const [posts, reports] = await Promise.all([
      this.prisma.channelPost.findMany({
        where: withDeleted({ channel_id: id, deleted_at: null }),
        orderBy: { created_at: 'desc' },
        take: 30,
      }),
      this.openReports([id]),
    ]);
    return {
      ...row(ch, reports.get(id) ?? 0),
      description: ch.description,
      posts: posts.map((p): AdminChannelPostDto => ({
        id: p.id,
        body: p.body.slice(0, 500),
        status: p.status,
        viewCount: p.view_count,
        commentCount: p.comment_count,
        mediaCount: p.media_file_ids.length,
        hasVideo: p.video_asset_id !== null,
        createdAt: p.created_at.toISOString(),
      })),
    };
  }

  /** active ⇄ hidden ⇄ banned; the owner is told why when it is not
   * active. */
  async setStatus(
    admin: AdminActor,
    id: string,
    next: AdminChannelStatus,
    reason: string,
  ): Promise<AdminChannelDto> {
    const ch = await this.prisma.channel.findFirst({ where: { id } });
    if (!ch) throw missing();
    if (ch.status === next) {
      throw new ConflictException({
        code: ErrorCode.CONTENT_INVALID_STATE,
        message: `The channel is already ${next}.`,
        details: { status: ch.status },
      });
    }
    await withTxRetry(this.prisma, async (tx) => {
      await tx.channel.update({
        where: { id },
        data: {
          status: next,
          moderation_note: next === 'active' ? null : reason || null,
        },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: CHANNEL_AUDIT.status,
          targetType: 'channel',
          targetId: id,
          before: { status: ch.status },
          after: { status: next, reason },
          ip: admin.ip,
        },
        tx,
      );
    });
    if (next !== 'active') {
      await this.notifications.emit({
        type: 'moderation_notice',
        recipientId: ch.owner_id,
        payload: { reason, channelId: id },
      });
    }
    return this.get(id);
  }

  async moderatePost(
    admin: AdminActor,
    channelId: string,
    postId: string,
    action: 'remove' | 'restore',
    reason: string,
  ): Promise<AdminChannelDto> {
    const post = await this.prisma.channelPost.findFirst({
      where: withDeleted({ id: postId, channel_id: channelId }),
    });
    if (!post) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Post not found.',
      });
    }
    const wasLive = post.status === 'active' && post.deleted_at === null;
    const nextLive = action === 'restore';
    if (wasLive === nextLive) {
      throw new ConflictException({
        code: ErrorCode.CONTENT_INVALID_STATE,
        message: `The post is already ${wasLive ? 'published' : 'removed'}.`,
      });
    }
    await withTxRetry(this.prisma, async (tx) => {
      await tx.channelPost.update({
        where: { id: postId },
        data: nextLive
          ? { status: 'active', deleted_at: null }
          : { status: 'removed' },
      });
      if (!this.counters) {
        await tx.channel.update({
          where: { id: channelId },
          data: { post_count: { increment: nextLive ? 1 : -1 } },
        });
      }
      await this.audit.record(
        {
          adminId: admin.id,
          action: CHANNEL_AUDIT.post,
          targetType: 'channel_post',
          targetId: postId,
          before: { status: post.status },
          after: { action, reason },
          ip: admin.ip,
        },
        tx,
      );
    });
    // After the commit: the number is applied by the counter flusher.
    if (this.counters) {
      await this.counters.bump(
        'channel',
        channelId,
        'post_count',
        nextLive ? 1 : -1,
      );
    }
    if (!nextLive) {
      await this.notifications.emit({
        type: 'moderation_notice',
        recipientId: post.author_id,
        payload: { reason, channelId },
      });
    }
    return this.get(channelId);
  }

  private async openReports(ids: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (ids.length === 0) return out;
    const posts = await this.prisma.channelPost.findMany({
      where: withDeleted({ channel_id: { in: ids } }),
      select: { id: true, channel_id: true },
    });
    const byPost = new Map(posts.map((p) => [p.id, p.channel_id]));
    const reports = await this.prisma.report.findMany({
      where: {
        status: 'open',
        OR: [
          { target_type: 'channel', target_id: { in: ids } },
          {
            target_type: 'channel_post',
            target_id: { in: [...byPost.keys()] },
          },
        ],
      },
      select: { target_type: true, target_id: true },
    });
    for (const r of reports) {
      const channelId =
        r.target_type === 'channel' ? r.target_id : byPost.get(r.target_id);
      if (channelId) out.set(channelId, (out.get(channelId) ?? 0) + 1);
    }
    return out;
  }
}

function row(
  ch: {
    id: string;
    title: string;
    username: string;
    owner_id: string;
    status: string;
    subscriber_count: number;
    post_count: number;
    moderation_note: string | null;
    last_post_at: Date | null;
    created_at: Date;
    owner: { first_name: string | null; last_name: string | null } | null;
  },
  openReports: number,
): AdminChannelRowDto {
  return {
    id: ch.id,
    title: ch.title,
    username: ch.username,
    ownerId: ch.owner_id,
    ownerName:
      [ch.owner?.first_name, ch.owner?.last_name].filter(Boolean).join(' ') ||
      '—',
    status: ch.status as AdminChannelStatus,
    subscriberCount: ch.subscriber_count,
    postCount: ch.post_count,
    openReports,
    moderationNote: ch.moderation_note,
    lastPostAt: ch.last_post_at ? ch.last_post_at.toISOString() : null,
    createdAt: ch.created_at.toISOString(),
  };
}
