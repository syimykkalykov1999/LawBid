import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { APP_SETTINGS } from '../../../common/app-settings/app-settings.defaults';
import type { AppConfigService } from '../../feature-flags/services/app-config.service';
import {
  CASES_RANKER_FEED,
  CaseRankerService,
  REELS_RANKER_FEED,
  ReelRankerService,
} from './feed-rankers.service';
import type { LearnedRanker, RankerModelSource } from './learned-ranker';
import { POSTS_RANKER_FEED, PostRankerService } from './post-ranker.service';

/**
 * Owner 25.11 («умную ленту для всех лент»): the reels feed and the
 * attorneys' case feed each run their own learned ranker, with their own
 * admin switch, test key, feature list and model — and the same safety as
 * the posts ranker (sha256, feature list, latency budget, formula fallback).
 */
const FIXTURES = resolve(__dirname, '../../../../test/fixtures/feed-ranker');

const settingsWith = (stored: Record<string, unknown>) =>
  new AppSettingsService({
    getConfig: () => Promise.resolve(stored),
  } as unknown as AppConfigService);

type Make = (
  s?: AppSettingsService,
  m?: undefined,
  src?: RankerModelSource,
) => LearnedRanker;
const FEEDS: Array<[string, string, string, Make]> = [
  [
    'reels',
    'reco.ranker.reels',
    'reel_ranker',
    (s, m, src) => new ReelRankerService(s, m, src),
  ],
  [
    'cases',
    'reco.ranker.cases',
    'case_ranker',
    (s, m, src) => new CaseRankerService(s, m, src),
  ],
];

describe.each(FEEDS)('%s ranker', (feed, prefix, testKey, make) => {
  const dir = join(FIXTURES, feed);
  const model = join(dir, 'model.onnx');
  const expected = JSON.parse(
    readFileSync(join(dir, 'expected.json'), 'utf8'),
  ) as { rows: Record<string, unknown>[]; scores: number[] };
  const on = (over: Record<string, unknown> = {}) =>
    make(
      settingsWith({
        [`${prefix}.mode`]: 'on',
        [`${prefix}.traffic_percent`]: 100,
        [`${prefix}.model_share_percent`]: 50,
        [`${prefix}.model_key`]: `file:${model}`,
        ...over,
      }),
    );

  it('defaults to «Авто» with no model: nobody is in the test (the formula)', async () => {
    expect(APP_SETTINGS[`${prefix}.mode` as keyof typeof APP_SETTINGS]).toBe(
      'auto',
    );
    expect(
      APP_SETTINGS[`${prefix}.model_key` as keyof typeof APP_SETTINGS],
    ).toBe('');
    const r = make(settingsWith({}));
    expect(await r.assign('u1')).toBeNull();
    expect(await r.wantsTrainingData()).toBe(true);
    expect(r.status()).toMatchObject({ feed, loaded: null });
  });

  it('loads its own fixture model and scores exactly like the trained LightGBM model', async () => {
    const r = on();
    expect(await r.ensureLoaded()).toBe(true);
    expect(r.formulaVersion()).toBe('ranker:fixture');
    const got = await r.score(expected.rows);
    expect(got).not.toBeNull();
    Array.from(got!).forEach((s, i) =>
      expect(s).toBeCloseTo(expected.scores[i], 5),
    );
  });

  it('runs its own test key; the model arm is only its own', async () => {
    const r = on();
    await r.ensureLoaded();
    let model = 0;
    for (let i = 0; i < 400; i++) {
      const a = await r.assign(`user-${i}`);
      expect(a?.experimentKey).toBe(testKey);
      if (r.isModelArm(a)) model++;
      // Another feed's model arm is not this one's.
      expect(
        r.isModelArm({ experimentKey: 'post_ranker', variant: 'model' }),
      ).toBe(false);
    }
    expect(model).toBeGreaterThan(150);
    expect(model).toBeLessThan(250);
  });

  it('refuses the posts model (another feature list): formula kept', async () => {
    const r = on({
      [`${prefix}.model_key`]: `file:${join(FIXTURES, 'model.onnx')}`,
    });
    expect(await r.ensureLoaded()).toBe(false);
    expect(r.status().failed).toMatch(/feature spec/);
    expect(await r.assign('u1')).toBeNull();
  });

  it('a production key must be under its own folder', async () => {
    const own = `ml/feed-ranker/${feed}/r202612011530/model.onnx`;
    const read = jest.fn((key: string) =>
      Promise.resolve(
        readFileSync(
          key.endsWith('manifest.json') ? join(dir, 'manifest.json') : model,
        ),
      ),
    );
    const r = make(
      settingsWith({
        [`${prefix}.mode`]: 'on',
        [`${prefix}.traffic_percent`]: 100,
        [`${prefix}.model_key`]: own,
      }),
      undefined,
      { read },
    );
    expect(await r.ensureLoaded()).toBe(true);
    expect(read).toHaveBeenCalledWith(own);
    // The posts folder is not this feed's: no model.
    const wrong = make(
      settingsWith({
        [`${prefix}.mode`]: 'on',
        [`${prefix}.traffic_percent`]: 100,
        [`${prefix}.model_key`]: 'ml/feed-ranker/r202612011530/model.onnx',
      }),
      undefined,
      { read },
    );
    expect(await wrong.ensureLoaded()).toBe(false);
    expect(await wrong.assign('u1')).toBeNull();
  });

  it('S3 down: the formula, never an error into the request', async () => {
    const r = make(
      settingsWith({
        [`${prefix}.mode`]: 'on',
        [`${prefix}.traffic_percent`]: 100,
        [`${prefix}.model_key`]: `ml/feed-ranker/${feed}/x/model.onnx`,
      }),
      undefined,
      { read: () => Promise.reject(new Error('S3 down')) },
    );
    expect(await r.ensureLoaded()).toBe(false);
    expect(await r.assign('u')).toBeNull();
    expect(await r.score(expected.rows)).toBeNull();
  });

  it('«Выкл» wins: nobody in the test, no training data wanted', async () => {
    const r = on({ [`${prefix}.mode`]: 'off' });
    await r.ensureLoaded();
    expect(await r.assign('user-1')).toBeNull();
    expect(await r.wantsTrainingData()).toBe(false);
  });

  it('«Авто» steps back to the formula when scoring is slower than the budget', async () => {
    const r = on({
      [`${prefix}.mode`]: 'auto',
      [`${prefix}.latency_budget_ms`]: 1,
    });
    await r.ensureLoaded();
    expect(await r.assign('user-1')).not.toBeNull();
    const slow = (r as unknown as { latencies: number[] }).latencies;
    for (let i = 0; i < 30; i++) slow.push(5);
    expect(await r.assign('user-1')).toBeNull();
  });
});

describe('one ranker per feed', () => {
  it('three test keys, three settings prefixes, three feature specs', () => {
    const feeds = [POSTS_RANKER_FEED, REELS_RANKER_FEED, CASES_RANKER_FEED];
    for (const pick of [
      (f: typeof POSTS_RANKER_FEED) => f.experimentKey,
      (f: typeof POSTS_RANKER_FEED) => f.settingsPrefix,
      (f: typeof POSTS_RANKER_FEED) => f.spec.version,
      (f: typeof POSTS_RANKER_FEED) => f.spec.surface,
    ]) {
      expect(new Set(feeds.map(pick)).size).toBe(3);
    }
  });

  it('the posts ranker refuses the reels and cases models', async () => {
    for (const feed of ['reels', 'cases']) {
      const r = new PostRankerService(
        settingsWith({
          'reco.ranker.mode': 'on',
          'reco.ranker.traffic_percent': 100,
          'reco.ranker.model_key': `file:${join(FIXTURES, feed, 'model.onnx')}`,
        }),
      );
      expect(await r.ensureLoaded()).toBe(false);
      expect(r.status().failed).toMatch(/feature spec/);
    }
  });
});
