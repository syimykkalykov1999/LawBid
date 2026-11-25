import { saturate } from '../ranking.math';

/**
 * The reels feed's own learned ranker (owner 25.11: «умную ленту для всех
 * лент»). TikTok ("How TikTok recommends videos #ForYou", newsroom
 * 18.06.2020) and YouTube ("Deep Neural Networks for YouTube
 * Recommendations", RecSys 2016) rank short video by what people do with
 * a video once it plays — a real watch, then likes, saves, shares — not by
 * the click that opens a post. So the reels model has its own features and
 * its own labels (ml/feed-ranker/train.py --feed reels), apart from the
 * posts model.
 *
 * Input: the posts formula's 0..1 features (what is hot, the viewer's
 * topics, followed authors, freshness, language, author quality, state,
 * affinity) plus what a reel did with the people who watched it: likes,
 * saves, shares and comments per qualified view (a view = 3 s of real
 * playback, the app's onViewed), its length, and whether the viewer has
 * watched it already or posted it. Rates are shrunk toward 0 for reels
 * with few views (+ RATE_PRIOR_VIEWS), so 1 like of 1 view is not "100 %".
 *
 * Changing the list or the rule = a new `version` (formula fallback for
 * the older model).
 */
export const REELS_FEATURE_SPEC = {
  version: 'reels-ranker-features-v1',
  surface: 'reels',
  round: 4,
  features: [
    'hot',
    'interest',
    'social',
    'fresh',
    'language',
    'authorQuality',
    'state',
    'affinity',
    'seen',
    'own',
    'likeRate',
    'saveRate',
    'shareRate',
    'commentRate',
    'views',
    'length',
  ],
} as const;

/** Views added to the denominator of every per-view rate. */
export const RATE_PRIOR_VIEWS = 10;
/** A reel this long (seconds) or longer reads as length 1. */
export const LENGTH_FULL_SEC = 180;
/** The scale of `views`: 1 − e^(−views / VIEWS_FULL) (500 views ≈ 0.63). */
export const VIEWS_FULL = 500;

export interface ReelSignals {
  likes: number;
  saves: number;
  shares: number;
  comments: number;
  views: number;
  /** Seconds; null = not known (an older upload). */
  durationSec: number | null;
}

const rate = (n: number, views: number) =>
  Math.min(1, Math.max(0, n) / (Math.max(0, views) + RATE_PRIOR_VIEWS));

/** The reels model's input object for one reel (as logged, as scored). */
export function reelRankerRow(
  formula: Readonly<Record<string, number>>,
  s: ReelSignals,
  seen: boolean,
  own: boolean,
): Record<string, number> {
  const row: Record<string, number> = {
    ...formula,
    seen: seen ? 1 : 0,
    own: own ? 1 : 0,
    likeRate: rate(s.likes, s.views),
    saveRate: rate(s.saves, s.views),
    shareRate: rate(s.shares, s.views),
    commentRate: rate(s.comments, s.views),
    views: saturate(s.views, VIEWS_FULL),
  };
  // Unknown length stays missing (NaN in the model), not "0 seconds".
  if (s.durationSec !== null && s.durationSec >= 0) {
    row.length = Math.min(1, s.durationSec / LENGTH_FULL_SEC);
  }
  return row;
}
