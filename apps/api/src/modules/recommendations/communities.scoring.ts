import {
  DAY_MS,
  clamp01,
  decay,
  hash01,
  logScale,
  saturate,
  weighted,
} from './ranking.math';

/**
 * "Recommended" public groups and channels (owner 2026-10-20), in the
 * spirit of Telegram's similar channels, Facebook's suggested groups and
 * Discord Discover: people the viewer already knows first, then the topic,
 * the region, a live and growing community, and size last. With no signals
 * about the viewer the region, activity and size still rank the list.
 */
export const COMMUNITY_WEIGHTS = {
  /** Members the viewer follows / shares a group or channel with. */
  mutual: 0.3,
  /** The owner's practices vs the viewer's interests. */
  practice: 0.18,
  /** The owner is licensed in (or the group is for) a viewer's state. */
  state: 0.12,
  /** Fresh messages / posts. */
  activity: 0.16,
  /** New members in the last 7 days. */
  growth: 0.1,
  /** Members on a log scale. */
  popularity: 0.14,
} as const;

/** ± this much, rotated daily per viewer: the list is not frozen. */
export const COMMUNITY_JITTER = 0.02;

export interface CommunityCandidate {
  id: string;
  members: number;
  /** Last message (group) or post (channel). */
  lastActivityAt: Date | null;
  joins7d: number;
  /** Practice category ids of the owner. */
  categories: string[];
  /** State codes of the owner's verified licences. */
  states: string[];
  /** Members who are in the viewer's circle. */
  mutual: number;
}

export interface CommunityViewer {
  id: string;
  states: string[];
  /** Practice category id → interest 0..1. */
  interests: ReadonlyMap<string, number>;
}

export function communityFeatures(
  c: CommunityCandidate,
  v: CommunityViewer,
  now: number,
): Record<keyof typeof COMMUNITY_WEIGHTS, number> {
  const age = c.lastActivityAt ? now - c.lastActivityAt.getTime() : Infinity;
  return {
    mutual: saturate(c.mutual, 3),
    practice: clamp01(
      c.categories.reduce((sum, id) => sum + (v.interests.get(id) ?? 0), 0),
    ),
    state: c.states.some((s) => v.states.includes(s)) ? 1 : 0,
    activity: Number.isFinite(age) ? decay(age, 7 * DAY_MS) : 0,
    growth: saturate(c.joins7d, 5),
    popularity: logScale(c.members, 5000),
  };
}

/** 0..1(+jitter): higher = recommend sooner. */
export function communityScore(
  c: CommunityCandidate,
  v: CommunityViewer,
  now: number,
  weights: Record<keyof typeof COMMUNITY_WEIGHTS, number> = COMMUNITY_WEIGHTS,
): number {
  const base = weighted(weights, communityFeatures(c, v, now));
  const day = Math.floor(now / DAY_MS);
  const jitter =
    (hash01(`${v.id}:${c.id}:${day}`) - 0.5) * 2 * COMMUNITY_JITTER;
  return base + jitter;
}

/**
 * One endless-feeling list from three tiers, without repeats: the top
 * [pool] by score, then the rest of the popular list, then the newest.
 * [scored] holds every candidate once; [popular] / [newest] are ids in the
 * order the database returned them.
 */
export function feedOrder<T extends { id: string; score: number }>(
  scored: T[],
  popular: string[],
  newest: string[],
  pool: number,
): T[] {
  const byId = new Map(scored.map((s) => [s.id, s]));
  const out: T[] = [];
  const seen = new Set<string>();
  const take = (s: T | undefined) => {
    if (s && !seen.has(s.id)) {
      seen.add(s.id);
      out.push(s);
    }
  };
  [...scored]
    .sort((a, b) => b.score - a.score)
    .slice(0, pool)
    .forEach(take);
  popular.forEach((id) => take(byId.get(id)));
  newest.forEach((id) => take(byId.get(id)));
  return out;
}
