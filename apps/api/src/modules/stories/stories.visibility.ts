import type { Prisma } from '@prisma/client';

/**
 * Owner 2026-10-20: which of someone else's stories [viewerId] may see
 * right now — live (not deleted, not removed by moderation, within 24 h),
 * the author is active and has not hidden their stories from the viewer,
 * and the story's audience includes the viewer:
 *  - all       → anyone;
 *  - followers → people who follow the author;
 *  - contacts  → people in the author's synced phone book.
 * Blocks are applied by the caller (they are cached, not a join).
 */
export function visibleToViewer(
  viewerId: string,
  now: Date,
): Prisma.StoryWhereInput {
  return {
    deleted_at: null,
    status: 'active',
    expires_at: { gt: now },
    author: {
      deleted_at: null,
      status: 'active',
      story_hidden: { none: { hidden_user_id: viewerId } },
    },
    OR: [
      { audience: 'all' },
      {
        audience: 'followers',
        author: { followers: { some: { follower_id: viewerId } } },
      },
      {
        audience: 'contacts',
        author: { contact_matches: { some: { matched_id: viewerId } } },
      },
    ],
  };
}

/** The author's own live stories. */
export function liveOwn(authorId: string, now: Date): Prisma.StoryWhereInput {
  return {
    author_id: authorId,
    deleted_at: null,
    status: 'active',
    expires_at: { gt: now },
  };
}

/** Two databases (SHARDING_READY step 8): the same rule as
 * `visibleToViewer`, with the per-author lists read beforehand — the hides,
 * follows and phone books live in other databases than the story, so they
 * come in as author ids. */
export function visibleToViewerSplit(
  now: Date,
  ids: { hiddenBy: string[]; followed: string[]; contactOf: string[] },
): Prisma.StoryWhereInput {
  return {
    deleted_at: null,
    status: 'active',
    expires_at: { gt: now },
    author: { deleted_at: null, status: 'active' },
    ...(ids.hiddenBy.length ? { author_id: { notIn: ids.hiddenBy } } : {}),
    OR: [
      { audience: 'all' },
      { audience: 'followers', author_id: { in: ids.followed } },
      { audience: 'contacts', author_id: { in: ids.contactOf } },
    ],
  };
}
