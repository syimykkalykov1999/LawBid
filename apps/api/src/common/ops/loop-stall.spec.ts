import {
  LoopStallService,
  openWork,
  resetOpenWork,
  stallReport,
  trackWork,
  withWork,
} from './loop-stall';

/** F3 (14.11): one log line per event-loop stall, naming GC and open work. */
describe('loop stall log', () => {
  afterEach(() => resetOpenWork());

  it('below the threshold or with the setting at 0 nothing is reported', () => {
    expect(stallReport(500, 499, [], [], 200)).toBeNull();
    expect(stallReport(0, 5000, [], [], 200)).toBeNull();
  });

  it('a stall names the garbage collections (longest first) and the open work', () => {
    const r = stallReport(
      500,
      812,
      [
        { kind: 'minor', ms: 4 },
        { kind: 'major', ms: 790 },
      ],
      [{ work: 'GET /api/v1/admin/system-health', openMs: 900 }],
      203,
    );
    expect(r).toEqual({
      stallMs: 812,
      gc: [
        { kind: 'major', ms: 790 },
        { kind: 'minor', ms: 4 },
      ],
      gcMs: 794,
      open: [{ work: 'GET /api/v1/admin/system-health', openMs: 900 }],
      heapUsedMb: 203,
    });
  });

  it('open work is listed while it runs and gone when it ends', async () => {
    const end = trackWork('GET /api/v1/i18n/bundle/:lang');
    let inside: string[] = [];
    await withWork('job admin.summaries', () => {
      inside = openWork().map((w) => w.work);
      return Promise.resolve();
    });
    expect(inside.sort()).toEqual([
      'GET /api/v1/i18n/bundle/:lang',
      'job admin.summaries',
    ]);
    end();
    end();
    expect(openWork()).toEqual([]);
  });

  it('a label is read lazily (the route template is known only after routing)', () => {
    const req: { route?: string } = {};
    trackWork(() => req.route ?? '/raw/path');
    req.route = '/api/v1/cases/:id';
    expect(openWork()[0].work).toBe('/api/v1/cases/:id');
  });

  it('the admin setting switches the sampler on and off live', async () => {
    let value = 500;
    const svc = new LoopStallService({
      number: () => Promise.resolve(value),
    } as never);
    await svc.loadThreshold();
    expect(svc.sample()).toBeNull(); // on, no stall yet
    value = 0;
    await svc.loadThreshold();
    expect(svc.sample()).toBeNull(); // off: no histogram at all
    svc.onApplicationShutdown();
  });
});
