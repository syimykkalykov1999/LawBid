import type { Scored } from '../ranking.math';

/**
 * F2 stage 2, pure: [top] is the formula's best candidates, best first;
 * [model] the model's score of each (same order). Returns the same items
 * ordered by the model (ties keep the formula's order), each given the
 * formula score of the place it moves into — so the scores keep the
 * formula's scale and spread, and what runs after (diversify: its author
 * and kind penalties are in those units; the reels' watched / unwatched
 * split) works exactly as before, only on the model's order.
 */
export function withModelOrder<T>(
  top: readonly Scored<T>[],
  model: ArrayLike<number>,
): Scored<T>[] {
  if (model.length !== top.length) return [...top];
  const slots = top.map((s) => s.score);
  const value = (i: number) =>
    Number.isFinite(model[i]) ? model[i] : Number.NEGATIVE_INFINITY;
  const order = top
    .map((_, i) => i)
    .sort((a, b) => value(b) - value(a) || a - b);
  return order.map((i, place) => ({ item: top[i].item, score: slots[place] }));
}

/** [scored] best first by the formula (ties: original order). */
export function byFormula<T>(scored: readonly Scored<T>[]): Scored<T>[] {
  return scored
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.score - a.s.score || a.i - b.i)
    .map((x) => x.s);
}
