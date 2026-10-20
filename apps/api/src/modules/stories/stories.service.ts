import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Story } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { BlocksService } from '../blocks/blocks.service';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import { FilesService } from '../files/files.service';
import { UserBriefService } from '../user-brief/user-brief.service';
import type { UserBriefDto } from '../user-brief/user-brief.dto';
import { playedSec } from '../videos/videos.service';
import type { VideoUploadDto } from '../videos/videos.dto';
import { VideosService } from '../videos/videos.service';
import type { PostVideoDto } from '../videos/videos.dto';
import {
  STORY_AUDIENCES,
  STORY_KINDS,
  type CreateStoryDto,
  type CreateStoryVideoUploadDto,
  type StoryAudience,
  type StoryDto,
  type StoryKind,
  type StoryOverlayDto,
  type StorySettingsDto,
  type StoryTrayItemDto,
  type StoryViewerDto,
  type UpdateStorySettingsDto,
} from './stories.dto';
import { liveOwn, visibleToViewer } from './stories.visibility';

export const STORIES_FLAG = 'stories';
const PAGE = 30;
const TRAY_AUTHORS = 2000;
const TRAY_STORIES = 1500;
const HIDDEN_MAX = 500;

export interface StoryPage<T> {
  items: T[];
  nextCursor: string | null;
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Story not found.',
  });
}

function invalid(field: string, message: string): BadRequestException {
  return new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message,
    details: { field },
  });
}

/**
 * Owner 2026-10-20 — stories like Instagram / WhatsApp: a photo, a video
 * up to 15 s or a text card with emoji stickers, seen for 24 hours by the
 * people the author allows (everyone / followers / phone contacts, minus
 * "hide from"), with the list of viewers for the author and an archive of
 * expired ones. Answering a story is a normal chat message (the app opens
 * the direct chat), so nothing about replies lives here beyond `canReply`.
 */
@Injectable()
export class StoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly videos: VideosService,
    private readonly blocks: BlocksService,
    private readonly settings: AppSettingsService,
    private readonly limits: UsageLimitsService,
    private readonly flags: FeatureFlagsService,
    private readonly briefs: UserBriefService,
  ) {}

  async assertEnabled(): Promise<void> {
    if (!(await this.flags.isEnabled(STORIES_FLAG, true))) {
      throw new ForbiddenException({
        code: ErrorCode.FEATURE_DISABLED,
        message: 'Stories are not available yet.',
      });
    }
  }

  // ── reading ──────────────────────────────────────────────────────────

  /** GET /stories/tray — me first, then people I follow with live stories
   * (not yet seen ones first). */
  async tray(user: RequestUser): Promise<StoryTrayItemDto[]> {
    await this.assertEnabled();
    const me = user.sub;
    const now = new Date();
    const hidden = await this.blocks.hiddenIds(me);
    const follows = await this.prisma.follow.findMany({
      where: { follower_id: me },
      select: { followee_id: true },
      take: TRAY_AUTHORS,
    });
    const authorIds = follows
      .map((f) => f.followee_id)
      .filter((id) => !hidden.has(id));
    const rows = await this.prisma.story.findMany({
      where: {
        OR: [
          liveOwn(me, now),
          ...(authorIds.length
            ? [
                {
                  AND: [
                    { author_id: { in: authorIds } },
                    visibleToViewer(me, now),
                  ],
                } satisfies Prisma.StoryWhereInput,
              ]
            : []),
        ],
      },
      select: { id: true, author_id: true, created_at: true },
      orderBy: { created_at: 'desc' },
      take: TRAY_STORIES,
    });
    const seen = new Set(
      (
        await this.prisma.storyView.findMany({
          where: { viewer_id: me, story_id: { in: rows.map((r) => r.id) } },
          select: { story_id: true },
        })
      ).map((v) => v.story_id),
    );
    const byAuthor = new Map<
      string,
      { count: number; unseen: number; latest: Date }
    >();
    for (const r of rows) {
      const cur = byAuthor.get(r.author_id) ?? {
        count: 0,
        unseen: 0,
        latest: r.created_at,
      };
      cur.count += 1;
      if (!seen.has(r.id)) cur.unseen += 1;
      if (r.created_at > cur.latest) cur.latest = r.created_at;
      byAuthor.set(r.author_id, cur);
    }
    const briefs = await this.briefs.many([me, ...byAuthor.keys()]);
    const toItem = (id: string, isMe: boolean): StoryTrayItemDto | null => {
      const user = briefs.get(id);
      if (!user) return null;
      const agg = byAuthor.get(id);
      return {
        user,
        isMe,
        storyCount: agg?.count ?? 0,
        unseenCount: agg?.unseen ?? 0,
        latestAt: agg ? agg.latest.toISOString() : null,
      };
    };
    const others = [...byAuthor.keys()]
      .filter((id) => id !== me)
      .map((id) => toItem(id, false))
      .filter((x): x is StoryTrayItemDto => x !== null)
      .sort((a, b) => {
        const au = a.unseenCount > 0 ? 1 : 0;
        const bu = b.unseenCount > 0 ? 1 : 0;
        if (au !== bu) return bu - au;
        return (b.latestAt ?? '').localeCompare(a.latestAt ?? '');
      });
    const mine = toItem(me, true);
    return mine ? [mine, ...others] : others;
  }

  /** GET /stories/users/:userId — the live stories I may see, oldest
   * first (the order they play in). */
  async ofUser(user: RequestUser, authorId: string): Promise<StoryDto[]> {
    await this.assertEnabled();
    const now = new Date();
    let where: Prisma.StoryWhereInput;
    if (authorId === user.sub) {
      where = liveOwn(authorId, now);
    } else {
      if (await this.blocks.isBlockedEitherWay(user.sub, authorId)) return [];
      where = {
        AND: [{ author_id: authorId }, visibleToViewer(user.sub, now)],
      };
    }
    const rows = await this.prisma.story.findMany({
      where,
      orderBy: { created_at: 'asc' },
      take: 100,
    });
    return this.present(rows, user.sub);
  }

  /** GET /stories/archive — my expired stories, newest first. */
  async archive(
    user: RequestUser,
    cursor?: string,
    limit = PAGE,
  ): Promise<StoryPage<StoryDto>> {
    await this.assertEnabled();
    const c = cursor ? decodeCursor(cursor) : null;
    const rows = await this.prisma.story.findMany({
      where: {
        author_id: user.sub,
        expires_at: { lte: new Date() },
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
      items: await this.present(page, user.sub),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  /** GET /stories/:id/viewers — author only, newest view first. */
  async viewers(
    user: RequestUser,
    id: string,
    cursor?: string,
    limit = 50,
  ): Promise<StoryPage<StoryViewerDto>> {
    await this.assertEnabled();
    await this.ownStory(user.sub, id);
    const c = cursor ? decodeCursor(cursor) : null;
    const rows = await this.prisma.storyView.findMany({
      where: {
        story_id: id,
        ...(c
          ? {
              OR: [
                { viewed_at: { lt: c.createdAt } },
                { viewed_at: c.createdAt, viewer_id: { lt: c.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ viewed_at: 'desc' }, { viewer_id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const briefs = await this.briefs.many(page.map((r) => r.viewer_id));
    const last = page[page.length - 1];
    return {
      items: page.flatMap((r) => {
        const u = briefs.get(r.viewer_id);
        return u ? [{ user: u, viewedAt: r.viewed_at.toISOString() }] : [];
      }),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.viewed_at, id: last.viewer_id })
          : null,
    };
  }

  // ── writing ──────────────────────────────────────────────────────────

  /** POST /stories/video-uploads — Bunny credentials for a ≤ 15 s video. */
  async createVideoUpload(
    user: RequestUser,
    dto: CreateStoryVideoUploadDto,
  ): Promise<VideoUploadDto> {
    await this.assertEnabled();
    this.assertNotAssistant(user);
    const maxSec = await this.settings.number('stories.max_video_sec');
    const startMs = dto.trimStartMs ?? 0;
    const endMs = dto.trimEndMs ?? startMs + maxSec * 1000;
    if (endMs <= startMs || endMs - startMs > maxSec * 1000) {
      throw invalid('trimEndMs', `A story video is up to ${maxSec} s.`);
    }
    if (startMs >= dto.durationSec * 1000) {
      throw invalid('trimStartMs', 'The trimmed part is outside the video.');
    }
    return this.videos.createUpload(
      user.sub,
      {
        sizeBytes: dto.sizeBytes,
        durationSec: dto.durationSec,
        title: 'LawBid story',
        trimStartMs: startMs,
        trimEndMs: Math.min(endMs, dto.durationSec * 1000),
        coverTimeMs: startMs,
      },
      { skipEntitlement: true },
    );
  }

  /** POST /stories */
  async create(user: RequestUser, dto: CreateStoryDto): Promise<StoryDto> {
    await this.assertEnabled();
    this.assertNotAssistant(user);
    const me = user.sub;
    if (!STORY_KINDS.includes(dto.kind)) throw invalid('kind', 'Bad kind.');
    const text = (dto.text ?? '').trim();
    let fileId: string | null = null;
    let videoAssetId: string | null = null;
    let background: string | null = null;
    if (dto.kind === 'photo') {
      if (!dto.fileId) throw invalid('fileId', 'A photo story needs fileId.');
      await this.files.assertAttachable(me, dto.fileId, ['post_image']);
      fileId = dto.fileId;
    } else if (dto.kind === 'video') {
      if (!dto.videoAssetId) {
        throw invalid('videoAssetId', 'A video story needs videoAssetId.');
      }
      await this.assertVideoUsable(me, dto.videoAssetId);
      videoAssetId = dto.videoAssetId;
    } else {
      if (!text) throw invalid('text', 'A text story needs text.');
      background = dto.background ?? 'gold';
    }
    const active = await this.prisma.story.count({
      where: liveOwn(me, new Date()),
    });
    const max = await this.settings.number('stories.max_active_per_user');
    if (active >= max) {
      throw new ConflictException({
        code: ErrorCode.STORY_LIMIT_REACHED,
        message: 'Too many stories at once.',
        details: { max },
      });
    }
    await this.limits.consume('story_create', me);
    const audience = dto.audience ?? (await this.defaultAudience(me));
    const ttlHours = await this.settings.number('stories.ttl_hours');
    const now = new Date();
    const row = await this.prisma.story.create({
      data: {
        author_id: me,
        kind: dto.kind,
        file_id: fileId,
        video_asset_id: videoAssetId,
        text: text || null,
        background,
        overlays: (dto.overlays ?? []).map(
          cleanOverlay,
        ) as unknown as Prisma.InputJsonValue,
        audience,
        expires_at: new Date(now.getTime() + ttlHours * 3600_000),
      },
    });
    const [out] = await this.present([row], me);
    return out;
  }

  /** DELETE /stories/:id — the author removes a story (also an expired
   * one from the archive). */
  async remove(user: RequestUser, id: string): Promise<void> {
    await this.assertEnabled();
    const s = await this.ownStory(user.sub, id);
    await this.prisma.story.update({
      where: { id },
      data: { deleted_at: new Date(), video_asset_id: null },
    });
    if (s.video_asset_id) await this.videos.markDeleted([s.video_asset_id]);
  }

  /** POST /stories/:id/view — idempotent; the author's own views and
   * stories I can't see are ignored. */
  async view(user: RequestUser, id: string): Promise<void> {
    await this.assertEnabled();
    const me = user.sub;
    const now = new Date();
    const s = await this.prisma.story.findFirst({
      where: { id },
      select: { id: true, author_id: true },
    });
    if (!s) throw notFound();
    if (s.author_id === me) return;
    if (await this.blocks.isBlockedEitherWay(me, s.author_id)) {
      throw notFound();
    }
    const visible = await this.prisma.story.count({
      where: { AND: [{ id }, visibleToViewer(me, now)] },
    });
    if (visible === 0) throw notFound();
    const { count } = await this.prisma.storyView.createMany({
      data: [{ story_id: id, viewer_id: me }],
      skipDuplicates: true,
    });
    if (count > 0) {
      await this.prisma.story.update({
        where: { id },
        data: { view_count: { increment: 1 } },
      });
    }
  }

  // ── privacy ──────────────────────────────────────────────────────────

  async getSettings(user: RequestUser): Promise<StorySettingsDto> {
    await this.assertEnabled();
    const [row, hiddenCount] = await Promise.all([
      this.prisma.storySetting.findUnique({ where: { user_id: user.sub } }),
      this.prisma.storyHidden.count({ where: { owner_id: user.sub } }),
    ]);
    return {
      audience: asAudience(row?.audience),
      allowReplies: row?.allow_replies ?? true,
      hiddenCount,
    };
  }

  async updateSettings(
    user: RequestUser,
    dto: UpdateStorySettingsDto,
  ): Promise<StorySettingsDto> {
    await this.assertEnabled();
    await this.prisma.storySetting.upsert({
      where: { user_id: user.sub },
      create: {
        user_id: user.sub,
        audience: dto.audience ?? 'all',
        allow_replies: dto.allowReplies ?? true,
      },
      update: {
        ...(dto.audience ? { audience: dto.audience } : {}),
        ...(dto.allowReplies !== undefined
          ? { allow_replies: dto.allowReplies }
          : {}),
      },
    });
    return this.getSettings(user);
  }

  async hiddenFrom(user: RequestUser): Promise<UserBriefDto[]> {
    await this.assertEnabled();
    const rows = await this.prisma.storyHidden.findMany({
      where: { owner_id: user.sub },
      orderBy: { created_at: 'desc' },
      take: HIDDEN_MAX,
    });
    const briefs = await this.briefs.many(rows.map((r) => r.hidden_user_id));
    return rows.flatMap((r) => {
      const u = briefs.get(r.hidden_user_id);
      return u ? [u] : [];
    });
  }

  async hide(user: RequestUser, targetId: string): Promise<void> {
    await this.assertEnabled();
    if (targetId === user.sub) throw invalid('userId', 'Not yourself.');
    const target = await this.prisma.user.findFirst({
      where: { id: targetId, deleted_at: null },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'User not found.',
      });
    }
    const count = await this.prisma.storyHidden.count({
      where: { owner_id: user.sub },
    });
    if (count >= HIDDEN_MAX) {
      throw new ConflictException({
        code: ErrorCode.STORY_LIMIT_REACHED,
        message: 'Too many people in the list.',
        details: { max: HIDDEN_MAX },
      });
    }
    await this.prisma.storyHidden.createMany({
      data: [{ owner_id: user.sub, hidden_user_id: targetId }],
      skipDuplicates: true,
    });
  }

  async unhide(user: RequestUser, targetId: string): Promise<void> {
    await this.assertEnabled();
    await this.prisma.storyHidden.deleteMany({
      where: { owner_id: user.sub, hidden_user_id: targetId },
    });
  }

  // ── helpers ──────────────────────────────────────────────────────────

  private assertNotAssistant(user: RequestUser): void {
    if (user.assistant) {
      throw new ForbiddenException({
        code: ErrorCode.ASSISTANT_NOT_ALLOWED,
        message: 'Stories are posted by the person themselves.',
      });
    }
  }

  private async defaultAudience(userId: string): Promise<StoryAudience> {
    const row = await this.prisma.storySetting.findUnique({
      where: { user_id: userId },
      select: { audience: true },
    });
    return asAudience(row?.audience);
  }

  private async ownStory(userId: string, id: string): Promise<Story> {
    const s = await this.prisma.story.findFirst({
      where: { id, author_id: userId },
    });
    if (!s) throw notFound();
    return s;
  }

  /** The upload is mine, finished, short enough and used nowhere else. */
  private async assertVideoUsable(userId: string, id: string): Promise<void> {
    const a = await this.videos.takeReady(userId, id);
    const maxSec = await this.settings.number('stories.max_video_sec');
    const sec = playedSec(a);
    if (sec != null && sec > maxSec + 1) {
      throw new BadRequestException({
        code: ErrorCode.VIDEO_TOO_LONG,
        message: `A story video is up to ${maxSec} s.`,
        details: { maxDurationSec: maxSec },
      });
    }
  }

  /** Rows → DTOs for [viewerId] (urls, authors, seen marks, reply rights). */
  async present(rows: Story[], viewerId: string): Promise<StoryDto[]> {
    if (rows.length === 0) return [];
    const authorIds = [...new Set(rows.map((r) => r.author_id))];
    const fileIds = rows.map((r) => r.file_id).filter((x): x is string => !!x);
    const assetIds = rows
      .map((r) => r.video_asset_id)
      .filter((x): x is string => !!x);
    const [briefs, photos, assets, seen, settings, hidden] = await Promise.all([
      this.briefs.many(authorIds),
      this.files.postImageUrls(fileIds),
      assetIds.length
        ? this.prisma.videoAsset.findMany({ where: { id: { in: assetIds } } })
        : Promise.resolve([]),
      this.prisma.storyView.findMany({
        where: { viewer_id: viewerId, story_id: { in: rows.map((r) => r.id) } },
        select: { story_id: true },
      }),
      this.prisma.storySetting.findMany({
        where: { user_id: { in: authorIds }, allow_replies: false },
        select: { user_id: true },
      }),
      this.blocks.hiddenIds(viewerId),
    ]);
    const videos = await this.videos.present(assets);
    const viewed = new Set(seen.map((v) => v.story_id));
    const noReplies = new Set(settings.map((s) => s.user_id));
    return rows.flatMap((r) => {
      const author = briefs.get(r.author_id);
      if (!author) return [];
      const mine = r.author_id === viewerId;
      const photo = r.file_id ? photos.get(r.file_id) : undefined;
      const video: PostVideoDto | null = r.video_asset_id
        ? (videos.get(r.video_asset_id) ?? null)
        : null;
      return [
        {
          id: r.id,
          author,
          kind: r.kind as StoryKind,
          mediaUrl: photo?.mediumUrl ?? null,
          previewUrl: photo?.previewUrl ?? null,
          video,
          text: r.text,
          background: r.background,
          overlays: asOverlays(r.overlays),
          audience: asAudience(r.audience),
          createdAt: r.created_at.toISOString(),
          expiresAt: r.expires_at.toISOString(),
          viewedByMe: mine || viewed.has(r.id),
          isMine: mine,
          viewCount: mine ? r.view_count : 0,
          canReply:
            !mine && !noReplies.has(r.author_id) && !hidden.has(r.author_id),
        },
      ];
    });
  }
}

function asAudience(v: string | null | undefined): StoryAudience {
  return (STORY_AUDIENCES as readonly string[]).includes(v ?? '')
    ? (v as StoryAudience)
    : 'all';
}

const round = (n: number) => Math.round(n * 1000) / 1000;

function cleanOverlay(o: StoryOverlayDto): StoryOverlayDto {
  return {
    emoji: o.emoji.trim().slice(0, 16),
    x: round(o.x),
    y: round(o.y),
    scale: round(o.scale),
    rotation: round(o.rotation),
  };
}

function asOverlays(v: Prisma.JsonValue): StoryOverlayDto[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    if (x === null || typeof x !== 'object' || Array.isArray(x)) return [];
    const o = x as Record<string, unknown>;
    if (typeof o.emoji !== 'string') return [];
    return [
      {
        emoji: o.emoji,
        x: Number(o.x) || 0,
        y: Number(o.y) || 0,
        scale: Number(o.scale) || 1,
        rotation: Number(o.rotation) || 0,
      },
    ];
  });
}
