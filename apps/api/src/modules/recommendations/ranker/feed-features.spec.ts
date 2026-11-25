import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { CASE_WEIGHTS } from '../cases.scoring';
import { POST_WEIGHTS } from '../posts.scoring';
import {
  CASES_FEATURE_SPEC,
  CASE_FORMULA_FEATURES,
  caseRankerRow,
} from './cases-features';
import { type FeatureSpec, toMatrixBy, vectorizeBy } from './feature-spec';
import { RANKER_FEATURE_SPEC } from './ranker-features';
import {
  LENGTH_FULL_SEC,
  RATE_PRIOR_VIEWS,
  REELS_FEATURE_SPEC,
  reelRankerRow,
} from './reels-features';

/**
 * Owner 25.11 («умную ленту для всех лент»): the reels and the case feed
 * have their own learned rankers. Each one's training copy of the feature
 * rule (ml/feed-ranker/features.py, feature_spec_<feed>.json) must equal
 * the online one, and the case model must never see who the client is.
 */
const REPO = resolve(__dirname, '../../../../../..');
const FEATURES_PY = resolve(REPO, 'ml/feed-ranker/features.py');
const FEEDS: Array<[string, FeatureSpec, string]> = [
  ['reels', REELS_FEATURE_SPEC, 'feature_spec_reels.json'],
  ['cases', CASES_FEATURE_SPEC, 'feature_spec_cases.json'],
];

describe.each(FEEDS)('%s ranker features', (feed, spec, file) => {
  it('the training spec file is this spec (one list, one order, one version)', () => {
    const json = JSON.parse(
      readFileSync(resolve(REPO, 'ml/feed-ranker', file), 'utf8'),
    ) as unknown;
    expect(json).toEqual({ ...spec, features: [...spec.features] });
  });

  it('is not the posts spec: a model of one feed never loads in another', () => {
    expect(spec.version).not.toBe(RANKER_FEATURE_SPEC.version);
    expect(spec.surface).not.toBe(RANKER_FEATURE_SPEC.surface);
  });

  it('feature parity: Python (training) and TypeScript (online) give the same vectors', () => {
    const fixture = JSON.parse(
      readFileSync(
        resolve(
          REPO,
          `apps/api/test/fixtures/feed-ranker/${feed}/expected.json`,
        ),
        'utf8',
      ),
    ) as { rows: Record<string, unknown>[] };
    const rows: Record<string, unknown>[] = [
      ...fixture.rows,
      { [spec.features[0]]: 0.12345, [spec.features[1]]: '0.5' },
      { [spec.features[0]]: 2, [spec.features[1]]: -1, extra: 0.3 },
    ];
    const tmp = resolve(tmpdir(), `parity-${feed}-${process.pid}.json`);
    writeFileSync(tmp, JSON.stringify(rows));
    const out = execFileSync(
      'python3',
      [FEATURES_PY, '--vectorize', tmp, '--feed', feed],
      { encoding: 'utf8' },
    );
    const py = (JSON.parse(out) as (number | null)[][]).map((r) =>
      r.map((x) => (x === null ? Number.NaN : x)),
    );
    const ts = rows.map((r) => vectorizeBy(spec, r));
    expect(py).toHaveLength(rows.length);
    ts.forEach((row, i) =>
      row.forEach((x, j) => {
        if (Number.isNaN(x)) expect(py[i][j]).toBeNaN();
        else expect(py[i][j]).toBe(x);
      }),
    );
    expect(toMatrixBy(spec, rows)).toHaveLength(
      rows.length * spec.features.length,
    );
  });
});

describe('reels features', () => {
  it('the posts formula features, then what a reel did with its viewers', () => {
    const f: readonly string[] = REELS_FEATURE_SPEC.features;
    for (const k of Object.keys(POST_WEIGHTS)) expect(f).toContain(k);
    for (const k of [
      'seen',
      'own',
      'likeRate',
      'saveRate',
      'shareRate',
      'commentRate',
      'views',
      'length',
    ]) {
      expect(f).toContain(k);
    }
  });

  it('rates per qualified view are shrunk for reels with few views; unknown length stays missing', () => {
    const one = reelRankerRow(
      { hot: 0.4 },
      {
        likes: 1,
        saves: 0,
        shares: 0,
        comments: 0,
        views: 1,
        durationSec: null,
      },
      false,
      false,
    );
    expect(one.likeRate).toBeCloseTo(1 / (1 + RATE_PRIOR_VIEWS), 6);
    expect(one).not.toHaveProperty('length');
    expect(
      vectorizeBy(REELS_FEATURE_SPEC, one)[
        REELS_FEATURE_SPEC.features.indexOf('length')
      ],
    ).toBeNaN();
    const big = reelRankerRow(
      {},
      {
        likes: 300,
        saves: 50,
        shares: 40,
        comments: 10,
        views: 1000,
        durationSec: 90,
      },
      true,
      true,
    );
    expect(big.likeRate).toBeCloseTo(300 / 1010, 6);
    expect(big.shareRate).toBeCloseTo(40 / 1010, 6);
    expect(big.length).toBeCloseTo(90 / LENGTH_FULL_SEC, 6);
    expect(big.seen).toBe(1);
    expect(big.own).toBe(1);
    expect(big.views).toBeGreaterThan(0.8);
    // Never above 1, whatever the counters say.
    const odd = reelRankerRow(
      {},
      {
        likes: 999,
        saves: 0,
        shares: 0,
        comments: 0,
        views: 0,
        durationSec: 999,
      },
      false,
      false,
    );
    expect(odd.likeRate).toBe(1);
    expect(odd.length).toBe(1);
  });
});

describe('cases features (fairness / legal rule)', () => {
  it('are exactly the formula features plus «offer already made»', () => {
    expect([...CASES_FEATURE_SPEC.features]).toEqual([
      ...Object.keys(CASE_WEIGHTS),
      'bidOn',
    ]);
    expect(CASE_FORMULA_FEATURES).toEqual(Object.keys(CASE_WEIGHTS));
  });

  it('hold nothing about who the client is', () => {
    const protectedish =
      /gender|sex|age|birth|race|ethnic|religio|national|citizen|language|lang|disab|marital|pregnan|veteran|zip|address|name|photo|income|orientation/i;
    for (const f of CASES_FEATURE_SPEC.features) {
      expect(f).not.toMatch(protectedish);
    }
  });

  it('caseRankerRow adds bidOn and nothing else', () => {
    expect(caseRankerRow({ practice: 1, state: 0 }, true)).toEqual({
      practice: 1,
      state: 0,
      bidOn: 1,
    });
    expect(caseRankerRow({}, false)).toEqual({ bidOn: 0 });
  });
});
