import { parseSearchQuery } from './search-query';

/**
 * Audit 2026-11-01: «Find groups» and the channel search matched one
 * substring of the whole typed text ("tax law" missed "Law and tax"), any
 * one letter listed everything, and the best match was lost among the
 * biggest groups. A community is found when EVERY typed word is inside its
 * title or @username; the order is exact, starts with, word starts, inside
 * — then the bigger community first.
 */
export interface CommunityQuery {
  words: string[];
  /** The words joined: what an "exact" and a "starts with" mean. */
  whole: string;
}

export const COMMUNITY_MIN_LETTERS = 2;

export function communityQuery(raw: string): CommunityQuery | null {
  const words = parseSearchQuery(raw.replace(/^@+/, '')).tokens.slice(0, 5);
  const whole = words.join(' ');
  return [...whole.replace(/ /g, '')].length >= COMMUNITY_MIN_LETTERS
    ? { words, whole }
    : null;
}

const fold = (s: string) => parseSearchQuery(s).plain;

/** Lower is better; null = not a match (a word is nowhere in it). */
export function communityTier(
  title: string,
  username: string | null,
  q: CommunityQuery,
): number | null {
  const t = fold(title);
  const u = (username ?? '').toLowerCase();
  const hay = `${t} ${u}`;
  if (!q.words.every((w) => hay.includes(w))) return null;
  if (t === q.whole || u === q.whole.replace(/ /g, '')) return 0;
  if (t.startsWith(q.whole) || u.startsWith(q.whole.replace(/ /g, ''))) {
    return 1;
  }
  const titleWords = t.split(' ');
  if (
    q.words.every(
      (w) => titleWords.some((tw) => tw.startsWith(w)) || u.startsWith(w),
    )
  ) {
    return 2;
  }
  return 3;
}

/** [rows] matching [q], best tier first, then [size] desc (stable). */
export function rankCommunities<T>(
  rows: T[],
  q: CommunityQuery,
  pick: (r: T) => { title: string; username: string | null; size: number },
  limit: number,
): T[] {
  return rows
    .flatMap((r) => {
      const p = pick(r);
      const tier = communityTier(p.title, p.username, q);
      return tier === null ? [] : [{ r, tier, size: p.size }];
    })
    .sort((a, b) => a.tier - b.tier || b.size - a.size)
    .slice(0, limit)
    .map((x) => x.r);
}
