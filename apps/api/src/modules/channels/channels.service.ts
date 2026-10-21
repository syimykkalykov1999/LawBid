import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Channel, type ChannelPost } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { BlocksService } from '../blocks/blocks.service';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import { FilesService } from '../files/files.service';
import { decodeOffset, encodeOffset } from '../recommendations/offset-cursor';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UserBriefService } from '../user-brief/user-brief.service';
import type {
  VideoUploadDto,
  CreateVideoUploadDto,
} from '../videos/videos.dto';
import { VideosService } from '../videos/videos.service';
import type {
  AddChannelAdminDto,
  ChannelAdminDto,
  ChannelCommentDto,
  ChannelDto,
  ChannelPostDto,
  ChannelRole,
  ChannelStatus,
  ChannelSubscriptionDto,
  CreateChannelDto,
  CreateChannelPostDto,
  UpdateChannelDto,
} from './channels.dto';
import { CHANNEL_REACTIONS } from './channels.dto';
import { UsernamePolicyService } from '../usernames/username-policy.service';

export const CHANNELS_FLAG = 'channels';
const PAGE = 20;
const LIST_MAX = 100;
const FANOUT_BATCH = 200;

export interface ChannelPage<T> {
  items: T[];
  nextCursor: string | null;
}

const notFound = (what = 'Channel') =>
  new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: `${what} not found.`,
  });

const forbidden = (message: string) =>
  new ForbiddenException({ code: ErrorCode.FORBIDDEN, message });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Owner 2026-10-20 — channels like Telegram, for an attorney or a company:
 * a title, an avatar, a description and an @username; only the owner and
 * the admins they add post (text, photos, a video); subscribers read,
 * react with one emoji and — when the channel allows — comment; every post
 * counts its viewers once; a new post notifies the subscribers who did
 * not mute the channel. Moderation: reports reach the shared moderation
 * queue (channel / channel_post), the admin panel lists and closes channels.
 */

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly videos: VideosService,
    private readonly blocks: BlocksService,
    private readonly settings: AppSettingsService,
    private readonly limits: UsageLimitsService,
    private readonly flags: FeatureFlagsService,
    private readonly briefs: UserBriefService,
    private readonly notifications: NotificationsService,
    private readonly usernames: UsernamePolicyService,
    private readonly reco: RecommendationsService,
  ) {}

  async assertEnabled(): Promise<void> {
    if (!(await this.flags.isEnabled(CHANNELS_FLAG, true))) {
      throw new ForbiddenException({
        code: ErrorCode.FEATURE_DISABLED,
        message: 'Channels are not available yet.',
      });
    }
  }

  // ── channels ─────────────────────────────────────────────────────────

  /** GET /channels?scope=&q= */
  async list(
    user: RequestUser,
    scope: 'discover' | 'subscribed' | 'managed' = 'discover',
    q?: string,
    cursor?: string,
  ): Promise<ChannelPage<ChannelDto>> {
    await this.assertEnabled();
    const me = user.sub;
    let rows: Channel[];
    if (scope === 'subscribed') {
      const subs = await this.prisma.channelSubscription.findMany({
        where: { user_id: me, channel: { status: { not: 'banned' } } },
        select: { channel: true },
        take: LIST_MAX,
      });
      rows = subs.map((s) => s.channel);
      rows.sort(
        (a, b) =>
          (b.last_post_at ?? b.created_at).getTime() -
          (a.last_post_at ?? a.created_at).getTime(),
      );
    } else if (scope === 'managed') {
      const adm = await this.prisma.channelAdmin.findMany({
        where: { user_id: me },
        select: { channel: true },
        take: LIST_MAX,
      });
      rows = adm.map((a) => a.channel);
      rows.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    } else {
      const term = (q ?? '').trim().replace(/^@/, '');
      if (!term) return this.recommended(me, cursor);
      const hidden = await this.blocks.hiddenIds(me);
      rows = await this.prisma.channel.findMany({
        where: {
          status: 'active',
          owner_id: { notIn: [...hidden] },
          ...(term
            ? {
                OR: [
                  { title: { contains: term, mode: 'insensitive' } },
                  { username: { contains: term.toLowerCase() } },
                ],
              }
            : { post_count: { gt: 0 } }),
        },
        orderBy: [{ subscriber_count: 'desc' }, { created_at: 'desc' }],
        take: 30,
      });
    }
    return { items: await this.presentChannels(rows, me), nextCursor: null };
  }

  /**
   * «Discover» without a search: channels ranked for me (shared people,
   * practice, region, activity), from the cached snapshot, paged by cursor.
   */
  private async recommended(
    me: string,
    cursor?: string,
  ): Promise<ChannelPage<ChannelDto>> {
    const ranked = await this.reco.communities(me, 'channel');
    const start = decodeOffset(cursor);
    const ids = ranked.slice(start, start + 30).map((r) => r.id);
    const nextCursor =
      start + 30 < ranked.length ? encodeOffset(start + 30) : null;
    if (ids.length === 0) return { items: [], nextCursor };
    const found = await this.prisma.channel.findMany({
      where: { id: { in: ids }, status: 'active' },
    });
    const byId = new Map(found.map((c) => [c.id, c]));
    const subscribed = new Set(
      (
        await this.prisma.channelSubscription.findMany({
          where: { user_id: me, channel_id: { in: ids } },
          select: { channel_id: true },
        })
      ).map((s) => s.channel_id),
    );
    const rows = ids.flatMap((id) => {
      const c = byId.get(id);
      return c && !subscribed.has(id) ? [c] : [];
    });
    return { items: await this.presentChannels(rows, me), nextCursor };
  }

  /** GET /channels/:ref — by id or @username. */
  async get(user: RequestUser, ref: string): Promise<ChannelDto> {
    await this.assertEnabled();
    const ch = await this.findReadable(user.sub, ref);
    const [dto] = await this.presentChannels([ch], user.sub);
    return dto;
  }

  /** POST /channels */
  async create(user: RequestUser, dto: CreateChannelDto): Promise<ChannelDto> {
    await this.assertEnabled();
    const me = user.sub;
    await this.assertVerifiedAttorney(me);
    const handle = await this.usernames.assertAvailable(
      dto.username,
      'channel',
      { userId: me },
      ErrorCode.CHANNEL_USERNAME_TAKEN,
      { title: dto.title },
    );
    const max = await this.settings.number('channels.max_owned');
    const owned = await this.prisma.channel.count({ where: { owner_id: me } });
    if (owned >= max) {
      throw new ConflictException({
        code: ErrorCode.CHANNEL_LIMIT_REACHED,
        message: 'You have the most channels allowed.',
        details: { max },
      });
    }
    if (dto.avatarFileId) {
      await this.files.assertAttachable(me, dto.avatarFileId, ['avatar']);
    }
    await this.limits.consume('channel_create', me);
    try {
      const ch = await this.prisma.channel.create({
        data: {
          owner_id: me,
          title: dto.title,
          username: handle,
          description: dto.description || null,
          avatar_file_id: dto.avatarFileId ?? null,
          comments_enabled: dto.commentsEnabled ?? true,
          subscriber_count: 1,
          admins: { create: { user_id: me, role: 'owner' } },
          subscriptions: { create: { user_id: me } },
        },
      });
      const [out] = await this.presentChannels([ch], me);
      return out;
    } catch (e) {
      if (isUnique(e)) throw usernameTaken();
      throw e;
    }
  }

  /** PATCH /channels/:id */
  async update(
    user: RequestUser,
    id: string,
    dto: UpdateChannelDto,
  ): Promise<ChannelDto> {
    await this.assertEnabled();
    const { channel, role } = await this.asAdmin(user.sub, id);
    const data: Prisma.ChannelUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) {
      data.description = dto.description || null;
    }
    if (dto.commentsEnabled !== undefined) {
      data.comments_enabled = dto.commentsEnabled;
    }
    if (dto.username !== undefined && dto.username !== channel.username) {
      if (role !== 'owner')
        throw forbidden('Only the owner renames @username.');
      const wait = await this.usernames.nextChangeAt(
        channel.username_changed_at,
      );
      if (wait) {
        throw new ConflictException({
          code: ErrorCode.USERNAME_CHANGE_TOO_SOON,
          message: 'The @username was changed recently.',
          details: { nextChangeAt: wait.toISOString() },
        });
      }
      data.username = await this.usernames.assertAvailable(
        dto.username,
        'channel',
        { userId: user.sub, owner: { type: 'channel', id } },
        ErrorCode.CHANNEL_USERNAME_TAKEN,
        { title: dto.title ?? channel.title },
      );
      data.username_changed_at = new Date();
    }
    if (dto.avatarFileId) {
      await this.files.assertAttachable(user.sub, dto.avatarFileId, ['avatar']);
      data.avatar_file = { connect: { id: dto.avatarFileId } };
    } else if (dto.removeAvatar) {
      data.avatar_file = { disconnect: true };
    }
    try {
      const ch = await this.prisma.channel.update({ where: { id }, data });
      const [out] = await this.presentChannels([ch], user.sub);
      return out;
    } catch (e) {
      if (isUnique(e)) throw usernameTaken();
      throw e;
    }
  }

  /** DELETE /channels/:id — the owner closes the channel for everyone. */
  async remove(user: RequestUser, id: string): Promise<void> {
    await this.assertEnabled();
    const { role } = await this.asAdmin(user.sub, id);
    if (role !== 'owner') throw forbidden('Only the owner deletes a channel.');
    await this.prisma.channel.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  // ── subscription ─────────────────────────────────────────────────────

  async subscribe(
    user: RequestUser,
    id: string,
  ): Promise<ChannelSubscriptionDto> {
    await this.assertEnabled();
    const ch = await this.findReadable(user.sub, id);
    await this.blocks.assertNotBlocked(user.sub, ch.owner_id);
    const { count } = await this.prisma.channelSubscription.createMany({
      data: [{ channel_id: ch.id, user_id: user.sub }],
      skipDuplicates: true,
    });
    if (count > 0) {
      await this.prisma.channel.update({
        where: { id: ch.id },
        data: { subscriber_count: { increment: 1 } },
      });
    }
    return this.subscription(ch.id, user.sub);
  }

  async unsubscribe(
    user: RequestUser,
    id: string,
  ): Promise<ChannelSubscriptionDto> {
    await this.assertEnabled();
    const ch = await this.findReadable(user.sub, id);
    const { count } = await this.prisma.channelSubscription.deleteMany({
      where: { channel_id: ch.id, user_id: user.sub },
    });
    if (count > 0) {
      await this.prisma.channel.update({
        where: { id: ch.id },
        data: { subscriber_count: { decrement: 1 } },
      });
    }
    return this.subscription(ch.id, user.sub);
  }

  async mute(
    user: RequestUser,
    id: string,
    muted: boolean,
  ): Promise<ChannelSubscriptionDto> {
    await this.assertEnabled();
    const ch = await this.findReadable(user.sub, id);
    const { count } = await this.prisma.channelSubscription.updateMany({
      where: { channel_id: ch.id, user_id: user.sub },
      data: { muted },
    });
    if (count === 0) throw notFound('Subscription');
    return this.subscription(ch.id, user.sub);
  }

  private async subscription(
    channelId: string,
    userId: string,
  ): Promise<ChannelSubscriptionDto> {
    const [sub, ch] = await Promise.all([
      this.prisma.channelSubscription.findUnique({
        where: {
          channel_id_user_id: { channel_id: channelId, user_id: userId },
        },
      }),
      this.prisma.channel.findUnique({
        where: { id: channelId },
        select: { subscriber_count: true },
      }),
    ]);
    return {
      isSubscribed: sub !== null,
      isMuted: sub?.muted ?? false,
      subscriberCount: ch?.subscriber_count ?? 0,
    };
  }

  // ── admins ───────────────────────────────────────────────────────────

  async admins(user: RequestUser, id: string): Promise<ChannelAdminDto[]> {
    await this.assertEnabled();
    await this.asAdmin(user.sub, id);
    const rows = await this.prisma.channelAdmin.findMany({
      where: { channel_id: id },
      orderBy: [{ role: 'desc' }, { created_at: 'asc' }],
    });
    const briefs = await this.briefs.many(rows.map((r) => r.user_id));
    return rows.flatMap((r) => {
      const u = briefs.get(r.user_id);
      return u ? [{ user: u, role: r.role as ChannelRole }] : [];
    });
  }

  async addAdmin(
    user: RequestUser,
    id: string,
    dto: AddChannelAdminDto,
  ): Promise<ChannelAdminDto[]> {
    await this.assertEnabled();
    const { role } = await this.asAdmin(user.sub, id);
    if (role !== 'owner') throw forbidden('Only the owner adds admins.');
    const name = dto.username.replace(/^@/, '').toLowerCase();
    const target = await this.prisma.user.findFirst({
      where: {
        status: 'active',
        OR: [
          { attorney_profile: { username_lower: name } },
          { client_profile: { username_lower: name } },
        ],
      },
      select: { id: true },
    });
    if (!target) throw notFound('User');
    await this.blocks.assertNotBlocked(user.sub, target.id);
    await this.assertCanPublish(target.id);
    const max = await this.settings.number('channels.max_admins');
    const count = await this.prisma.channelAdmin.count({
      where: { channel_id: id },
    });
    if (count >= max) {
      throw new ConflictException({
        code: ErrorCode.CHANNEL_LIMIT_REACHED,
        message: 'The channel has the most admins allowed.',
        details: { max },
      });
    }
    await this.prisma.channelAdmin.createMany({
      data: [{ channel_id: id, user_id: target.id, role: 'admin' }],
      skipDuplicates: true,
    });
    return this.admins(user, id);
  }

  /** The owner removes an admin; an admin may leave (userId = me). */
  async removeAdmin(
    user: RequestUser,
    id: string,
    userId: string,
  ): Promise<void> {
    await this.assertEnabled();
    const { role } = await this.asAdmin(user.sub, id);
    if (userId !== user.sub && role !== 'owner') {
      throw forbidden('Only the owner removes admins.');
    }
    const target = await this.prisma.channelAdmin.findUnique({
      where: { channel_id_user_id: { channel_id: id, user_id: userId } },
    });
    if (!target) throw notFound('Admin');
    if (target.role === 'owner') throw forbidden('The owner stays an admin.');
    await this.prisma.channelAdmin.delete({
      where: { channel_id_user_id: { channel_id: id, user_id: userId } },
    });
  }

  // ── posts ────────────────────────────────────────────────────────────

  /** GET /channels/:id/posts — newest first. */
  async posts(
    user: RequestUser,
    id: string,
    cursor?: string,
    limit = PAGE,
  ): Promise<ChannelPage<ChannelPostDto>> {
    await this.assertEnabled();
    const ch = await this.findReadable(user.sub, id);
    const c = cursor ? decodeCursor(cursor) : null;
    const rows = await this.prisma.channelPost.findMany({
      where: {
        channel_id: ch.id,
        status: 'active',
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
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: await this.presentPosts(page, user.sub),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  /** GET /channels/:id/posts/:postId */
  async post(
    user: RequestUser,
    id: string,
    postId: string,
  ): Promise<ChannelPostDto> {
    await this.assertEnabled();
    const ch = await this.findReadable(user.sub, id);
    const row = await this.prisma.channelPost.findFirst({
      where: { id: postId, channel_id: ch.id, status: 'active' },
    });
    if (!row) throw notFound('Post');
    const [dto] = await this.presentPosts([row], user.sub);
    return dto;
  }

  /** POST /channels/video-uploads — Bunny credentials for a channel video. */
  async createVideoUpload(
    user: RequestUser,
    dto: CreateVideoUploadDto,
  ): Promise<VideoUploadDto> {
    await this.assertEnabled();
    await this.assertCanPublish(user.sub);
    return this.videos.createUpload(user.sub, dto, { skipEntitlement: true });
  }

  /** POST /channels/:id/posts — admins only; subscribers are notified. */
  async createPost(
    user: RequestUser,
    id: string,
    dto: CreateChannelPostDto,
  ): Promise<ChannelPostDto> {
    await this.assertEnabled();
    const me = user.sub;
    const { channel } = await this.asAdmin(me, id);
    if (channel.status !== 'active') {
      throw forbidden('This channel is closed by moderation.');
    }
    await this.assertCanPublish(me);
    const body = (dto.body ?? '').trim();
    const mediaIds = [...new Set(dto.mediaFileIds ?? [])];
    const maxMedia = await this.settings.number('channels.max_post_media');
    if (mediaIds.length > maxMedia) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `A post has up to ${maxMedia} photos.`,
        details: { field: 'mediaFileIds' },
      });
    }
    if (!body && mediaIds.length === 0 && !dto.videoAssetId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Empty post.',
        details: { field: 'body' },
      });
    }
    for (const fid of mediaIds) {
      await this.files.assertAttachable(me, fid, ['post_image']);
    }
    if (dto.videoAssetId) await this.videos.takeReady(me, dto.videoAssetId);
    await this.limits.consume('channel_post', me);
    const row = await this.prisma.$transaction(async (tx) => {
      const p = await tx.channelPost.create({
        data: {
          channel_id: channel.id,
          author_id: me,
          body,
          media_file_ids: mediaIds,
          video_asset_id: dto.videoAssetId ?? null,
        },
      });
      await tx.channel.update({
        where: { id: channel.id },
        data: { post_count: { increment: 1 }, last_post_at: p.created_at },
      });
      return p;
    });
    void this.fanout(channel, row).catch((e: unknown) =>
      this.logger.warn(`channel fan-out failed: ${String(e)}`),
    );
    const [out] = await this.presentPosts([row], me);
    return out;
  }

  async editPost(
    user: RequestUser,
    id: string,
    postId: string,
    body: string,
  ): Promise<ChannelPostDto> {
    await this.assertEnabled();
    await this.asAdmin(user.sub, id);
    const post = await this.prisma.channelPost.findFirst({
      where: { id: postId, channel_id: id, status: 'active' },
    });
    if (!post) throw notFound('Post');
    const row = await this.prisma.channelPost.update({
      where: { id: postId },
      data: { body: body.trim(), edited_at: new Date() },
    });
    const [dto] = await this.presentPosts([row], user.sub);
    return dto;
  }

  async removePost(
    user: RequestUser,
    id: string,
    postId: string,
  ): Promise<void> {
    await this.assertEnabled();
    await this.asAdmin(user.sub, id);
    const post = await this.prisma.channelPost.findFirst({
      where: { id: postId, channel_id: id },
    });
    if (!post) throw notFound('Post');
    await this.prisma.$transaction([
      this.prisma.channelPost.update({
        where: { id: postId },
        data: { deleted_at: new Date(), video_asset_id: null },
      }),
      ...(post.status === 'active'
        ? [
            this.prisma.channel.update({
              where: { id },
              data: { post_count: { decrement: 1 } },
            }),
          ]
        : []),
    ]);
    if (post.video_asset_id)
      await this.videos.markDeleted([post.video_asset_id]);
  }

  /** POST /channels/:id/views — each person counts once per post. */
  async markViewed(
    user: RequestUser,
    id: string,
    postIds: string[],
  ): Promise<void> {
    await this.assertEnabled();
    const ch = await this.findReadable(user.sub, id);
    if (postIds.length === 0) return;
    const role = await this.roleOf(user.sub, ch.id);
    if (role) return; // admins reading their own channel are not views
    const valid = await this.prisma.channelPost.findMany({
      where: { id: { in: postIds }, channel_id: ch.id, status: 'active' },
      select: { id: true },
    });
    if (valid.length === 0) return;
    const fresh = await this.prisma.$queryRaw<{ post_id: string }[]>`
      INSERT INTO channel_post_views (post_id, user_id)
      SELECT unnest(${valid.map((v) => v.id)}::UUID[]), ${user.sub}::UUID
      ON CONFLICT DO NOTHING
      RETURNING post_id::TEXT AS post_id`;
    if (fresh.length > 0) {
      await this.prisma.channelPost.updateMany({
        where: { id: { in: fresh.map((f) => f.post_id) } },
        data: { view_count: { increment: 1 } },
      });
    }
  }

  /** POST /channels/:id/posts/:postId/share — one share per person and
   * post per 24 h counts. */
  async sharePost(
    user: RequestUser,
    id: string,
    postId: string,
  ): Promise<void> {
    await this.assertEnabled();
    const ch = await this.findReadable(user.sub, id);
    const post = await this.prisma.channelPost.findFirst({
      where: { id: postId, channel_id: ch.id, status: 'active' },
      select: { id: true },
    });
    if (!post) throw notFound('Post');
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const already = await this.prisma.channelPostShare.findFirst({
      where: { post_id: post.id, user_id: user.sub, created_at: { gt: since } },
      select: { id: true },
    });
    if (already) return;
    await this.prisma.channelPostShare.create({
      data: { post_id: post.id, user_id: user.sub },
    });
    await this.prisma.channelPost.update({
      where: { id: post.id },
      data: { share_count: { increment: 1 } },
    });
  }

  async react(
    user: RequestUser,
    id: string,
    postId: string,
    emoji: string | null,
  ): Promise<ChannelPostDto> {
    await this.assertEnabled();
    const ch = await this.findReadable(user.sub, id);
    const post = await this.prisma.channelPost.findFirst({
      where: { id: postId, channel_id: ch.id, status: 'active' },
    });
    if (!post) throw notFound('Post');
    if (emoji === null) {
      await this.prisma.channelReaction.deleteMany({
        where: { post_id: postId, user_id: user.sub },
      });
    } else {
      await this.prisma.channelReaction.upsert({
        where: { post_id_user_id: { post_id: postId, user_id: user.sub } },
        create: { post_id: postId, user_id: user.sub, emoji },
        update: { emoji },
      });
    }
    const [dto] = await this.presentPosts([post], user.sub);
    return dto;
  }

  // ── comments ─────────────────────────────────────────────────────────

  async comments(
    user: RequestUser,
    id: string,
    postId: string,
    cursor?: string,
    limit = 30,
  ): Promise<ChannelPage<ChannelCommentDto>> {
    await this.assertEnabled();
    const ch = await this.findReadable(user.sub, id);
    const post = await this.prisma.channelPost.findFirst({
      where: { id: postId, channel_id: ch.id, status: 'active' },
      select: { id: true },
    });
    if (!post) throw notFound('Post');
    const c = cursor ? decodeCursor(cursor) : null;
    const hidden = await this.blocks.hiddenIds(user.sub);
    const rows = await this.prisma.channelComment.findMany({
      where: {
        post_id: postId,
        author_id: { notIn: [...hidden] },
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
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const role = await this.roleOf(user.sub, ch.id);
    const briefs = await this.briefs.many(page.map((r) => r.author_id));
    const last = page[page.length - 1];
    return {
      items: page.flatMap((r) => {
        const author = briefs.get(r.author_id);
        return author
          ? [
              {
                id: r.id,
                author,
                body: r.body,
                createdAt: r.created_at.toISOString(),
                canDelete: role !== null || r.author_id === user.sub,
              },
            ]
          : [];
      }),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async addComment(
    user: RequestUser,
    id: string,
    postId: string,
    body: string,
  ): Promise<ChannelCommentDto> {
    await this.assertEnabled();
    const me = user.sub;
    const ch = await this.findReadable(me, id);
    if (!ch.comments_enabled) {
      throw forbidden('Comments are off in this channel.');
    }
    if (ch.status !== 'active') throw forbidden('This channel is closed.');
    await this.blocks.assertNotBlocked(me, ch.owner_id);
    await this.assertCanPublish(me);
    const post = await this.prisma.channelPost.findFirst({
      where: { id: postId, channel_id: ch.id, status: 'active' },
      select: { id: true },
    });
    if (!post) throw notFound('Post');
    await this.limits.consume('channel_comment', me);
    const row = await this.prisma.$transaction(async (tx) => {
      const c = await tx.channelComment.create({
        data: { post_id: postId, author_id: me, body },
      });
      await tx.channelPost.update({
        where: { id: postId },
        data: { comment_count: { increment: 1 } },
      });
      return c;
    });
    const briefs = await this.briefs.many([me]);
    const author = briefs.get(me);
    if (!author) throw notFound('User');
    return {
      id: row.id,
      author,
      body: row.body,
      createdAt: row.created_at.toISOString(),
      canDelete: true,
    };
  }

  async removeComment(
    user: RequestUser,
    id: string,
    postId: string,
    commentId: string,
  ): Promise<void> {
    await this.assertEnabled();
    const ch = await this.findReadable(user.sub, id);
    const comment = await this.prisma.channelComment.findFirst({
      where: { id: commentId, post_id: postId, post: { channel_id: ch.id } },
    });
    if (!comment) throw notFound('Comment');
    const role = await this.roleOf(user.sub, ch.id);
    if (!role && comment.author_id !== user.sub) {
      throw forbidden('Not your comment.');
    }
    await this.prisma.$transaction([
      this.prisma.channelComment.update({
        where: { id: commentId },
        data: { deleted_at: new Date() },
      }),
      this.prisma.channelPost.update({
        where: { id: postId },
        data: { comment_count: { decrement: 1 } },
      }),
    ]);
  }

  // ── helpers ──────────────────────────────────────────────────────────

  /** A channel [userId] may open: not deleted, and not banned unless an
   * admin of it. */
  private async findReadable(userId: string, ref: string): Promise<Channel> {
    const key = ref.replace(/^@/, '');
    const ch = await this.prisma.channel.findFirst({
      where: UUID.test(key) ? { id: key } : { username: key.toLowerCase() },
    });
    if (!ch) throw notFound();
    if (ch.status === 'banned' && !(await this.roleOf(userId, ch.id))) {
      throw notFound();
    }
    if (await this.blocks.isBlockedEitherWay(userId, ch.owner_id)) {
      throw notFound();
    }
    return ch;
  }

  private async roleOf(
    userId: string,
    channelId: string,
  ): Promise<ChannelRole | null> {
    const row = await this.prisma.channelAdmin.findUnique({
      where: { channel_id_user_id: { channel_id: channelId, user_id: userId } },
      select: { role: true },
    });
    return (row?.role as ChannelRole | undefined) ?? null;
  }

  private async asAdmin(
    userId: string,
    id: string,
  ): Promise<{ channel: Channel; role: ChannelRole }> {
    const channel = await this.prisma.channel.findFirst({ where: { id } });
    if (!channel) throw notFound();
    const role = await this.roleOf(userId, id);
    if (!role) {
      // Do not reveal a banned channel to a stranger.
      if (channel.status === 'banned') throw notFound();
      throw forbidden('Only channel admins can do this.');
    }
    return { channel, role };
  }

  /** Verified attorney (channels are for attorneys and their companies). */
  private async assertVerifiedAttorney(userId: string): Promise<void> {
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        status: true,
        attorney_profile: { select: { verification_status: true } },
      },
    });
    if (
      me?.status !== 'active' ||
      me.role !== 'attorney' ||
      me.attorney_profile?.verification_status !== 'verified'
    ) {
      throw new ForbiddenException({
        code: ErrorCode.POST_NOT_ALLOWED,
        message: 'Only verified attorneys can create channels.',
      });
    }
  }

  /** The same bar as a feed post: a verified attorney, or a client with a
   * verified phone. */
  private async assertCanPublish(userId: string): Promise<void> {
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        status: true,
        phone_verified_at: true,
        attorney_profile: { select: { verification_status: true } },
        client_profile: { select: { user_id: true } },
      },
    });
    const attorneyOk =
      me?.role === 'attorney' &&
      me.attorney_profile?.verification_status === 'verified';
    const clientOk =
      me?.role === 'client' &&
      me.phone_verified_at != null &&
      me.client_profile != null;
    if (me?.status !== 'active' || !(attorneyOk || clientOk)) {
      throw new ForbiddenException({
        code: ErrorCode.POST_NOT_ALLOWED,
        message: 'Only verified accounts can publish.',
      });
    }
  }

  /** Tells every subscriber who has not muted the channel, in batches. */
  private async fanout(channel: Channel, post: ChannelPost): Promise<void> {
    const hidden = await this.blocks.hiddenIds(post.author_id);
    let after: string | undefined;
    for (;;) {
      const subs = await this.prisma.channelSubscription.findMany({
        where: {
          channel_id: channel.id,
          muted: false,
          user_id: { notIn: [...hidden, post.author_id] },
        },
        orderBy: { user_id: 'asc' },
        take: FANOUT_BATCH,
        ...(after
          ? {
              cursor: {
                channel_id_user_id: { channel_id: channel.id, user_id: after },
              },
              skip: 1,
            }
          : {}),
        select: { user_id: true },
      });
      if (subs.length === 0) return;
      await Promise.all(
        subs.map((s) =>
          this.notifications.emit({
            type: 'channel_post',
            recipientId: s.user_id,
            payload: {
              channelId: channel.id,
              channelTitle: channel.title,
              channelUsername: channel.username,
              postId: post.id,
            },
          }),
        ),
      );
      after = subs[subs.length - 1].user_id;
      if (subs.length < FANOUT_BATCH) return;
    }
  }

  private async presentChannels(
    rows: Channel[],
    viewerId: string,
  ): Promise<ChannelDto[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [briefs, avatars, subs, roles] = await Promise.all([
      this.briefs.many(rows.map((r) => r.owner_id)),
      this.files.avatarUrlsMany(rows.map((r) => r.avatar_file_id)),
      this.prisma.channelSubscription.findMany({
        where: { user_id: viewerId, channel_id: { in: ids } },
        select: { channel_id: true, muted: true },
      }),
      this.prisma.channelAdmin.findMany({
        where: { user_id: viewerId, channel_id: { in: ids } },
        select: { channel_id: true, role: true },
      }),
    ]);
    const subBy = new Map(subs.map((s) => [s.channel_id, s]));
    const roleBy = new Map(roles.map((r) => [r.channel_id, r.role]));
    return rows.flatMap((r) => {
      const owner = briefs.get(r.owner_id);
      if (!owner) return [];
      const role = (roleBy.get(r.id) as ChannelRole | undefined) ?? null;
      return [
        {
          id: r.id,
          title: r.title,
          username: r.username,
          description: r.description,
          avatarUrl: r.avatar_file_id
            ? (avatars.get(r.avatar_file_id)?.url256 ?? null)
            : null,
          commentsEnabled: r.comments_enabled,
          // Moderation state is the admins' business only.
          status: role ? (r.status as ChannelStatus) : 'active',
          subscriberCount: r.subscriber_count,
          postCount: r.post_count,
          owner,
          isSubscribed: subBy.has(r.id),
          isMuted: subBy.get(r.id)?.muted ?? false,
          myRole: role,
          lastPostAt: r.last_post_at ? r.last_post_at.toISOString() : null,
          createdAt: r.created_at.toISOString(),
        },
      ];
    });
  }

  private async presentPosts(
    rows: ChannelPost[],
    viewerId: string,
  ): Promise<ChannelPostDto[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const fileIds = rows.flatMap((r) => r.media_file_ids);
    const assetIds = rows
      .map((r) => r.video_asset_id)
      .filter((x): x is string => !!x);
    const [briefs, photos, assets, counts, mine] = await Promise.all([
      this.briefs.many(rows.map((r) => r.author_id)),
      this.files.postImageUrls(fileIds),
      assetIds.length
        ? this.prisma.videoAsset.findMany({ where: { id: { in: assetIds } } })
        : Promise.resolve([]),
      this.prisma.channelReaction.groupBy({
        by: ['post_id', 'emoji'],
        where: { post_id: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.channelReaction.findMany({
        where: { post_id: { in: ids }, user_id: viewerId },
        select: { post_id: true, emoji: true },
      }),
    ]);
    const videos = await this.videos.present(assets);
    const mineBy = new Map(mine.map((m) => [m.post_id, m.emoji]));
    const order = new Map<string, number>(
      CHANNEL_REACTIONS.map((e, i) => [e as string, i]),
    );
    return rows.flatMap((r) => {
      const author = briefs.get(r.author_id);
      if (!author) return [];
      return [
        {
          id: r.id,
          channelId: r.channel_id,
          author,
          body: r.body,
          media: r.media_file_ids.flatMap((fid) => {
            const u = photos.get(fid);
            return u
              ? [{ fileId: fid, url: u.mediumUrl, previewUrl: u.previewUrl }]
              : [];
          }),
          video: r.video_asset_id
            ? (videos.get(r.video_asset_id) ?? null)
            : null,
          viewCount: r.view_count,
          commentCount: r.comment_count,
          shareCount: r.share_count,
          reactions: counts
            .filter((c) => c.post_id === r.id)
            .map((c) => ({ emoji: c.emoji, count: c._count._all }))
            .sort(
              (a, b) =>
                b.count - a.count ||
                (order.get(a.emoji) ?? 9) - (order.get(b.emoji) ?? 9),
            ),
          myReaction: mineBy.get(r.id) ?? null,
          createdAt: r.created_at.toISOString(),
          editedAt: r.edited_at ? r.edited_at.toISOString() : null,
        },
      ];
    });
  }
}

function usernameTaken(): ConflictException {
  return new ConflictException({
    code: ErrorCode.CHANNEL_USERNAME_TAKEN,
    message: 'This @username is taken.',
  });
}

function isUnique(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
  );
}
