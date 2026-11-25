/**
 * docs/05 §2.2.3 mixing, as pure functions (unit-tested):
 * - with follows: every 4th slot of a page (positions 4, 8, …) is a
 *   recommendation, the rest are followed posts; once followed posts run
 *   out, recommendations fill the page;
 * - without follows: 100% recommendations.
 */
export const RECO_EVERY = 4;

export function recoSlotsFor(limit: number, hasFollows: boolean): number {
  return hasFollows ? Math.floor(limit / RECO_EVERY) : limit;
}

export function mixPage<T>(
  following: readonly T[],
  reco: readonly T[],
  limit: number,
  hasFollows: boolean,
): T[] {
  // An attorney who follows nobody still has the own-posts stream (the
  // service adds the viewer to the followed authors): those must lead the
  // page, otherwise a fresh post of their own never shows up in their feed.
  if (!hasFollows && following.length === 0) return reco.slice(0, limit);
  const out: T[] = [];
  let f = 0;
  let r = 0;
  while (out.length < limit && (f < following.length || r < reco.length)) {
    const recoSlot = (out.length + 1) % RECO_EVERY === 0;
    if ((recoSlot || f >= following.length) && r < reco.length) {
      out.push(reco[r++]);
    } else if (f < following.length) {
      out.push(following[f++]);
    } else {
      break;
    }
  }
  return out;
}

/** Opaque feed cursor (§2.2.5): followed stream position + recommendation
 * position inside a pinned snapshot version. Never an SQL offset. */
export interface FeedCursor {
  /** Last followed post served, or null when that stream is exhausted. */
  f: { t: string; id: string } | null;
  /** Next index into the recommendation snapshot. */
  r: number;
  /** Recommendation snapshot version the index belongs to. */
  v: string | null;
  /** Last post served by the "everything else, newest first" tail, once
   * followed posts and recommendations ran out; null = tail not started. */
  l?: { t: string; id: string } | null;
  /** 18.11: when this scroll's first page was read (ms). The tail may show
   * a recommendation seen before it (an earlier visit: shown lower again,
   * never lost) but not one this scroll already served. */
  s?: number;
  /** Owner 25.11: how many posts this scroll served before this page (the
   * impressions' places in the ranking events log). */
  n?: number;
  /** Owner 25.11 (Instagram home feed): the scroll pages a pinned ranked
   * window — `p` its name, `o` the next index in it, `e` the feed ended
   * inside the window. The other fields are the chronological read after
   * the window (where the feed goes on once the window is served). */
  k?: { p: string; o: number; e?: boolean };
}

export function encodeFeedCursor(c: FeedCursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

export function decodeFeedCursor(raw: string): FeedCursor | null {
  try {
    const c = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as FeedCursor;
    if (
      typeof c !== 'object' ||
      c === null ||
      typeof c.r !== 'number' ||
      c.r < 0
    ) {
      return null;
    }
    if (
      c.f !== null &&
      (typeof c.f?.t !== 'string' || typeof c.f?.id !== 'string')
    ) {
      return null;
    }
    if (
      c.l != null &&
      (typeof c.l?.t !== 'string' || typeof c.l?.id !== 'string')
    ) {
      return null;
    }
    const k = c.k as FeedCursor['k'] | null | undefined;
    if (
      k != null &&
      (typeof k !== 'object' ||
        typeof k.p !== 'string' ||
        !/^[A-Za-z0-9_-]{1,32}$/.test(k.p) ||
        typeof k.o !== 'number' ||
        !Number.isFinite(k.o) ||
        k.o < 0)
    ) {
      return null;
    }
    return {
      f: c.f,
      r: Math.floor(c.r),
      v: typeof c.v === 'string' ? c.v : null,
      l: c.l ?? null,
      ...(typeof c.s === 'number' && Number.isFinite(c.s) && c.s > 0
        ? { s: Math.floor(c.s) }
        : {}),
      ...(typeof c.n === 'number' && Number.isFinite(c.n) && c.n > 0
        ? { n: Math.floor(c.n) }
        : {}),
      ...(k
        ? {
            k: {
              p: k.p,
              o: Math.floor(k.o),
              ...(k.e === true ? { e: true } : {}),
            },
          }
        : {}),
    };
  } catch {
    return null;
  }
}

/** §2.2.2 score: (likes + 2·comments + 2·saves) / (age_hours + 2)^1.5. */
export function recoScore(
  likes: number,
  comments: number,
  saves: number,
  ageHours: number,
): number {
  return (
    (likes + 2 * comments + 2 * saves) /
    Math.pow(Math.max(ageHours, 0) + 2, 1.5)
  );
}
