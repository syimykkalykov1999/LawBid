import {
  GENERATOR_MANIFEST_KEY,
  SeoGenerateJob,
  WORKFLOW_MANIFEST_KEY,
  pageKey,
} from './seo-generate.job';
import { SEO_LAST_RUN_KEY } from '../../common/seo/seo-generator.trigger';
import type {
  SeoAttorneyRow,
  SeoLib,
} from '../../modules/public-directory/seo-lib';
import type { SeoWebStore } from '../../modules/public-directory/seo-web-store';

const row = (u: string): SeoAttorneyRow => ({
  username: u,
  displayName: u,
  bio: null,
  firmNames: [],
  languages: [],
  ratingAvg: 0,
  ratingCount: 0,
  trustBadge: false,
  photoUrl: null,
  practiceAreas: [],
  licensedStates: ['CA'],
  updatedAt: '2026-10-20T09:15:00.000Z',
});

/** A small stand-in for scripts/seo/lib (Jest cannot load ES modules). The
 * real library is covered by scripts/seo/test/*.test.mjs. */
function fakeLib(): SeoLib & {
  renderSite: jest.Mock;
  planPublish: jest.Mock;
} {
  const planFiles: SeoLib['planFiles'] = ({ files, prevFiles }) => {
    const prev = prevFiles ?? {};
    const upload = Object.keys(files)
      .filter((k) => prev[k] !== files[k])
      .sort();
    return {
      upload,
      changed: upload.filter((k) => k in prev),
      remove: Object.keys(prev)
        .filter((k) => !(k in files))
        .sort(),
    };
  };
  return {
    renderSite: jest.fn((attorneys: SeoAttorneyRow[]) => ({
      files: new Map<string, string>([
        ['/lawyers/', '<home>'],
        ...attorneys.map((a): [string, string] => [
          `/attorneys/${a.username}/`,
          `<p>${a.username}:${a.updatedAt}</p>`,
        ]),
      ]),
      result: {},
    })),
    sha256: (d) => `h(${String(d)})`,
    planFiles,
    planPublish: jest.fn(({ files, prev, today, maxInvalidations }) => {
      const prevFiles = (prev as { files?: Record<string, string> } | null)
        ?.files;
      const p = planFiles({ files, prevFiles });
      const prevCount = Object.keys(prevFiles ?? {}).length;
      return {
        ...p,
        unchanged: Object.keys(files).length - p.upload.length,
        massDelete: p.remove.length > 100 && p.remove.length > 0.3 * prevCount,
        invalidate: prev
          ? p.changed.map((k) => `/${k}`).slice(0, maxInvalidations ?? 30)
          : [],
        skippedInvalidations: 0,
        manifest: { files, builtAt: today },
      };
    }),
    deleteBatches: (keys) => [
      { Objects: keys.map((Key) => ({ Key })), Quiet: true },
    ],
    defaultGate: {
      enabled: false,
      minWords: 300,
      minAttorneys: 3,
      minBioChars: 150,
    },
    clampMax: () => 10000,
  };
}

function fakeStore(initial: Record<string, string> = {}) {
  const objects = new Map(Object.entries(initial));
  const order: string[] = [];
  const getText = jest.fn((k: string) =>
    Promise.resolve(objects.get(k) ?? null),
  );
  const put = jest.fn((k: string, body: string) => {
    order.push(k);
    objects.set(k, body);
    return Promise.resolve();
  });
  const deleteMany = jest.fn((keys: string[]) => {
    for (const k of keys) objects.delete(k);
    return Promise.resolve();
  });
  const store: SeoWebStore = { getText, put, deleteMany };
  return { store, getText, put, deleteMany, objects, order };
}

interface Opts {
  mode?: string;
  env?: Record<string, string>;
  attorneys?: string[];
  store?: ReturnType<typeof fakeStore>;
  maxAttorneys?: number;
  maxUploads?: number;
  rowsPerCall?: number;
  maxInvalidations?: number;
}

function make(o: Opts = {}) {
  const names = o.attorneys ?? ['anna', 'bob'];
  const directory = {
    attorneys: jest.fn(({ cursor }: { cursor?: string }) => {
      const start = cursor ? Number(cursor) : 0;
      const size = o.rowsPerCall ?? 100;
      const items = names.slice(start, start + size).map(row);
      return Promise.resolve({
        items,
        nextCursor: start + size < names.length ? String(start + size) : null,
      });
    }),
  };
  const settings = {
    string: jest.fn(() => Promise.resolve(o.mode ?? 'nightly')),
    number: jest.fn((k: string) =>
      Promise.resolve(
        {
          'seo.generator_max_attorneys': o.maxAttorneys ?? 5000,
          'seo.generator_max_uploads_per_run': o.maxUploads ?? 2000,
          'seo.max_invalidation_paths_per_day': o.maxInvalidations ?? 30,
        }[k] ?? 0,
      ),
    ),
  };
  const env: Record<string, string> = {
    SEO_WEB_BUCKET: 'web-bucket',
    SEO_SITE_URL: 'https://example.test',
    SEO_WEB_DISTRIBUTION_ID: 'E1234567890AB',
    ...o.env,
  };
  const config = { get: (k: string) => env[k] };
  const redis = { set: jest.fn(() => Promise.resolve('OK')) };
  const trigger = { afterRun: jest.fn(() => Promise.resolve(null)) };
  const lib = fakeLib();
  const s = o.store ?? fakeStore();
  const sender = jest.fn(() => Promise.resolve());
  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const Ctor = SeoGenerateJob as unknown as new (
    ...a: unknown[]
  ) => SeoGenerateJob;
  const job = new Ctor(
    config,
    directory,
    logger,
    settings,
    redis,
    trigger,
    lib,
    s.store,
    sender,
  );
  const sleep = jest.fn(() => Promise.resolve());
  (job as unknown as { sleep: typeof sleep }).sleep = sleep;
  return {
    job,
    sleep,
    directory,
    settings,
    redis,
    trigger,
    lib,
    store: s,
    sender,
    logger,
  };
}

describe('SeoGenerateJob', () => {
  it('off (the default): returns at once, reads and writes nothing', async () => {
    const t = make({ mode: 'off' });
    expect(await t.job.run()).toEqual({ skipped: 'off' });
    expect(t.directory.attorneys).not.toHaveBeenCalled();
    expect(t.lib.renderSite).not.toHaveBeenCalled();
    expect(t.store.getText).not.toHaveBeenCalled();
    expect(t.store.put).not.toHaveBeenCalled();
    expect(t.redis.set).not.toHaveBeenCalled();
  });

  it('an unknown mode counts as off', async () => {
    const t = make({ mode: 'events' });
    expect(await t.job.run()).toEqual({ skipped: 'off' });
    expect(t.directory.attorneys).not.toHaveBeenCalled();
  });

  it('on without a bucket or site url: skipped, nothing read', async () => {
    const t = make({ env: { SEO_WEB_BUCKET: '' } });
    expect(await t.job.run()).toMatchObject({ skipped: expect.any(String) });
    expect(t.directory.attorneys).not.toHaveBeenCalled();
    expect(t.store.put).not.toHaveBeenCalled();
  });

  it('first run: every page goes up, the manifest last, no CDN reset', async () => {
    const t = make();
    const r = await t.job.run();
    expect(r).toMatchObject({
      pages: 3,
      attorneys: 2,
      uploaded: 3,
      removed: 0,
      invalidated: 0,
    });
    expect(t.store.order).toEqual([
      'attorneys/anna/index.html',
      'attorneys/bob/index.html',
      'lawyers/index.html',
      GENERATOR_MANIFEST_KEY,
    ]);
    expect(t.store.put).toHaveBeenCalledWith(
      'lawyers/index.html',
      '<home>',
      'text/html; charset=utf-8',
      'public,max-age=3600',
    );
    expect(t.sender).not.toHaveBeenCalled();
    expect(t.redis.set).toHaveBeenCalledWith(
      SEO_LAST_RUN_KEY,
      expect.any(String),
      'EX',
      604800,
    );
    expect(t.trigger.afterRun).toHaveBeenCalledTimes(1);
  });

  it('second run with one change and one removal: only those are touched, the CDN reset is for the changed page', async () => {
    const first = make();
    await first.job.run();
    const second = make({ attorneys: ['anna'], store: first.store });
    first.store.put.mockClear();
    const r = await second.job.run();
    expect(r).toMatchObject({ uploaded: 0, removed: 1, unchanged: 2 });
    expect(first.store.deleteMany).toHaveBeenCalledWith([
      'attorneys/bob/index.html',
    ]);
    // only the manifest was written
    expect(first.store.put.mock.calls.map((c) => c[0])).toEqual([
      GENERATOR_MANIFEST_KEY,
    ]);
  });

  it('a changed page is re-uploaded and its path sent to CloudFront', async () => {
    const first = make();
    await first.job.run();
    const second = make({ store: first.store });
    second.lib.renderSite.mockImplementation((a: SeoAttorneyRow[]) => ({
      files: new Map<string, string>([
        ['/lawyers/', '<home>'],
        ...a.map((x): [string, string] => [
          `/attorneys/${x.username}/`,
          x.username === 'bob'
            ? '<new bob>'
            : `<p>${x.username}:${x.updatedAt}</p>`,
        ]),
      ]),
      result: {},
    }));
    first.store.put.mockClear();
    const r = await second.job.run();
    expect(r).toMatchObject({ uploaded: 1, invalidated: 1 });
    expect(second.sender).toHaveBeenCalledWith({
      distributionId: 'E1234567890AB',
      paths: ['/attorneys/bob/index.html'],
      callerReference: expect.stringMatching(/^seo-gen-\d+$/),
    });
  });

  /** A second run whose home page changed, so one path wants a reset. */
  async function changedRun(o: Opts = {}) {
    const first = make();
    await first.job.run();
    const second = make({ store: first.store, ...o });
    second.lib.renderSite.mockImplementation(() => ({
      files: new Map([['/lawyers/', '<changed>']]),
      result: {},
    }));
    return second;
  }

  it('asks for exact paths only and never a budget above 30 a day, whatever the setting says', async () => {
    const t = await changedRun({ maxInvalidations: 500 });
    await t.job.run();
    expect(t.lib.planPublish).toHaveBeenCalledWith(
      expect.objectContaining({ exactOnly: true, maxInvalidations: 30 }),
    );
    const t2 = await changedRun({ maxInvalidations: 12 });
    await t2.job.run();
    expect(t2.lib.planPublish).toHaveBeenCalledWith(
      expect.objectContaining({ exactOnly: true, maxInvalidations: 12 }),
    );
  });

  it("the next run starts from the previous run's manifest (the day's counter lives there)", async () => {
    const t = await changedRun();
    await t.job.run();
    const prev = t.lib.planPublish.mock.calls[0][0].prev as {
      files: Record<string, string>;
    };
    expect(Object.keys(prev.files)).toContain('lawyers/index.html');
  });

  it('never sends a wildcard and never more than 30 paths, even if the plan holds more', async () => {
    const t = await changedRun();
    const many = Array.from({ length: 45 }, (_, i) => `/attorneys/u${i}/`);
    const planned = t.lib.planPublish.getMockImplementation() as
      SeoLib['planPublish'] | undefined;
    t.lib.planPublish.mockImplementation(
      (a: Parameters<SeoLib['planPublish']>[0]) => ({
        ...planned!(a),
        invalidate: ['/*', '/attorneys/*', ...many],
      }),
    );
    const r = await t.job.run();
    const sent = (t.sender.mock.calls[0] as unknown as [{ paths: string[] }])[0]
      .paths;
    expect(sent).toHaveLength(30);
    expect(sent.some((p) => p.includes('*'))).toBe(false);
    expect(sent).toEqual(many.slice(0, 30));
    expect(r).toMatchObject({ invalidated: 30 });
  });

  it('waits while CloudFront is busy (30 s, then 90 s) and then resets', async () => {
    const t = await changedRun();
    const busy = new Error(
      'CloudFront invalidation refused: 400 TooManyInvalidationsInProgress',
    );
    t.sender
      .mockRejectedValueOnce(busy)
      .mockRejectedValueOnce(busy)
      .mockResolvedValueOnce(undefined);
    const r = await t.job.run();
    expect(t.sender).toHaveBeenCalledTimes(3);
    expect(t.sleep.mock.calls).toEqual([[30_000], [90_000]]);
    expect(r).toMatchObject({ invalidated: 1 });
  });

  it('still busy after 3 tries: a warning, no failure, the manifest is stored', async () => {
    const t = await changedRun();
    t.sender.mockRejectedValue(new Error('400 TooManyInvalidationsInProgress'));
    const r = await t.job.run();
    expect(t.sender).toHaveBeenCalledTimes(3);
    expect(r).toMatchObject({ invalidated: 0 });
    expect(t.logger.warn).toHaveBeenCalled();
    expect(t.store.objects.has(GENERATOR_MANIFEST_KEY)).toBe(true);
  });

  it('a failed CloudFront call does not fail the run and the manifest is still stored', async () => {
    const first = make();
    await first.job.run();
    const second = make({ store: first.store });
    second.lib.renderSite.mockImplementation(() => ({
      files: new Map([['/lawyers/', '<changed>']]),
      result: {},
    }));
    second.sender.mockRejectedValue(new Error('throttled'));
    const r = await second.job.run();
    expect(r).toMatchObject({ invalidated: 0 });
    expect(second.logger.warn).toHaveBeenCalled();
    expect(first.store.objects.has(GENERATOR_MANIFEST_KEY)).toBe(true);
  });

  it('reads the directory 100 rows at a time (one read per page, no per-row queries)', async () => {
    const names = Array.from({ length: 250 }, (_, i) => `a${i}`);
    const t = make({ attorneys: names });
    await t.job.run();
    expect(t.directory.attorneys).toHaveBeenCalledTimes(3);
    expect(t.directory.attorneys).toHaveBeenNthCalledWith(1, {
      limit: 100,
      cursor: undefined,
    });
    expect(t.directory.attorneys).toHaveBeenNthCalledWith(2, {
      limit: 100,
      cursor: '100',
    });
    expect(t.lib.renderSite).toHaveBeenCalledTimes(1);
  });

  it('refuses (and writes nothing) when there are more attorneys than the limit', async () => {
    const t = make({ attorneys: ['a', 'b', 'c'], maxAttorneys: 2 });
    expect(await t.job.run()).toEqual({
      skipped: 'more attorneys than the limit',
    });
    expect(t.lib.renderSite).not.toHaveBeenCalled();
    expect(t.store.put).not.toHaveBeenCalled();
    expect(t.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ alert: 'seo_generator_too_many' }),
      expect.any(String),
    );
  });

  it('refuses a run that would remove over 30% of the published pages', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 200; i++)
      files[`attorneys/x${i}/index.html`] = `h(<p>x${i}</p>)`;
    const prior = fakeStore({
      [GENERATOR_MANIFEST_KEY]: JSON.stringify({ files }),
    });
    const t = make({ attorneys: [], store: prior });
    expect(await t.job.run()).toEqual({
      skipped: 'would remove over 30% of the pages',
    });
    expect(prior.deleteMany).not.toHaveBeenCalled();
    expect(prior.put).not.toHaveBeenCalled();
    expect(t.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ alert: 'seo_generator_mass_delete' }),
      expect.any(String),
    );
  });

  it('uploads at most seo.generator_max_uploads_per_run; the rest stays out of the manifest and waits for the next run', async () => {
    const t = make({ attorneys: ['a', 'b', 'c', 'd'], maxUploads: 2 });
    const r = await t.job.run();
    expect(r).toMatchObject({ uploaded: 2, deferred: 3 });
    const manifest = JSON.parse(
      t.store.objects.get(GENERATOR_MANIFEST_KEY)!,
    ) as { files: Record<string, string> };
    expect(Object.keys(manifest.files)).toHaveLength(2);
    const next = make({
      attorneys: ['a', 'b', 'c', 'd'],
      maxUploads: 2,
      store: t.store,
    });
    expect(await next.job.run()).toMatchObject({ uploaded: 2, deferred: 1 });
  });

  it('uses the workflow manifest read-only as the previous page state for the library', async () => {
    const t = make({
      store: fakeStore({
        [WORKFLOW_MANIFEST_KEY]: JSON.stringify({
          pages: { '/lawyers/': { hash: 'x' } },
        }),
      }),
    });
    await t.job.run();
    const opts = t.lib.renderSite.mock.calls[0][1] as { prev: unknown };
    expect(opts.prev).toEqual({ pages: { '/lawyers/': { hash: 'x' } } });
    expect(t.store.put.mock.calls.map((c) => c[0])).not.toContain(
      WORKFLOW_MANIFEST_KEY,
    );
  });

  it('passes the SEO_* switches to the library exactly as build.mjs reads them (all off when unset)', async () => {
    const off = make();
    await off.job.run();
    expect(off.lib.renderSite.mock.calls[0][1]).toMatchObject({
      site: 'https://example.test',
      indexEmpty: false,
      rampPerDay: 0,
      gate: {
        enabled: false,
        minWords: 300,
        minAttorneys: 3,
        minBioChars: 150,
      },
    });
    const on = make({
      env: {
        SEO_QUALITY_GATE: '1',
        SEO_RAMP_PER_DAY: '200',
        SEO_MIN_WORDS: '120',
        SEO_INDEX_EMPTY: 'true',
      },
    });
    await on.job.run();
    expect(on.lib.renderSite.mock.calls[0][1]).toMatchObject({
      indexEmpty: true,
      rampPerDay: 200,
      gate: { enabled: true, minWords: 120 },
    });
  });

  it('page keys: a page path is a folder with index.html', () => {
    expect(pageKey('/lawyers/')).toBe('lawyers/index.html');
    expect(pageKey('/lawyers/california/divorce/')).toBe(
      'lawyers/california/divorce/index.html',
    );
  });
});
