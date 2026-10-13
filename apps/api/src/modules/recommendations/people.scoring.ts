import {
  bayesRating,
  clamp01,
  decay,
  DAY_MS,
  hash01,
  logScale,
  saturate,
  weighted,
} from './ranking.math';

/**
 * "Recommended" and "Suggested" people (owner 2026-10-13): who to follow,
 * in the spirit of Instagram's suggestions — people close to what the
 * viewer does and who they already know, then quality and activity.
 */
export const PEOPLE_WEIGHTS = {
  /** In the viewer's address book (or has the viewer in theirs). */
  contact: 0.2,
  /** Licensed (verified) in a state of the viewer. */
  state: 0.144,
  /** The candidate's practices vs the viewer's interests. */
  practice: 0.176,
  /** Accounts the viewer follows who follow the candidate. */
  mutual: 0.128,
  /** The candidate already follows the viewer (follow back). */
  followsMe: 0.064,
  /** Rating shrunk to a prior, with a confidence for the review count. */
  quality: 0.112,
  /** Posts in 30 days and how fresh the last one is. */
  activity: 0.08,
  /** The viewer liked / commented on / viewed their posts lately. */
  affinity: 0.056,
  /** Trust level and the blue check (Identity). */
  identity: 0.024,
  /** Followers on a log scale. */
  popularity: 0.016,
} as const;

/** ± this much, rotated daily per viewer: the list is not frozen. */
export const PEOPLE_JITTER = 0.02;

export interface PersonCandidate {
  id: string;
  ratingAvg: number;
  ratingCount: number;
  followersCount: number;
  trustLevel: number;
  trustBadge: boolean;
  posts30d: number;
  lastPostAt: Date | null;
  /** State codes of verified licences. */
  states: string[];
  /** Practice category ids. */
  categories: string[];
  /** Viewer's followees that follow this candidate. */
  mutual: number;
  followsViewer: boolean;
  /** Weighted viewer interactions with the candidate's posts (60 days). */
  engaged: number;
  /** 1 = in my address book, 0.6 = I am in theirs, 0 = neither. */
  contact: number;
}

export interface PeopleViewer {
  id: string;
  /** Licensed states (attorney) or the state of residence (client). */
  states: string[];
  /** Practice category id → interest 0..1 (strongest = 1). */
  interests: ReadonlyMap<string, number>;
}

export function personFeatures(
  c: PersonCandidate,
  v: PeopleViewer,
  now: number,
): Record<keyof typeof PEOPLE_WEIGHTS, number> {
  const stateMatch = c.states.some((s) => v.states.includes(s)) ? 1 : 0;
  const practice = clamp01(
    c.categories.reduce((sum, id) => sum + (v.interests.get(id) ?? 0), 0),
  );
  const confidence = 0.6 + 0.4 * logScale(c.ratingCount, 20);
  const lastAge = c.lastPostAt ? now - c.lastPostAt.getTime() : Infinity;
  return {
    contact: clamp01(c.contact),
    state: stateMatch,
    practice,
    mutual: saturate(c.mutual, 2),
    followsMe: c.followsViewer ? 1 : 0,
    quality: bayesRating(c.ratingAvg, c.ratingCount) * confidence,
    activity:
      0.5 * clamp01(c.posts30d / 8) +
      0.5 * (Number.isFinite(lastAge) ? decay(lastAge, 14 * DAY_MS) : 0),
    affinity: saturate(c.engaged, 3),
    identity: 0.6 * clamp01(c.trustLevel / 3) + 0.4 * (c.trustBadge ? 1 : 0),
    popularity: logScale(c.followersCount, 1000),
  };
}

/** 0..1(+jitter): higher = recommend sooner. */
export function personScore(
  c: PersonCandidate,
  v: PeopleViewer,
  now: number,
): number {
  const base = weighted(PEOPLE_WEIGHTS, personFeatures(c, v, now));
  const day = Math.floor(now / DAY_MS);
  const jitter = (hash01(`${v.id}:${c.id}:${day}`) - 0.5) * 2 * PEOPLE_JITTER;
  return base + jitter;
}
