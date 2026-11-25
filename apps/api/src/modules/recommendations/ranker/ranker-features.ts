import type { PostKind } from '../posts.scoring';

/**
 * F2 (docs/dev/ARCHITECTURE_VS_BIG_PLATFORMS_2026-11-25.md §6 item 24): the
 * learned second stage of the posts ranking (Instagram "Journey to 1000
 * models", 2025; Twitter "the-algorithm" heavy ranker, 2023: candidates
 * first, then a trained model scores the best of them).
 *
 * The model's input is ONE vector per candidate, built from exactly the
 * numbers the ranking events log keeps for an impression (`features` of
 * ranking_events, see RecommendationsService.keepFeatures). Training
 * (ml/feed-ranker/features.py) builds the same vector from the logged
 * object, online scoring builds it from the live object: one rule, two
 * copies, held equal by ranker-features.spec.ts (a fixture run through both,
 * and ml/feed-ranker/feature_spec.json compared with this constant).
 *
 * Changing the list or the rule = a new `version`: a model trained on the
 * old version is refused by PostRankerService (formula fallback).
 */
export const RANKER_FEATURE_SPEC = {
  version: 'posts-ranker-features-v1',
  surface: 'posts',
  /** Decimals kept, the same rounding the events log applies (1e-4). */
  round: 4,
  features: [
    // engagement (likes, comments, saves, shares, views, decayed by age)
    'hot',
    'interest',
    'social',
    // recency (week scale)
    'fresh',
    'language',
    'authorQuality',
    'state',
    // author affinity (the viewer's own interactions with the author)
    'affinity',
    // already opened / liked by the viewer
    'seen',
    // content type, one-hot
    'kind_photo',
    'kind_reel',
    'kind_brief',
  ],
} as const;

export type RankerFeatureName = (typeof RANKER_FEATURE_SPEC.features)[number];

const SCALE = Math.pow(10, RANKER_FEATURE_SPEC.round);

/**
 * One logged / live feature value → the model's number. A finite number is
 * clamped to 0..1 and rounded half up to `round` decimals (Math.round, the
 * events log's own rounding); anything else (absent, null, text, a boolean,
 * NaN, ±Infinity) is NaN = "missing", which LightGBM and the ONNX
 * TreeEnsemble both send down the trained missing-value branch.
 */
export function featureValue(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return Number.NaN;
  const c = Math.min(1, Math.max(0, v));
  return Math.round(c * SCALE) / SCALE;
}

/** The model's input row for one candidate, in spec order. */
export function vectorize(row: Readonly<Record<string, unknown>>): number[] {
  return RANKER_FEATURE_SPEC.features.map((name) =>
    featureValue(
      Object.prototype.hasOwnProperty.call(row, name) ? row[name] : undefined,
    ),
  );
}

/** Many rows as the model's [n, features] float32 input. */
export function toMatrix(
  rows: readonly Readonly<Record<string, unknown>>[],
): Float32Array {
  const width = RANKER_FEATURE_SPEC.features.length;
  const out = new Float32Array(rows.length * width);
  rows.forEach((r, i) => out.set(vectorize(r), i * width));
  return out;
}

/**
 * The formula's 0..1 features of a post plus what the formula applies
 * outside them (seen) and the content type, as logged and as scored.
 */
export function rankerRow(
  formula: Readonly<Record<string, number>>,
  seen: boolean,
  kind: PostKind,
): Record<string, number> {
  return {
    ...formula,
    seen: seen ? 1 : 0,
    kind_photo: kind === 'photo' ? 1 : 0,
    kind_reel: kind === 'reel' ? 1 : 0,
    kind_brief: kind === 'brief' ? 1 : 0,
  };
}
