import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import type { Prisma } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';

/**
 * Owner 2026-10-05: every post is 'legal' (a law topic, News, or marked by
 * its author / moderation) or 'general' (personal: food, travel…). A
 * viewer who wants only legal content picks "Legal only": general posts
 * then leave their feed, search, hashtag pages and recommendations. An
 * author's own profile still lists all of their posts.
 */
export const POST_CONTENT_CLASSES = ['legal', 'general'] as const;
export type PostContentClass = (typeof POST_CONTENT_CLASSES)[number];

export const FEED_CONTENT_MODES = ['all', 'legal_only', 'briefs_only'] as const;
export type FeedContentMode = (typeof FEED_CONTENT_MODES)[number];

export const DEFAULT_CONTENT_MODE_KEY = 'feed.default_content_mode';

export function isFeedContentMode(v: unknown): v is FeedContentMode {
  return (FEED_CONTENT_MODES as readonly unknown[]).includes(v);
}

export function isPostContentClass(v: unknown): v is PostContentClass {
  return (POST_CONTENT_CLASSES as readonly unknown[]).includes(v);
}

/** The class a post gets from its topic: a law topic or News is legal;
 * without one the author's choice decides (default general). */
export function classifyPost(input: {
  hasPractice: boolean;
  kind: string;
  requested?: PostContentClass;
}): PostContentClass {
  if (input.hasPractice || input.kind === 'news') return 'legal';
  return input.requested ?? 'general';
}

/** Extra WHERE for a viewer's mode (empty for "all"). */
export function contentModeWhere(mode: FeedContentMode): Prisma.PostWhereInput {
  if (mode === 'legal_only') return { content_class: 'legal' };
  // Owner 2026-10-13: "Briefs" — text-only posts (no photo, video or file;
  // the same rule as BRIEF_POST_WHERE).
  if (mode === 'briefs_only') {
    return {
      kind: 'post',
      video_asset_id: null,
      media: { none: {} },
      attachments: { none: {} },
    };
  }
  return {};
}

/** Owner 2026-10-18 (speed): a viewer's own mode is read on every feed,
 * search and recommendation call; it is kept in Redis for a minute and
 * dropped in setMode. '-' means "never picked" (the admin default applies,
 * read fresh through AppSettingsService). */
const MODE_CACHE_TTL_SECONDS = 60;
const modeCacheKey = (userId: string) => `feed:content_mode:${userId}`;

@Injectable()
export class ContentFilterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** The admin default for people who never picked a mode. */
  async defaultMode(): Promise<FeedContentMode> {
    const v = await this.settings.string(DEFAULT_CONTENT_MODE_KEY);
    return isFeedContentMode(v) ? v : 'all';
  }

  /** The viewer's mode: their own choice, else the admin default. */
  async modeOf(userId: string): Promise<FeedContentMode> {
    const cached = await this.redis.get(modeCacheKey(userId)).catch(() => null);
    if (cached !== null) {
      return isFeedContentMode(cached) ? cached : this.defaultMode();
    }
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { feed_content_mode: true },
    });
    const own = row?.feed_content_mode;
    await this.redis
      .set(
        modeCacheKey(userId),
        isFeedContentMode(own) ? own : '-',
        'EX',
        MODE_CACHE_TTL_SECONDS,
      )
      .catch(() => undefined);
    return isFeedContentMode(own) ? own : this.defaultMode();
  }

  async setMode(
    userId: string,
    mode: FeedContentMode,
  ): Promise<FeedContentMode> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { feed_content_mode: mode },
    });
    await this.redis.del(modeCacheKey(userId)).catch(() => undefined);
    return mode;
  }
}
