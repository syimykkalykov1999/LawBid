import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  RANKER_FEATURE_SPEC,
  featureValue,
  rankerRow,
  toMatrix,
  vectorize,
} from './ranker-features';

/**
 * F2: the learned ranker sees the same numbers in training (Python, from
 * the ranking_events log) and online (here, from the live formula). These
 * tests hold the two copies of the rule together.
 */
const REPO = resolve(__dirname, '../../../../../..');
const SPEC_JSON = resolve(REPO, 'ml/feed-ranker/feature_spec.json');
const FEATURES_PY = resolve(REPO, 'ml/feed-ranker/features.py');
const ROWS = resolve(
  REPO,
  'apps/api/test/fixtures/feed-ranker/parity-rows.json',
);

describe('ranker features', () => {
  it('the training spec file is this spec (one list, one order, one version)', () => {
    const file = JSON.parse(readFileSync(SPEC_JSON, 'utf8')) as unknown;
    expect(file).toEqual({
      ...RANKER_FEATURE_SPEC,
      features: [...RANKER_FEATURE_SPEC.features],
    });
  });

  it('covers engagement, recency, author affinity and content type', () => {
    const f: readonly string[] = RANKER_FEATURE_SPEC.features;
    for (const name of [
      'hot',
      'fresh',
      'affinity',
      'kind_photo',
      'kind_reel',
      'kind_brief',
    ]) {
      expect(f).toContain(name);
    }
  });

  it('clamps to 0..1, rounds half up to 4 decimals, anything else is missing', () => {
    expect(featureValue(0.12345)).toBe(0.1235);
    expect(featureValue(0.00005)).toBe(0.0001);
    expect(featureValue(0.49999999999999994)).toBe(0.5);
    expect(featureValue(2)).toBe(1);
    expect(featureValue(-1)).toBe(0);
    for (const bad of [undefined, null, '0.5', true, Number.NaN, Infinity]) {
      expect(featureValue(bad)).toBeNaN();
    }
  });

  it('vectorize follows the spec order and ignores unknown keys', () => {
    const v = vectorize({ kind_brief: 1, hot: 0.5, unknown: 0.7 });
    expect(v).toHaveLength(RANKER_FEATURE_SPEC.features.length);
    expect(v[0]).toBe(0.5);
    expect(v[RANKER_FEATURE_SPEC.features.indexOf('kind_brief')]).toBe(1);
    expect(v.filter((x) => Number.isNaN(x))).toHaveLength(
      RANKER_FEATURE_SPEC.features.length - 2,
    );
    // An inherited name is not a feature value.
    expect(
      vectorize(Object.create({ hot: 1 }) as Record<string, unknown>)[0],
    ).toBeNaN();
  });

  it('toMatrix packs rows as float32, row after row', () => {
    const m = toMatrix([{ hot: 0.25 }, { fresh: 1 }]);
    const w = RANKER_FEATURE_SPEC.features.length;
    expect(m).toBeInstanceOf(Float32Array);
    expect(m).toHaveLength(2 * w);
    expect(m[0]).toBe(0.25);
    expect(m[w + RANKER_FEATURE_SPEC.features.indexOf('fresh')]).toBe(1);
  });

  it('rankerRow adds seen and the one-hot content type to the formula features', () => {
    expect(rankerRow({ hot: 0.3 }, true, 'reel')).toEqual({
      hot: 0.3,
      seen: 1,
      kind_photo: 0,
      kind_reel: 1,
      kind_brief: 0,
    });
    expect(rankerRow({}, false, 'brief')).toMatchObject({
      seen: 0,
      kind_brief: 1,
    });
  });

  it('feature parity: Python (training) and TypeScript (online) give the same vectors', () => {
    const rows = JSON.parse(readFileSync(ROWS, 'utf8')) as Record<
      string,
      unknown
    >[];
    const out = execFileSync('python3', [FEATURES_PY, '--vectorize', ROWS], {
      encoding: 'utf8',
    });
    const py = (JSON.parse(out) as (number | null)[][]).map((r) =>
      r.map((x) => (x === null ? Number.NaN : x)),
    );
    const ts = rows.map(vectorize);
    expect(py).toHaveLength(rows.length);
    ts.forEach((row, i) =>
      row.forEach((x, j) => {
        if (Number.isNaN(x)) expect(py[i][j]).toBeNaN();
        else expect(py[i][j]).toBe(x);
      }),
    );
  });
});
