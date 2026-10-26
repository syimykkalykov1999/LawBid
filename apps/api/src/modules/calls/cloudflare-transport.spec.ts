import {
  CF_BREAKER_PROBE_MS,
  CloudflareTransport,
  parseTransport,
} from './cloudflare-transport';

/** The few Redis commands the breaker uses, with real expiry by a clock. */
class FakeRedis {
  status = 'ready';
  private kv = new Map<string, { v: string; until: number | null }>();
  constructor(private readonly now: () => number) {}
  private live(k: string) {
    const e = this.kv.get(k);
    if (e && e.until !== null && e.until <= this.now()) this.kv.delete(k);
    return this.kv.get(k);
  }
  incr(k: string) {
    const e = this.live(k);
    const n = Number(e?.v ?? 0) + 1;
    this.kv.set(k, { v: String(n), until: e?.until ?? null });
    return Promise.resolve(n);
  }
  pexpire(k: string, ms: number) {
    const e = this.live(k);
    if (e) e.until = this.now() + ms;
    return Promise.resolve(1);
  }
  set(k: string, v: string, unit: 'EX' | 'PX', n: number, nx: 'NX') {
    void nx;
    if (this.live(k)) return Promise.resolve(null);
    this.kv.set(k, {
      v,
      until: this.now() + (unit === 'EX' ? n * 1000 : n),
    });
    return Promise.resolve('OK');
  }
  mget(...ks: string[]) {
    return Promise.resolve(ks.map((k) => this.live(k)?.v ?? null));
  }
  del(...ks: string[]) {
    ks.forEach((k) => this.kv.delete(k));
    return Promise.resolve(ks.length);
  }
}

const settings = (s: Record<string, string | number>) => ({
  string: (k: string) => Promise.resolve(String(s[k] ?? 'auto')),
  number: (k: string) =>
    Promise.resolve(
      Number(
        s[k] ??
          (
            {
              'calls.transport_fail_limit': 5,
              'calls.transport_fail_window_sec': 120,
            } as Record<string, number>
          )[k],
      ),
    ),
});

describe('CloudflareTransport (shared breaker, owner 2026-10-26)', () => {
  it('reads calls.transport with auto as the default', () => {
    expect(parseTransport('own')).toBe('own');
    expect(parseTransport('cloudflare')).toBe('cloudflare');
    expect(parseTransport('p2p')).toBe('auto');
    expect(parseTransport(undefined)).toBe('auto');
  });

  it('no keys = own path; keys + closed breaker = Cloudflare', async () => {
    const t = new CloudflareTransport(undefined, settings({}));
    expect(await t.decide('turn', false)).toEqual({
      use: false,
      reason: 'no_keys',
    });
    expect(await t.decide('turn', true)).toEqual({
      use: true,
      reason: 'cloudflare',
    });
  });

  it('N failures in M seconds open it for every API instance (Redis); older failures expire', async () => {
    let now = 1_000_000;
    const redis = new FakeRedis(() => now);
    const s = settings({
      'calls.transport_fail_limit': 3,
      'calls.transport_fail_window_sec': 60,
    });
    const a = new CloudflareTransport(redis as never, s, () => now);
    const b = new CloudflareTransport(redis as never, s, () => now);
    await a.recordFailure('sfu', 'x');
    await b.recordFailure('sfu', 'x');
    now += 61_000; // the window passed: counting starts again
    await a.recordFailure('sfu', 'x');
    expect(await b.isOpen('sfu')).toBe(false);
    await b.recordFailure('sfu', 'x');
    expect(await a.recordFailure('sfu', 'x')).toBe(true);
    // Another instance sees it at once; TURN has its own breaker.
    expect(await b.decide('sfu', true)).toEqual({
      use: false,
      reason: 'breaker_open',
    });
    expect(await b.isOpen('turn')).toBe(false);
  });

  it('while open: one probe a minute across instances; success closes it', async () => {
    let now = 5_000_000;
    const redis = new FakeRedis(() => now);
    const s = settings({ 'calls.transport_fail_limit': 1 });
    const a = new CloudflareTransport(redis as never, s, () => now);
    const b = new CloudflareTransport(redis as never, s, () => now);
    await a.recordFailure('turn', 'down');
    const probe = jest.fn().mockRejectedValue(new Error('still down'));
    expect(await a.maybeProbe('turn', probe)).toBe(false);
    expect(await b.maybeProbe('turn', probe)).toBe(false);
    expect(probe).toHaveBeenCalledTimes(1);
    now += CF_BREAKER_PROBE_MS;
    probe.mockResolvedValue(undefined);
    expect(await b.maybeProbe('turn', probe)).toBe(true);
    expect(probe).toHaveBeenCalledTimes(2);
    expect(await a.isOpen('turn')).toBe(false);
    expect(await a.decide('turn', true)).toMatchObject({ use: true });
  });

  it('a healthy Cloudflare is never probed', async () => {
    const t = new CloudflareTransport(undefined, settings({}));
    const probe = jest.fn();
    await t.decide('sfu', true, probe);
    expect(await t.maybeProbe('sfu', probe)).toBe(false);
    expect(probe).not.toHaveBeenCalled();
  });

  it('calls.transport own / cloudflare override the breaker', async () => {
    const own = new CloudflareTransport(
      undefined,
      settings({ 'calls.transport': 'own' }),
    );
    expect(await own.decide('turn', true)).toEqual({
      use: false,
      reason: 'own_forced',
    });
    const cf = new CloudflareTransport(
      undefined,
      settings({
        'calls.transport': 'cloudflare',
        'calls.transport_fail_limit': 1,
      }),
    );
    await cf.recordFailure('turn', 'x');
    expect(await cf.decide('turn', true)).toEqual({
      use: true,
      reason: 'forced_cloudflare',
    });
  });

  it('a Redis error never blocks a call: read as closed', async () => {
    const broken = {
      status: 'ready',
      mget: () => Promise.reject(new Error('redis down')),
      incr: () => Promise.reject(new Error('redis down')),
    };
    const t = new CloudflareTransport(broken as never, settings({}));
    expect(await t.recordFailure('sfu', 'x')).toBe(false);
    expect(await t.decide('sfu', true)).toMatchObject({ use: true });
  });
});
