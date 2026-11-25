/**
 * The input contract of one learned ranker (one per feed: posts, reels,
 * cases). A model trained on a spec is refused by any other spec
 * (LearnedRanker.manifestProblem), so a change of the list, the order or
 * the rule is a new `version`. ml/feed-ranker/feature_spec*.json hold the
 * same objects for training; the specs' tests compare them.
 */
export interface FeatureSpec {
  readonly version: string;
  /** The ranking_events surface whose impressions train this ranker. */
  readonly surface: string;
  /** Decimals kept, the same rounding the events log applies (1e-4). */
  readonly round: number;
  readonly features: readonly string[];
}

/**
 * One logged / live feature value → the model's number. A finite number is
 * clamped to 0..1 and rounded half up to [round] decimals (Math.round, the
 * events log's own rounding); anything else (absent, null, text, a boolean,
 * NaN, ±Infinity) is NaN = "missing", which LightGBM and the ONNX
 * TreeEnsemble both send down the trained missing-value branch.
 */
export function featureValueAt(round: number, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return Number.NaN;
  const scale = Math.pow(10, round);
  const c = Math.min(1, Math.max(0, v));
  return Math.round(c * scale) / scale;
}

/** The model's input row for one candidate, in [spec] order. */
export function vectorizeBy(
  spec: FeatureSpec,
  row: Readonly<Record<string, unknown>>,
): number[] {
  return spec.features.map((name) =>
    featureValueAt(
      spec.round,
      Object.prototype.hasOwnProperty.call(row, name) ? row[name] : undefined,
    ),
  );
}

/** Many rows as the model's [n, features] float32 input. */
export function toMatrixBy(
  spec: FeatureSpec,
  rows: readonly Readonly<Record<string, unknown>>[],
): Float32Array {
  const width = spec.features.length;
  const out = new Float32Array(rows.length * width);
  rows.forEach((r, i) => out.set(vectorizeBy(spec, r), i * width));
  return out;
}
