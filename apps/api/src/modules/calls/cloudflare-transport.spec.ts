import {
  CF_BREAKER_CLOSE_OK_PROBES,
  CF_BREAKER_PROBE_MS,
  CF_VERIFY_EVERY_MS,
  CloudflareTransport,
  clientReportMin,
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
  get(k: string) {
    return Promise.resolve(this.live(k)?.v ?? null);
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
    probe.mockResolvedValue(undefined);
    // FO-6: three good probes in a row (one a minute, fleet-wide) close it.
    for (let k = 1; k < CF_BREAKER_CLOSE_OK_PROBES; k++) {
      now += CF_BREAKER_PROBE_MS;
      expect(await (k % 2 ? b : a).maybeProbe('turn', probe)).toBe(false);
      expect(await a.isOpen('turn')).toBe(true);
      expect((await b.state('turn')).probeOkStreak).toBe(k);
    }
    now += CF_BREAKER_PROBE_MS;
    expect(await b.maybeProbe('turn', probe)).toBe(true);
    expect(probe).toHaveBeenCalledTimes(1 + CF_BREAKER_CLOSE_OK_PROBES);
    expect(await a.isOpen('turn')).toBe(false);
    expect((await a.state('turn')).probeOkStreak).toBe(0);
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
      get: () => Promise.reject(new Error('redis down')),
      incr: () => Promise.reject(new Error('redis down')),
    };
    const t = new CloudflareTransport(broken as never, settings({}));
    expect(await t.recordFailure('sfu', 'x')).toBe(false);
    expect(await t.decide('sfu', true)).toMatchObject({ use: true });
  });
});

describe('phones report a dead relay at launch scale (TS-2 / CF-6, audit 2026-10-26)', () => {
  it('the minimum shrinks with the usage: 2 phones while calls are few, the admin cap at scale', () => {
    expect(clientReportMin(0, 10)).toBe(2);
    expect(clientReportMin(1, 10)).toBe(2);
    expect(clientReportMin(3, 10)).toBe(2);
    expect(clientReportMin(7, 10)).toBe(4);
    expect(clientReportMin(100, 10)).toBe(10);
    // The cap never goes under two phones.
    expect(clientReportMin(100, 1)).toBe(2);
  });

  it('2 distinct phones out of 3 Cloudflare calls open the breaker; one phone twice does not', async () => {
    const t = new CloudflareTransport(undefined, settings({}));
    for (let i = 0; i < 3; i++) await t.noteUse('turn');
    expect(await t.recordClientFailure('turn', 'a', 'ICE failed')).toBe(false);
    expect(await t.recordClientFailure('turn', 'a', 'ICE failed')).toBe(false);
    expect(await t.isOpen('turn')).toBe(false);
    expect(await t.recordClientFailure('turn', 'b', 'ICE failed')).toBe(true);
    expect(await t.isOpen('turn')).toBe(true);
    expect(await t.decide('turn', true)).toEqual({
      use: false,
      reason: 'breaker_open',
    });
  });

  it('two phones open it even before any call was counted in the window', async () => {
    const t = new CloudflareTransport(undefined, settings({}));
    await t.recordClientFailure('turn', 'a', 'ICE failed');
    expect(await t.isOpen('turn')).toBe(false);
    await t.recordClientFailure('turn', 'b', 'ICE failed');
    expect(await t.isOpen('turn')).toBe(true);
  });

  it('at scale the admin minimum and ratio hold: 29 of 100 is not enough (30 %), 30 is', async () => {
    const t = new CloudflareTransport(undefined, settings({}));
    for (let i = 0; i < 100; i++) await t.noteUse('turn');
    for (let i = 0; i < 29; i++) {
      expect(await t.recordClientFailure('turn', `p${i}`, 'x')).toBe(false);
    }
    expect(await t.isOpen('turn')).toBe(false);
    expect(await t.recordClientFailure('turn', 'p29', 'x')).toBe(true);
    expect(await t.isOpen('turn')).toBe(true);
  });

  it('calls.transport_report_min / _ratio_pct are admin settings', async () => {
    const t = new CloudflareTransport(
      undefined,
      settings({
        'calls.transport_report_min': 3,
        'calls.transport_report_ratio_pct': 50,
      }),
    );
    for (let i = 0; i < 10; i++) await t.noteUse('turn');
    // min = min(3, max(2, 5)) = 3 phones, and 50 % of 10 calls = 5.
    for (let i = 0; i < 4; i++) {
      expect(await t.recordClientFailure('turn', `p${i}`, 'x')).toBe(false);
    }
    expect(await t.recordClientFailure('turn', 'p4', 'x')).toBe(true);
    expect(await t.isOpen('turn')).toBe(true);
  });

  it('shared through Redis: two phones on two API instances open it for the fleet', async () => {
    const now = 2_000_000;
    const redis = new FakeRedis(() => now);
    const a = new CloudflareTransport(redis as never, settings({}), () => now);
    const b = new CloudflareTransport(redis as never, settings({}), () => now);
    await a.noteUse('turn');
    await b.noteUse('turn');
    expect(await a.recordClientFailure('turn', 'p1', 'x')).toBe(false);
    expect(await b.recordClientFailure('turn', 'p2', 'x')).toBe(true);
    expect(await a.isOpen('turn')).toBe(true);
    expect(await b.isOpen('turn')).toBe(true);
  });
});

describe('relay probe while the breaker is CLOSED (FO-2, audit 2026-10-26)', () => {
  const dead = () =>
    jest
      .fn()
      .mockRejectedValue(
        new Error('TURN Allocate on turn.cloudflare.com:3478: no answer'),
      );

  it('two Allocate failures in a row open the breaker; one does not; a good probe resets the run', async () => {
    let now = 1_000_000;
    const t = new CloudflareTransport(undefined, settings({}), () => now);
    const bad = dead();
    expect(await t.probe('turn', bad)).toBe(false);
    expect(await t.isOpen('turn')).toBe(false);
    // Counted as a real Cloudflare failure too (N in M with the calls').
    expect((await t.state('turn')).failures).toBe(1);
    expect(await t.lastProbe('turn')).toMatchObject({ ok: false });
    // The same minute: the slot is taken, nothing runs.
    expect(await t.probe('turn', bad)).toBe(false);
    expect(bad).toHaveBeenCalledTimes(1);
    now += CF_BREAKER_PROBE_MS;
    const good = jest.fn().mockResolvedValue(undefined);
    expect(await t.probe('turn', good)).toBe(false); // closed stays closed
    expect(await t.lastProbe('turn')).toMatchObject({ ok: true });
    now += CF_BREAKER_PROBE_MS;
    await t.probe('turn', bad);
    expect(await t.isOpen('turn')).toBe(false);
    now += CF_BREAKER_PROBE_MS;
    await t.probe('turn', bad);
    expect(await t.isOpen('turn')).toBe(true);
    expect(await t.decide('turn', true)).toEqual({
      use: false,
      reason: 'breaker_open',
    });
  });

  it('the failures in a row are shared through Redis (one probe a minute fleet-wide)', async () => {
    let now = 3_000_000;
    const redis = new FakeRedis(() => now);
    const a = new CloudflareTransport(redis as never, settings({}), () => now);
    const b = new CloudflareTransport(redis as never, settings({}), () => now);
    const bad = dead();
    await a.probe('turn', bad);
    expect(await b.probe('turn', bad)).toBe(false); // same slot
    expect(bad).toHaveBeenCalledTimes(1);
    now += CF_BREAKER_PROBE_MS;
    await b.probe('turn', bad);
    expect(await a.isOpen('turn')).toBe(true);
  });

  it('while open: the credential API answering is not enough, the Allocate must pass to close it', async () => {
    let now = 4_000_000;
    const t = new CloudflareTransport(
      undefined,
      settings({ 'calls.transport_fail_limit': 1 }),
      () => now,
    );
    await t.recordFailure('turn', 'down');
    const probe = dead(); // login OK, Allocate fails
    expect(await t.maybeProbe('turn', probe)).toBe(false);
    expect(await t.isOpen('turn')).toBe(true);
    probe.mockResolvedValue(undefined);
    for (let k = 1; k < CF_BREAKER_CLOSE_OK_PROBES; k++) {
      now += CF_BREAKER_PROBE_MS;
      expect(await t.probe('turn', probe)).toBe(false); // FO-6: not yet
    }
    now += CF_BREAKER_PROBE_MS;
    expect(await t.probe('turn', probe)).toBe(true);
    expect(await t.isOpen('turn')).toBe(false);
  });
  it('verify: a phone report checked from the API counts a real failure, at most once per 10 s, never while open', async () => {
    let now = 5_000_000;
    const t = new CloudflareTransport(
      undefined,
      settings({ 'calls.transport_fail_limit': 2 }),
      () => now,
    );
    const check = dead();
    expect(await t.verify('turn', check)).toBe(true);
    expect((await t.state('turn')).failures).toBe(1);
    expect(await t.verify('turn', check)).toBe(false); // the 10 s slot
    expect(check).toHaveBeenCalledTimes(1);
    now += CF_VERIFY_EVERY_MS;
    expect(await t.verify('turn', check)).toBe(true);
    expect(await t.isOpen('turn')).toBe(true);
    now += CF_VERIFY_EVERY_MS;
    expect(await t.verify('turn', check)).toBe(false); // open: nothing runs
    expect(check).toHaveBeenCalledTimes(2);
    // A relay that allocates counts nothing.
    const alive = new CloudflareTransport(undefined, settings({}), () => now);
    expect(await alive.verify('turn', jest.fn().mockResolvedValue(1))).toBe(
      false,
    );
    expect((await alive.state('turn')).failures).toBe(0);
  });
});

describe('switch-back hysteresis (FO-6, audit 2026-10-26)', () => {
  const opened = async (now: () => number, redis?: FakeRedis) => {
    const t = new CloudflareTransport(
      redis as never,
      settings({ 'calls.transport_fail_limit': 1 }),
      now,
    );
    await t.recordFailure('sfu', 'down');
    expect(await t.isOpen('sfu')).toBe(true);
    return t;
  };

  it('ok, fail, ok -> still open (the run restarts); ok, ok, ok -> closed', async () => {
    let now = 7_000_000;
    const t = await opened(() => now);
    const good = jest.fn().mockResolvedValue(undefined);
    const bad = jest.fn().mockRejectedValue(new Error('flap'));
    now += CF_BREAKER_PROBE_MS;
    expect(await t.probe('sfu', good)).toBe(false);
    expect((await t.state('sfu')).probeOkStreak).toBe(1);
    now += CF_BREAKER_PROBE_MS;
    expect(await t.probe('sfu', bad)).toBe(false);
    expect((await t.state('sfu')).probeOkStreak).toBe(0); // reset
    expect(await t.isOpen('sfu')).toBe(true);
    now += CF_BREAKER_PROBE_MS;
    expect(await t.probe('sfu', good)).toBe(false);
    expect(await t.isOpen('sfu')).toBe(true); // a flapping Cloudflare stays on the backup
    now += CF_BREAKER_PROBE_MS;
    expect(await t.probe('sfu', good)).toBe(false);
    now += CF_BREAKER_PROBE_MS;
    expect(await t.probe('sfu', good)).toBe(true);
    expect(await t.isOpen('sfu')).toBe(false);
    expect(await t.decide('sfu', true)).toEqual({
      use: true,
      reason: 'cloudflare',
    });
  });

  it('the good-probe streak is shared through Redis (any instance may close it)', async () => {
    let now = 8_000_000;
    const redis = new FakeRedis(() => now);
    const a = await opened(() => now, redis);
    const b = new CloudflareTransport(
      redis as never,
      settings({ 'calls.transport_fail_limit': 1 }),
      () => now,
    );
    const good = jest.fn().mockResolvedValue(undefined);
    now += CF_BREAKER_PROBE_MS;
    await a.probe('sfu', good);
    now += CF_BREAKER_PROBE_MS;
    await b.probe('sfu', good);
    expect((await a.state('sfu')).probeOkStreak).toBe(2);
    now += CF_BREAKER_PROBE_MS;
    expect(await a.probe('sfu', good)).toBe(true);
    expect(await b.isOpen('sfu')).toBe(false);
    expect((await b.state('sfu')).probeOkStreak).toBe(0);
  });

  it('CF-1: trip() opens the breaker at once (a wrong App ID needs no N in M)', async () => {
    const t = new CloudflareTransport(undefined, settings({}));
    const seen: string[] = [];
    t.onOpen((p) => seen.push(p));
    expect(await t.trip('sfu', 'refuses the App ID', 'HTTP 404')).toBe(true);
    expect(await t.isOpen('sfu')).toBe(true);
    expect(seen).toEqual(['sfu']);
    // A second trip changes nothing (SET NX).
    expect(await t.trip('sfu', 'again', 'HTTP 404')).toBe(false);
    expect(seen).toEqual(['sfu']);
  });
});
