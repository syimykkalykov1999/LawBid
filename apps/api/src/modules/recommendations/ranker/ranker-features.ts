import type { PostKind } from '../posts.scoring';
import { featureValueAt, toMatrixBy, vectorizeBy } from './feature-spec';

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

/** featureValueAt with the posts spec's rounding (see feature-spec.ts). */
export function featureValue(v: unknown): number {
  return featureValueAt(RANKER_FEATURE_SPEC.round, v);
}

/** The posts model's input row for one candidate, in spec order. */
export function vectorize(row: Readonly<Record<string, unknown>>): number[] {
  return vectorizeBy(RANKER_FEATURE_SPEC, row);
}

/** Many rows as the posts model's [n, features] float32 input. */
export function toMatrix(
  rows: readonly Readonly<Record<string, unknown>>[],
): Float32Array {
  return toMatrixBy(RANKER_FEATURE_SPEC, rows);
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
