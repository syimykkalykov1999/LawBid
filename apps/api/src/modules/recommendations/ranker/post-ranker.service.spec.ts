import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import type { AppConfigService } from '../../feature-flags/services/app-config.service';
import { assignVariant } from '../../experiments/experiment-math';
import {
  PostRankerService,
  RANKER_EXPERIMENT_KEY,
  manifestProblem,
  p95,
  type RankerModelSource,
} from './post-ranker.service';
import { RANKER_FEATURE_SPEC } from './ranker-features';

/**
 * F2: the online stage of the learned ranker with the tiny fixture model
 * that ml/feed-ranker/make_fixture.py trains (LightGBM LambdaMART → ONNX).
 */
const FIXTURE = resolve(__dirname, '../../../../test/fixtures/feed-ranker');
const MODEL = join(FIXTURE, 'model.onnx');
const expected = JSON.parse(
  readFileSync(join(FIXTURE, 'expected.json'), 'utf8'),
) as {
  rows: Record<string, unknown>[];
  scores: number[];
};

const settingsWith = (stored: Record<string, unknown>) =>
  new AppSettingsService({
    getConfig: () => Promise.resolve(stored),
  } as unknown as AppConfigService);

const on = (over: Record<string, unknown> = {}) =>
  new PostRankerService(
    settingsWith({
      'reco.ranker.mode': 'on',
      'reco.ranker.traffic_percent': 100,
      'reco.ranker.model_share_percent': 50,
      'reco.ranker.model_key': `file:${MODEL}`,
      ...over,
    }),
  );

/** A copy of the fixture with a changed manifest, as a `file:` key. */
function withManifest(change: (m: Record<string, unknown>) => void): string {
  const dir = mkdtempSync(join(tmpdir(), 'ranker-'));
  copyFileSync(MODEL, join(dir, 'model.onnx'));
  const m = JSON.parse(
    readFileSync(join(FIXTURE, 'manifest.json'), 'utf8'),
  ) as Record<string, unknown>;
  change(m);
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(m));
  return `file:${join(dir, 'model.onnx')}`;
}

describe('PostRankerService', () => {
  it('defaults to off: nobody is in the test, nothing is loaded', async () => {
    const r = new PostRankerService(settingsWith({}));
    expect(await r.assign('u1')).toBeNull();
    expect(r.status().loaded).toBeNull();
  });

  it('loads the fixture model and scores exactly like the trained LightGBM model', async () => {
    const r = on();
    expect(await r.ensureLoaded()).toBe(true);
    expect(r.status().version).toBe('fixture');
    expect(r.formulaVersion()).toBe('ranker:fixture');
    const got = await r.score(expected.rows);
    expect(got).not.toBeNull();
    expect(Array.from(got!)).toHaveLength(expected.scores.length);
    Array.from(got!).forEach((s, i) =>
      expect(s).toBeCloseTo(expected.scores[i], 5),
    );
  });

  it('no model at the key: everyone keeps the formula (no test, no scores)', async () => {
    const r = on({
      'reco.ranker.model_key': `file:${join(FIXTURE, 'missing/model.onnx')}`,
    });
    expect(await r.ensureLoaded()).toBe(false);
    expect(r.status().failed).toMatch(/ENOENT|no such file/);
    expect(await r.assign('u1')).toBeNull();
    expect(await r.score(expected.rows)).toBeNull();
  });

  it('an empty or foreign model key means no model', async () => {
    expect(await on({ 'reco.ranker.model_key': '' }).assign('u1')).toBeNull();
    const r = on({ 'reco.ranker.model_key': 'https://example.com/model.onnx' });
    expect(await r.ensureLoaded()).toBe(false);
    expect(await r.assign('u1')).toBeNull();
  });

  it('a model trained on other features is refused (formula kept)', async () => {
    const key = withManifest((m) => {
      m.features = [...RANKER_FEATURE_SPEC.features].reverse();
    });
    const r = on({ 'reco.ranker.model_key': key });
    expect(await r.ensureLoaded()).toBe(false);
    expect(r.status().failed).toMatch(/features differ/);
    expect(await r.assign('u1')).toBeNull();
  });

  it('a model file that does not match its manifest sha256 is refused', async () => {
    const key = withManifest((m) => {
      m.sha256 = '0'.repeat(64);
    });
    const r = on({ 'reco.ranker.model_key': key });
    expect(await r.ensureLoaded()).toBe(false);
    expect(r.status().failed).toMatch(/sha256/);
  });

  it('manifestProblem names what is wrong', () => {
    expect(manifestProblem(null)).toMatch(/not an object/);
    expect(
      manifestProblem({
        version: 'v',
        feature_spec_version: 'old',
        features: [],
      }),
    ).toMatch(/feature spec/);
  });

  it('A/B assignment is deterministic (GrowthBook hash v2, key post_ranker) and splits by the shares', async () => {
    const a = on();
    await a.ensureLoaded();
    const b = on(); // another pod
    await b.ensureLoaded();
    const ids = Array.from({ length: 2000 }, (_, i) => `user-${i}`);
    let model = 0;
    for (const id of ids) {
      const x = await a.assign(id);
      const y = await b.assign(id);
      expect(x).toEqual(y);
      expect(x?.experimentKey).toBe(RANKER_EXPERIMENT_KEY);
      expect(x?.variant).toBe(
        assignVariant(
          id,
          RANKER_EXPERIMENT_KEY,
          [
            { key: 'control', weight: 50 },
            { key: 'model', weight: 50 },
          ],
          100,
          2,
        ),
      );
      if (PostRankerService.isModelArm(x)) model++;
    }
    expect(model / ids.length).toBeGreaterThan(0.45);
    expect(model / ids.length).toBeLessThan(0.55);
  });

  it('traffic share: 0 = nobody; ramping 10% → 50% keeps everyone already inside', async () => {
    const zero = on({ 'reco.ranker.traffic_percent': 0 });
    await zero.ensureLoaded();
    expect(await zero.assign('user-1')).toBeNull();
    const ten = on({ 'reco.ranker.traffic_percent': 10 });
    const fifty = on({ 'reco.ranker.traffic_percent': 50 });
    await ten.ensureLoaded();
    await fifty.ensureLoaded();
    let inside = 0;
    for (let i = 0; i < 1000; i++) {
      const t = await ten.assign(`u${i}`);
      if (!t) continue;
      inside++;
      expect(await fifty.assign(`u${i}`)).toEqual(t);
    }
    expect(inside).toBeGreaterThan(50);
    expect(inside).toBeLessThan(150);
  });

  it('«Авто» runs the test only for a model that beat the formula offline', async () => {
    const good = on({ 'reco.ranker.mode': 'auto' });
    await good.ensureLoaded();
    expect(await good.assign('user-1')).not.toBeNull();
    const worseKey = withManifest((m) => {
      m.metrics = { k: 10, ndcg_formula: 0.6, ndcg_model: 0.5 };
    });
    const worse = on({
      'reco.ranker.mode': 'auto',
      'reco.ranker.model_key': worseKey,
    });
    await worse.ensureLoaded();
    expect(await worse.assign('user-1')).toBeNull();
    // «Вкл» is the owner's call: the same model runs.
    const forced = on({ 'reco.ranker.model_key': worseKey });
    await forced.ensureLoaded();
    expect(await forced.assign('user-1')).not.toBeNull();
    // «Выкл» wins over everything.
    const off = on({ 'reco.ranker.mode': 'off' });
    await off.ensureLoaded();
    expect(await off.assign('user-1')).toBeNull();
  });

  it('«Авто» steps back to the formula when scoring is slower than the budget', async () => {
    const r = on({
      'reco.ranker.mode': 'auto',
      'reco.ranker.latency_budget_ms': 1,
    });
    await r.ensureLoaded();
    const slow = (r as unknown as { latencies: number[] }).latencies;
    for (let i = 0; i < 30; i++) slow.push(5);
    expect(await r.assign('user-1')).toBeNull();
  });

  it('reads S3 through the injected source (production path) and never throws into a request', async () => {
    const read = jest.fn((key: string) =>
      key.endsWith('manifest.json')
        ? Promise.resolve(readFileSync(join(FIXTURE, 'manifest.json')))
        : Promise.resolve(readFileSync(MODEL)),
    );
    const source: RankerModelSource = { read };
    const r = new PostRankerService(
      settingsWith({
        'reco.ranker.mode': 'on',
        'reco.ranker.traffic_percent': 100,
        'reco.ranker.model_key': 'ml/feed-ranker/r202612011530/model.onnx',
      }),
      undefined,
      source,
    );
    expect(await r.ensureLoaded()).toBe(true);
    expect(read).toHaveBeenCalledWith(
      'ml/feed-ranker/r202612011530/model.onnx',
    );
    expect(read).toHaveBeenCalledWith(
      'ml/feed-ranker/r202612011530/manifest.json',
    );
    const broken = new PostRankerService(
      settingsWith({
        'reco.ranker.mode': 'on',
        'reco.ranker.model_key': 'ml/feed-ranker/x/model.onnx',
      }),
      undefined,
      { read: () => Promise.reject(new Error('S3 down')) },
    );
    expect(await broken.ensureLoaded()).toBe(false);
    expect(await broken.assign('u')).toBeNull();
  });

  it('latency: scoring 400 candidates stays far inside the request budget', async () => {
    const r = on();
    await r.ensureLoaded();
    const rows = Array.from({ length: 400 }, (_, i) => ({
      ...expected.rows[i % expected.rows.length],
    }));
    const times: number[] = [];
    for (let i = 0; i < 60; i++) {
      const t0 = performance.now();
      expect(await r.score(rows)).not.toBeNull();
      times.push(performance.now() - t0);
    }
    const ms = p95(times);
    // perf guard (perf-user.e2e-spec): 300 ms p95 per endpoint; the
    // default «Авто» budget is 15 ms. Measured 25.11 on the Mac: ~0.2 ms.
    console.log(`ranker scoring p95 for 400 candidates: ${ms.toFixed(3)} ms`);
    expect(ms).toBeLessThan(15);
  });
});
