import {
  bayesRating,
  clamp01,
  decay,
  DAY_MS,
  HOUR_MS,
  saturate,
  weighted,
} from './ranking.math';

/**
 * Posts grid in Search (owner 2026-10-13): Explore-style. What is hot
 * right now, what the viewer cares about, whom they know — one list of
 * photos, reels and briefs, without a single author flooding it.
 */
export const POST_WEIGHTS = {
  /** Likes, comments, saves, shares, views — decayed by age. */
  hot: 0.28,
  /** The post's practice vs the viewer's interests. */
  interest: 0.22,
  /** Followed author, or followed by the viewer's follows. */
  social: 0.14,
  /** Newer is better (week scale). */
  fresh: 0.12,
  /** Post language is the viewer's language. */
  language: 0.06,
  /** Author's rating and Identity. */
  authorQuality: 0.06,
  /** Author licensed in a state of the viewer. */
  state: 0.06,
  /** The viewer interacted with the author's posts lately. */
  affinity: 0.06,
} as const;

/** A post already watched/opened by the viewer is shown lower. */
export const SEEN_FACTOR = 0.5;

export type PostKind = 'photo' | 'reel' | 'brief';

export interface PostCandidate {
  id: string;
  authorId: string;
  createdAt: Date;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  views: number;
  /** Practice category id of the post (null = none). */
  category: string | null;
  language: string | null;
  kind: PostKind;
}

export interface PostAuthor {
  ratingAvg: number;
  ratingCount: number;
  trustLevel: number;
  trustBadge: boolean;
  states: string[];
  /** Viewer's followees that follow this author. */
  mutual: number;
  /** Weighted viewer interactions with this author's posts (60 days). */
  engaged: number;
}

export interface PostViewer {
  id: string;
  language: string | null;
  states: string[];
  interests: ReadonlyMap<string, number>;
  following: ReadonlySet<string>;
  seen: ReadonlySet<string>;
}

/** Raw engagement points: a save or share says more than a like. */
export const engagementPoints = (p: PostCandidate): number =>
  p.likes + 2 * p.comments + 3 * p.saves + 2 * p.shares + 0.3 * p.views;

/**
 * Hot score before normalisation: points / (age in hours + 2)^1.3 (the
 * feed's own trending shape, a little flatter so a good week-old post can
 * still surface). Normalised to 0..1 by the batch maximum in rankPosts.
 */
export function hotRaw(p: PostCandidate, now: number): number {
  const hours = Math.max(0, now - p.createdAt.getTime()) / HOUR_MS;
  return engagementPoints(p) / Math.pow(hours + 2, 1.3);
}

export function postFeatures(
  p: PostCandidate,
  author: PostAuthor | undefined,
  v: PostViewer,
  hotMax: number,
  now: number,
): Record<keyof typeof POST_WEIGHTS, number> {
  const followed = v.following.has(p.authorId);
  const lang =
    p.language === null
      ? 0.5
      : v.language && p.language.toLowerCase() === v.language.toLowerCase()
        ? 1
        : 0;
  return {
    hot:
      hotMax > 0 ? clamp01(Math.log1p(hotRaw(p, now)) / Math.log1p(hotMax)) : 0,
    interest: p.category ? (v.interests.get(p.category) ?? 0) : 0,
    social: followed ? 1 : 0.6 * saturate(author?.mutual ?? 0, 2),
    fresh: decay(now - p.createdAt.getTime(), 7 * DAY_MS),
    language: lang,
    authorQuality: author
      ? 0.7 * bayesRating(author.ratingAvg, author.ratingCount) +
        0.3 * clamp01(author.trustLevel / 3)
      : 0,
    state: author?.states.some((s) => v.states.includes(s)) ? 1 : 0,
    affinity: saturate(author?.engaged ?? 0, 3),
  };
}

export function postScore(
  p: PostCandidate,
  author: PostAuthor | undefined,
  v: PostViewer,
  hotMax: number,
  now: number,
  weights: Record<keyof typeof POST_WEIGHTS, number> = POST_WEIGHTS,
): number {
  const base = weighted(weights, postFeatures(p, author, v, hotMax, now));
  return v.seen.has(p.id) ? base * SEEN_FACTOR : base;
}
