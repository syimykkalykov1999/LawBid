import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Owner 2026-10-05: every post is 'legal' (a law topic, News, or marked by
 * its author / moderation) or 'general' (personal: food, travel…). A
 * viewer who wants only legal content picks "Legal only": general posts
 * then leave their feed, search, hashtag pages and recommendations. An
 * author's own profile still lists all of their posts.
 */
export const POST_CONTENT_CLASSES = ['legal', 'general'] as const;
export type PostContentClass = (typeof POST_CONTENT_CLASSES)[number];

export const FEED_CONTENT_MODES = ['all', 'legal_only'] as const;
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
  return mode === 'legal_only' ? { content_class: 'legal' } : {};
}

@Injectable()
export class ContentFilterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
  ) {}

  /** The admin default for people who never picked a mode. */
  async defaultMode(): Promise<FeedContentMode> {
    const v = await this.settings.string(DEFAULT_CONTENT_MODE_KEY);
    return isFeedContentMode(v) ? v : 'all';
  }

  /** The viewer's mode: their own choice, else the admin default. */
  async modeOf(userId: string): Promise<FeedContentMode> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { feed_content_mode: true },
    });
    const own = row?.feed_content_mode;
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
    return mode;
  }
}
