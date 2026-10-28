import { CallsService, DEFAULT_STUN_URLS } from './calls.service';
import type { RelayCheck } from './cloudflare-relay-probe';
import {
  CF_BREAKER_CLOSE_OK_PROBES,
  CF_BREAKER_PROBE_MS,
  CloudflareTransport,
} from './cloudflare-transport';
import { clearCloudflareTurnCache } from './cloudflare-turn';

/** The relay answers STUN and allocates (unit tests never touch UDP). */
const relayAlive: RelayCheck = (target) =>
  Promise.resolve({
    target: `${target.host}:${target.port}`,
    stun: { ok: true, ms: 1 },
    turn: { ok: true, ms: 1 },
  });
const relayDead: RelayCheck = (target) =>
  Promise.resolve({
    target: `${target.host}:${target.port}`,
    stun: { ok: true, ms: 1 },
    turn: { ok: false, ms: 2000, error: 'no answer in 2000 ms' },
  });

const TOKEN = 'cf-secret-token-0123456789';
const CF_RESPONSE = {
  iceServers: [
    { urls: ['stun:stun.cloudflare.com:3478'] },
    {
      urls: [
        'stun:stun.cloudflare.com:53',
        'turn:turn.cloudflare.com:3478?transport=udp',
        'turn:turn.cloudflare.com:53?transport=udp',
        'turns:turn.cloudflare.com:443?transport=tcp',
      ],
      username: 'cf-user',
      credential: 'cf-pass',
    },
  ],
};

function make(opts: {
  cf?: Record<string, string>;
  turn?: Record<string, string>;
  slo?: { count: jest.Mock };
  settings?: Record<string, string | number>;
  /** Read on every request (key rotation tests). */
  keys?: () => Record<string, string> | undefined;
  /** The breaker probe's STUN + Allocate step (alive by default). */
  relayCheck?: RelayCheck;
  /** The breaker's clock (probe slots are a minute apart). */
  now?: () => number;
}) {
  const secrets = {
    get: (id: string) => {
      const fields =
        id === 'cloudflare_turn' ? (opts.keys?.() ?? opts.cf) : opts.turn;
      return Promise.resolve(fields ? { fields } : null);
    },
  };
  const config = { get: () => undefined };
  const args: unknown[] = new Array(11).fill(null);
  args[1] = config;
  args.push(secrets);
  // entitlements, privacy, groups, redis, then the SLO counters.
  args.push(undefined, undefined, undefined, undefined, opts.slo);
  // Then `calls.*` settings (calls.transport and the breaker limits).
  const st = opts.settings ?? {};
  const defaults: Record<string, number> = {
    'calls.transport_fail_limit': 5,
    'calls.transport_fail_window_sec': 120,
  };
  args.push({
    string: (k: string) => Promise.resolve(String(st[k] ?? 'auto')),
    number: (k: string) => Promise.resolve(Number(st[k] ?? defaults[k] ?? 0)),
  });
  const Ctor = CallsService as unknown as new (...a: unknown[]) => CallsService;
  const svc = new Ctor(...args);
  const inner = svc as unknown as {
    relayCheck: RelayCheck;
    cfTransportOwn?: CloudflareTransport;
  };
  inner.relayCheck = opts.relayCheck ?? relayAlive;
  if (opts.now) {
    inner.cfTransportOwn = new CloudflareTransport(
      undefined,
      args[args.length - 1] as never,
      opts.now,
    );
  }
  return svc;
}

const user = { sub: 'u1' } as never;
const ownTurn = { urls: 'turn:own.example:3478', secret: 'x'.repeat(20) };
const cf = { keyId: 'key12345', apiToken: TOKEN };

describe('iceServers with Cloudflare TURN', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    clearCloudflareTurnCache();
  });
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('puts Cloudflare first, then STUN, then own coturn (always offered: FO-1); keeps explicit transports; drops port 53', async () => {
    const fetchMock = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(CF_RESPONSE), { status: 201 }),
      ),
    );
    global.fetch = fetchMock as never;
    const res = await make({ cf, turn: ownTurn }).iceServers(user);
    expect(res.iceServers[0]).toEqual({
      urls: [
        'turn:turn.cloudflare.com:3478?transport=udp',
        'turns:turn.cloudflare.com:443?transport=tcp',
      ],
      username: 'cf-user',
      credential: 'cf-pass',
    });
    expect(res.iceServers[1].username).toBeNull(); // STUN
    // FO-1 (audit 2026-10-26): our own TURN is offered AFTER Cloudflare, so
    // a dead Cloudflare relay behind a live credential API never leaves a
    // call without a path (ICE gathers from both at once).
    expect(res.iceServers).toHaveLength(3);
    expect(res.iceServers[2].urls).toEqual([
      'turn:own.example:3478',
      'turn:own.example:3478?transport=tcp',
    ]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain('/keys/key12345/credentials/generate-ice-servers');
    expect(JSON.parse(init.body as string)).toEqual({ ttl: 86400 });
    // The API token never reaches the client response.
    expect(JSON.stringify(res)).not.toContain(TOKEN);
  });

  it('falls back to own coturn when Cloudflare fails twice, and counts the failure', async () => {
    const fetchMock = jest.fn(() =>
      Promise.resolve(new Response('nope', { status: 500 })),
    );
    global.fetch = fetchMock as never;
    const slo = { count: jest.fn() };
    const res = await make({ cf, turn: ownTurn, slo }).iceServers(user);
    expect(fetchMock).toHaveBeenCalledTimes(2); // one retry
    expect(res.iceServers).toHaveLength(2);
    expect(res.iceServers[1].urls[0]).toBe('turn:own.example:3478');
    expect(slo.count).toHaveBeenCalledWith('turnProviderFailed');
    expect(JSON.stringify(res)).not.toContain(TOKEN);
  });

  it('retries once: a second answer from Cloudflare is used and nothing is counted', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(CF_RESPONSE), { status: 201 }),
      );
    global.fetch = fetchMock as never;
    const slo = { count: jest.fn() };
    const res = await make({ cf, turn: ownTurn, slo }).iceServers(user);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.iceServers[0].username).toBe('cf-user');
    expect(res.iceServers).toHaveLength(3); // + STUN + own TURN second
    expect(res.iceServers[2].urls[0]).toBe('turn:own.example:3478');
    expect(slo.count).not.toHaveBeenCalled();
  });

  it('uses own coturn alone when Cloudflare is not configured', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;
    const res = await make({ turn: ownTurn }).iceServers(user);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.iceServers).toHaveLength(2);
    expect(res.iceServers[1].urls[0]).toBe('turn:own.example:3478');
  });

  it('falls back when Cloudflare times out', async () => {
    jest.useFakeTimers();
    try {
      global.fetch = jest.fn(
        (_u: string, init: RequestInit) =>
          new Promise((_r, reject) => {
            init.signal?.addEventListener('abort', () => {
              const e = new Error('aborted');
              e.name = 'AbortError';
              reject(e);
            });
          }),
      ) as never;
      const p = make({ cf, turn: ownTurn }).iceServers(user);
      // Owner 2026-10-26: never more than 1.5 s in total.
      await jest.advanceTimersByTimeAsync(1_500);
      const res = await p;
      expect(res.iceServers).toHaveLength(2);
      expect(res.iceServers[1].urls[0]).toBe('turn:own.example:3478');
    } finally {
      jest.useRealTimers();
    }
  });

  it('works with neither configured (STUN only) and does not call Cloudflare', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;
    const res = await make({}).iceServers(user);
    expect(res.iceServers).toHaveLength(1);
    // CF-7: Cloudflare's STUN ahead of Google's by default.
    expect(res.iceServers[0].urls).toEqual(DEFAULT_STUN_URLS);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Cloudflare only: Cloudflare + STUN', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(CF_RESPONSE), { status: 201 }),
      ),
    ) as never;
    const res = await make({ cf }).iceServers(user);
    expect(res.iceServers).toHaveLength(2);
  });

  it('reuses the login for the same user (one Cloudflare call)', async () => {
    const fetchMock = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(CF_RESPONSE), { status: 201 }),
      ),
    );
    global.fetch = fetchMock as never;
    const svc = make({ cf });
    await svc.iceServers(user);
    await svc.iceServers(user);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await svc.iceServers({ sub: 'u2' } as never);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('Cloudflare primary, own TURN as the automatic backup (owner 2026-10-26)', () => {
  const realFetch = global.fetch;
  const ok = () =>
    Promise.resolve(new Response(JSON.stringify(CF_RESPONSE), { status: 201 }));
  const fail = () => Promise.resolve(new Response('down', { status: 503 }));
  const flush = () => new Promise((r) => setTimeout(r, 20));
  const isCf = (r: { iceServers: Array<{ username: string | null }> }) =>
    r.iceServers[0].username === 'cf-user';
  const isOwn = (r: { iceServers: Array<{ urls: string[] }> }) =>
    r.iceServers.some((s) => s.urls[0] === 'turn:own.example:3478');
  const u = (n: number) => ({ sub: `user-${n}` }) as never;

  beforeEach(() => clearCloudflareTurnCache());
  afterEach(() => {
    global.fetch = realFetch;
    jest.useRealTimers();
  });

  it('Cloudflare 5xx / no answer: the call is on our own TURN within 1.5 s', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(
      (_u: string, init: RequestInit) =>
        new Promise((_r, reject) => {
          init.signal?.addEventListener('abort', () => {
            const e = new Error('aborted');
            e.name = 'AbortError';
            reject(e);
          });
        }),
    ) as never;
    let done = false;
    const p = make({ cf, turn: ownTurn })
      .iceServers(user)
      .then((r) => {
        done = true;
        return r;
      });
    await jest.advanceTimersByTimeAsync(1_499);
    expect(done).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    const res = await p;
    expect(done).toBe(true);
    expect(isOwn(res)).toBe(true);
    expect(isCf(res)).toBe(false);
  });

  it('N failures open the breaker: NEW calls are own-first, Cloudflare only a quick second try (one probe a minute only)', async () => {
    const fetchMock = jest.fn(fail);
    global.fetch = fetchMock as never;
    const slo = { count: jest.fn() };
    const svc = make({
      cf,
      turn: ownTurn,
      slo,
      settings: { 'calls.transport_fail_limit': 3 },
    });
    for (let i = 0; i < 3; i++)
      expect(isOwn(await svc.iceServers(u(i)))).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(6); // try + retry each
    await flush();
    const before = fetchMock.mock.calls.length;
    const failures = slo.count.mock.calls.length;
    const next = await svc.iceServers(u(10));
    await flush();
    expect(isOwn(next)).toBe(true);
    expect(isCf(next)).toBe(false);
    // The background probe (1) and the quick second-place try (try + retry,
    // FO-8) asked Cloudflare; the quick try counts nothing.
    expect(fetchMock.mock.calls.length - before).toBe(3);
    expect(slo.count.mock.calls.length - failures).toBe(1); // the probe
    await svc.iceServers(u(11));
    await flush();
    // Probe slot: 60 s — only the quick try this time.
    expect(fetchMock.mock.calls.length - before).toBe(5);
  });

  it('FO-2: while open, a login alone does not close the breaker — the relay must allocate', async () => {
    let now = 10_000_000;
    const fetchMock = jest.fn(fail);
    global.fetch = fetchMock as never;
    const svc = make({
      cf,
      turn: ownTurn,
      settings: { 'calls.transport_fail_limit': 1 },
      relayCheck: relayDead,
      now: () => now,
    });
    await svc.iceServers(u(1)); // opens
    fetchMock.mockImplementation(ok); // the credential API is back...
    await svc.iceServers(u(2)); // ...the probe runs: login OK, Allocate dead
    await flush();
    const still = await svc.iceServers(u(3));
    expect(isOwn(still)).toBe(true);
    expect(isCf(still)).toBe(false);
    // The relay answers again: FO-6 — three good probes in a row close it.
    (svc as unknown as { relayCheck: RelayCheck }).relayCheck = relayAlive;
    for (let k = 1; k < CF_BREAKER_CLOSE_OK_PROBES; k++) {
      now += CF_BREAKER_PROBE_MS;
      await svc.iceServers(u(10 + k));
      await flush();
      expect(isCf(await svc.iceServers(u(20 + k)))).toBe(false); // not yet
    }
    now += CF_BREAKER_PROBE_MS;
    await svc.iceServers(u(4));
    await flush();
    expect(isCf(await svc.iceServers(u(5)))).toBe(true);
  });

  it('probe success closes the breaker (after three good minutes, FO-6): the next new call is on Cloudflare again', async () => {
    let now = 20_000_000;
    const fetchMock = jest.fn(fail);
    global.fetch = fetchMock as never;
    const svc = make({
      cf,
      turn: ownTurn,
      settings: { 'calls.transport_fail_limit': 2 },
      now: () => now,
    });
    await svc.iceServers(u(1));
    await svc.iceServers(u(2));
    fetchMock.mockImplementation(ok); // Cloudflare is back
    const during = await svc.iceServers(u(3)); // never waits for the probe
    expect(isOwn(during)).toBe(true);
    await flush();
    // One good probe: still own-first (a flapping Cloudflare must not bounce calls).
    expect(isCf(await svc.iceServers(u(30)))).toBe(false);
    for (let k = 2; k <= CF_BREAKER_CLOSE_OK_PROBES; k++) {
      now += CF_BREAKER_PROBE_MS;
      await svc.iceServers(u(30 + k));
      await flush();
    }
    const after = await svc.iceServers(u(4));
    expect(isCf(after)).toBe(true);
    // Own TURN stays offered, after Cloudflare again.
    expect(after.iceServers.at(-1)?.urls[0]).toBe('turn:own.example:3478');
  });

  it('breaker open but no own TURN configured: Cloudflare is still tried', async () => {
    const fetchMock = jest.fn(fail);
    global.fetch = fetchMock as never;
    const svc = make({ cf, settings: { 'calls.transport_fail_limit': 1 } });
    await svc.iceServers(u(1));
    fetchMock.mockImplementation(ok);
    const res = await svc.iceServers(u(2));
    expect(isCf(res)).toBe(true);
  });

  it('calls.transport = own: Cloudflare is never asked, own TURN is used', async () => {
    const fetchMock = jest.fn(ok);
    global.fetch = fetchMock as never;
    const res = await make({
      cf,
      turn: ownTurn,
      settings: { 'calls.transport': 'own' },
    }).iceServers(user);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(isOwn(res)).toBe(true);
  });

  it('calls.transport = cloudflare: Cloudflare even while the breaker is open', async () => {
    const fetchMock = jest.fn(fail);
    global.fetch = fetchMock as never;
    const svc = make({
      cf,
      turn: ownTurn,
      settings: {
        'calls.transport': 'cloudflare',
        'calls.transport_fail_limit': 1,
      },
    });
    await svc.iceServers(u(1)); // opens
    fetchMock.mockImplementation(ok);
    expect(isCf(await svc.iceServers(u(2)))).toBe(true);
  });

  it('calls.transport = auto with keys: Cloudflare first, own TURN offered after it', async () => {
    global.fetch = jest.fn(ok) as never;
    const res = await make({
      cf,
      turn: ownTurn,
      settings: { 'calls.transport': 'auto' },
    }).iceServers(user);
    expect(isCf(res)).toBe(true);
    expect(isOwn(res)).toBe(true);
    expect(res.iceServers.at(-1)?.urls[0]).toBe('turn:own.example:3478');
  });

  it('key rotation mid-call: the next fetch uses the new key, the running call keeps its login', async () => {
    let keys: Record<string, string> = { keyId: 'oldkey123', apiToken: TOKEN };
    const fetchMock = jest.fn(ok);
    global.fetch = fetchMock as never;
    const svc = make({ turn: ownTurn, keys: () => keys });
    const running = await svc.iceServers(user);
    const snapshot = JSON.stringify(running);
    keys = { keyId: 'newkey456', apiToken: `${TOKEN}-new` };
    const next = await svc.iceServers(user);
    expect(isCf(next)).toBe(true);
    const [url, init] = fetchMock.mock.calls[1] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain('/keys/newkey456/');
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Bearer ${TOKEN}-new`,
    );
    expect(JSON.stringify(running)).toBe(snapshot);
  });

  it('a broken key falls back; restoring it brings calls back to Cloudflare via the probe', async () => {
    let keys: Record<string, string> = { keyId: 'badkey123', apiToken: TOKEN };
    const fetchMock = jest.fn((url: string) =>
      url.includes('/badkey123/')
        ? Promise.resolve(new Response('no', { status: 401 }))
        : ok(),
    );
    global.fetch = fetchMock as never;
    let now = 30_000_000;
    const svc = make({
      turn: ownTurn,
      keys: () => keys,
      settings: { 'calls.transport_fail_limit': 2 },
      now: () => now,
    });
    expect(isOwn(await svc.iceServers(u(1)))).toBe(true); // still connects
    await svc.iceServers(u(2)); // opens
    keys = { keyId: 'goodkey123', apiToken: TOKEN }; // owner fixes the key
    for (let k = 1; k <= CF_BREAKER_CLOSE_OK_PROBES; k++) {
      await svc.iceServers(u(40 + k)); // probe with the NEW key (3 in a row, FO-6)
      await flush();
      now += CF_BREAKER_PROBE_MS;
    }
    expect(isCf(await svc.iceServers(u(4)))).toBe(true);
  });
});
