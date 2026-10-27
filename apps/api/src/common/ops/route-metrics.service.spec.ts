import {
  emfRouteLine,
  isAbnormal,
  parseMode,
  RouteMetricsService,
  routeOf,
  ROUTES,
} from './route-metrics.service';
import type { SloMetricsService } from './slo-metrics.service';

describe('RouteMetricsService (S12-8, S12-3)', () => {
  const make = (mode?: 'off' | 'on' | 'auto') => {
    const slo = { count: jest.fn() };
    const settings = { string: jest.fn().mockResolvedValue(mode ?? 'on') };
    const svc = new RouteMetricsService(
      settings as never,
      slo as unknown as SloMetricsService,
    );
    // the mode is read from settings at start; set the value that read gives
    (svc as unknown as { mode: string }).mode = mode ?? 'on';
    return { svc, slo, settings };
  };

  afterEach(() => jest.restoreAllMocks());

  it('keeps the allow-list within the cost ceiling (15 routes x 3 metrics)', () => {
    expect(ROUTES.length).toBeLessThanOrEqual(15);
    expect(new Set(ROUTES.map((r) => r.name)).size).toBe(ROUTES.length);
  });

  it('maps an Express route (with the global prefix) to a journey route', () => {
    expect(routeOf('post', '/api/v1/conversations/:id/messages')?.name).toBe(
      'message_send',
    );
    expect(routeOf('GET', '/api/v1/conversations/:id/messages')?.name).toBe(
      'messages_list',
    );
    expect(routeOf('GET', '/api/v1/users/:id')).toBeNull();
    expect(routeOf('GET', undefined)).toBeNull();
  });

  it('parses the three-state mode, unknown values mean auto', () => {
    expect(parseMode('off')).toBe('off');
    expect(parseMode('on')).toBe('on');
    expect(parseMode('weird')).toBe('auto');
  });

  it('counts the feed and chat journey SLIs; 4xx counts for nothing', () => {
    const { svc, slo } = make();
    svc.record('GET', '/api/v1/feed', 200, 120);
    svc.record('GET', '/api/v1/feed', 200, 1500);
    svc.record('GET', '/api/v1/feed', 503, 30);
    svc.record('GET', '/api/v1/feed', 400, 5);
    svc.record('POST', '/api/v1/conversations/:id/messages', 201, 90);
    svc.record('POST', '/api/v1/conversations/:id/messages', 201, 6000);
    svc.record('POST', '/api/v1/conversations/:id/messages', 500, 10);
    svc.record('POST', '/api/v1/auth/password/login', 500, 10);
    svc.record('POST', '/api/v1/auth/password/login', 401, 10);
    const names = slo.count.mock.calls.map((c) => c[0] as string);
    expect(names.filter((n) => n === 'feedOk')).toHaveLength(1);
    expect(names.filter((n) => n === 'feedSlow')).toHaveLength(2);
    expect(names.filter((n) => n === 'msgSent')).toHaveLength(1);
    expect(names.filter((n) => n === 'msgAckLate')).toHaveLength(2);
    expect(names.filter((n) => n === 'loginFail')).toHaveLength(1);
  });

  it('writes one EMF line per route in mode on, none when off', () => {
    const write = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    const on = make('on');
    on.svc.record('GET', '/api/v1/feed', 200, 80);
    on.svc.record('GET', '/api/v1/feed', 200, 90);
    expect(on.svc.flush(1_000)).toBe(1);
    const line = JSON.parse(String(write.mock.calls[0][0]));
    expect(line.Route).toBe('feed_get');
    expect(line.Requests).toBe(2);
    expect(line._aws.CloudWatchMetrics[0].Namespace).toBe('LawBid/Routes');
    expect(line.LatencyMs.length).toBeGreaterThan(0);

    const off = make('off');
    off.svc.record('GET', '/api/v1/feed', 200, 80);
    expect(off.svc.flush()).toBe(0);
  });

  it('in auto mode a healthy minute writes nothing, a sick one does', () => {
    jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    const { svc } = make('auto');
    svc.record('GET', '/api/v1/feed', 200, 80);
    expect(svc.flush()).toBe(0);
    svc.record('GET', '/api/v1/feed', 500, 80);
    expect(svc.flush()).toBe(1);
    svc.record('GET', '/api/v1/feed', 200, 2000);
    expect(svc.flush()).toBe(1);
  });

  it('isAbnormal: 5xx or p95 above 1 s', () => {
    const fast = { n: 10, e: 0, b: [10, 0, 0, 0, 0, 0, 0, 0, 0] };
    const slow = { n: 10, e: 0, b: [0, 0, 0, 0, 0, 0, 10, 0, 0] };
    expect(isAbnormal(fast)).toBe(false);
    expect(isAbnormal(slow)).toBe(true);
    expect(isAbnormal({ ...fast, e: 1 })).toBe(true);
    expect(emfRouteLine('x', fast)).toContain('"Route":"x"');
  });
});
