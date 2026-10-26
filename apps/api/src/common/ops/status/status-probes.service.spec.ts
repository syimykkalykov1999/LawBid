import { StatusProbesService, WATCHED } from './status-probes.service';
import type { RelayCheck } from '../../../modules/calls/cloudflare-relay-probe';
import {
  CF_BREAKER_PROBE_MS,
  CloudflareTransport,
} from '../../../modules/calls/cloudflare-transport';

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

type Fields = Record<string, string>;
interface Probes {
  cloudflareTurn(): Promise<{
    status: string;
    detail: Record<string, unknown>;
  }>;
  cloudflareSfu(): Promise<{ status: string; detail: Record<string, unknown> }>;
  r2(): Promise<{ status: string; detail: Record<string, unknown> }>;
}

const CF_OK = {
  iceServers: [
    {
      urls: ['turn:turn.cloudflare.com:3478?transport=udp'],
      username: 'u',
      credential: 'c',
    },
  ],
};

function make(
  secrets: Record<string, Fields>,
  settings: Record<string, string> = {},
  opts: { relayCheck?: RelayCheck; now?: () => number } = {},
): Probes {
  const Ctor = StatusProbesService as unknown as new (
    ...a: unknown[]
  ) => unknown;
  const st = { string: (k: string) => Promise.resolve(settings[k] ?? '') };
  const p = new Ctor(
    null,
    null,
    { get: () => undefined },
    null,
    st,
    {
      get: (id: string) =>
        Promise.resolve(secrets[id] ? { fields: secrets[id] } : null),
    },
    null,
  ) as Probes & { relayCheck: RelayCheck; cfTransport?: CloudflareTransport };
  p.relayCheck = opts.relayCheck ?? relayAlive;
  if (opts.now) {
    p.cfTransport = new CloudflareTransport(undefined, st as never, opts.now);
  }
  return p;
}

const cfKeys = { cloudflare_turn: { keyId: 'key1', apiToken: 'tok-secret' } };

describe('StatusProbesService outside probes', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('watches Cloudflare, not our own coturn', () => {
    const w = WATCHED as readonly string[];
    expect(w).toEqual(
      expect.arrayContaining(['cloudflare_turn', 'cloudflare_sfu', 'r2']),
    );
    expect(w).not.toContain('turn');
  });

  it('cloudflare_turn is grey without keys and calls nobody', async () => {
    const f = jest.fn();
    global.fetch = f as never;
    const r = await make({}).cloudflareTurn();
    expect(r.status).toBe('grey');
    expect(f).not.toHaveBeenCalled();
  });

  it('cloudflare_turn is green when Cloudflare hands out a login, and caches', async () => {
    const f = jest.fn(() =>
      Promise.resolve(new Response(JSON.stringify(CF_OK), { status: 201 })),
    );
    global.fetch = f as never;
    const p = make(cfKeys);
    expect((await p.cloudflareTurn()).status).toBe('green');
    await p.cloudflareTurn();
    // The cached credential probe (1) and one login for the minute relay
    // probe (FO-2; its slot is taken on the second pass).
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('FO-2: the minute probe does a real Allocate — a dead relay behind a live credential API opens the breaker on the second miss, and a live one closes it', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response(JSON.stringify(CF_OK), { status: 201 })),
    ) as never;
    let now = 1_000_000;
    const p = make(cfKeys, {}, { relayCheck: relayDead, now: () => now });
    const one = await p.cloudflareTurn();
    expect(one.status).toBe('green'); // the API answers...
    expect(one.detail).toMatchObject({ breaker: 'closed', failures: 1 });
    now += CF_BREAKER_PROBE_MS;
    const two = await p.cloudflareTurn();
    expect(two.detail).toMatchObject({ breaker: 'open', path: 'own' });
    // The relay allocates again: the next minute closes it.
    (p as unknown as { relayCheck: RelayCheck }).relayCheck = relayAlive;
    now += CF_BREAKER_PROBE_MS;
    const three = await p.cloudflareTurn();
    expect(three.detail).toMatchObject({
      breaker: 'closed',
      path: 'cloudflare',
    });
  });

  it('FO-2: while open, the credential API alone does not close the breaker', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response(JSON.stringify(CF_OK), { status: 201 })),
    ) as never;
    let now = 2_000_000;
    const p = make(cfKeys, {}, { relayCheck: relayDead, now: () => now });
    const t = (p as unknown as { cfTransport: CloudflareTransport })
      .cfTransport;
    for (let i = 0; i < 5; i++) await t.recordFailure('turn', 'down');
    expect((await p.cloudflareTurn()).detail).toMatchObject({
      breaker: 'open',
    });
    now += CF_BREAKER_PROBE_MS;
    expect((await p.cloudflareTurn()).detail).toMatchObject({
      breaker: 'open',
    });
  });

  it('calls.transport = own: the relay is not probed at all', async () => {
    const f = jest.fn(() =>
      Promise.resolve(new Response(JSON.stringify(CF_OK), { status: 201 })),
    );
    global.fetch = f as never;
    const check = jest.fn(relayAlive);
    await make(
      cfKeys,
      { 'calls.transport': 'own' },
      { relayCheck: check },
    ).cloudflareTurn();
    expect(check).not.toHaveBeenCalled();
    expect(f).toHaveBeenCalledTimes(1); // the credential dot only
  });

  it('cloudflare_turn is red on an error and never shows the token', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response('no', { status: 401 })),
    ) as never;
    const r = await make(cfKeys).cloudflareTurn();
    expect(r.status).toBe('red');
    expect(JSON.stringify(r)).not.toContain('tok-secret');
  });

  it('cloudflare_sfu is grey without keys or when calls.transport = own', async () => {
    const f = jest.fn();
    global.fetch = f as never;
    const sfu = { cloudflare_sfu: { appId: 'a', appToken: 't' } };
    expect((await make({}).cloudflareSfu()).status).toBe('grey');
    const r = await make(sfu, {
      'calls.transport': 'own',
    }).cloudflareSfu();
    expect(r.status).toBe('grey');
    expect(r.detail.inUse).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it('cloudflare_sfu is green when a session opens and red when it does not', async () => {
    const sfu = { cloudflare_sfu: { appId: 'a', appToken: 't' } };
    // Owner 2026-10-26: keys alone put group calls on Cloudflare.
    const settings = {};
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ sessionId: 's1' }), { status: 201 }),
      ),
    ) as never;
    expect((await make(sfu, settings).cloudflareSfu()).status).toBe('green');
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response('x', { status: 500 })),
    ) as never;
    expect((await make(sfu, settings).cloudflareSfu()).status).toBe('red');
  });

  it('the dot says which path NEW calls take: cloudflare, or own while the breaker is open', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response(JSON.stringify(CF_OK), { status: 201 })),
    ) as never;
    const p = make(cfKeys);
    const ok = await p.cloudflareTurn();
    expect(ok.detail).toMatchObject({
      path: 'cloudflare',
      breaker: 'closed',
      transport: 'auto',
    });
    const own = await make(cfKeys, {
      'calls.transport': 'own',
    }).cloudflareTurn();
    expect(own.detail).toMatchObject({ path: 'own', transport: 'own' });
    expect(own.status).toBe('green');
  });

  const r2 = {
    cloudflare_r2: { publicBaseUrl: 'https://media.example.dev/', bucket: 'b' },
  };

  it('r2 is grey while media.public_store is not r2', async () => {
    const f = jest.fn();
    global.fetch = f as never;
    const r = await make(r2, { 'media.public_store': 'aws' }).r2();
    expect(r.status).toBe('grey');
    expect(f).not.toHaveBeenCalled();
  });

  it('r2 treats a 404 as healthy and a 5xx or a network error as red', async () => {
    const settings = { 'media.public_store': 'r2' };
    const f404 = jest.fn(() =>
      Promise.resolve(new Response(null, { status: 404 })),
    );
    global.fetch = f404 as never;
    expect((await make(r2, settings).r2()).status).toBe('green');
    expect(f404).toHaveBeenCalledWith(
      'https://media.example.dev/ops/health-probe',
      { method: 'HEAD' },
    );
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response(null, { status: 503 })),
    ) as never;
    expect((await make(r2, settings).r2()).status).toBe('red');
    global.fetch = jest.fn(() => Promise.reject(new Error('dns'))) as never;
    expect((await make(r2, settings).r2()).status).toBe('red');
  });
});

describe('StatusProbesService usage and breaker lines (Batch C)', () => {
  interface Extra {
    usage(w: 'cloudflare' | 'bunny'): Promise<{
      status: string;
      detail: Record<string, unknown>;
    }>;
    breakers(): Promise<{ status: string; detail: Record<string, unknown> }>;
  }
  function withSnapshot(snap: unknown): Extra {
    const Ctor = StatusProbesService as unknown as new (
      ...a: unknown[]
    ) => unknown;
    return new Ctor(null, {
      get: () => Promise.resolve(snap ? JSON.stringify(snap) : null),
    }) as Extra;
  }

  it('is grey until the daily poll has run', async () => {
    expect((await withSnapshot(null).usage('cloudflare')).status).toBe('grey');
  });

  it('is yellow at the warn level and red at the crit level', async () => {
    const warn = withSnapshot({
      at: 'x',
      cloudflare: { ok: true, egressGb: 720, level: 'warn' },
    });
    expect((await warn.usage('cloudflare')).status).toBe('yellow');
    const crit = withSnapshot({
      at: 'x',
      cloudflare: { ok: true, egressGb: 960, level: 'crit' },
    });
    expect((await crit.usage('cloudflare')).status).toBe('red');
  });

  it('a failed poll is yellow with the reason', async () => {
    const p = withSnapshot({
      at: 'x',
      bunny: { ok: false, error: 'Bunny HTTP 401' },
    });
    const r = await p.usage('bunny');
    expect(r.status).toBe('yellow');
    expect(r.detail.error).toBe('Bunny HTTP 401');
  });

  it('breakers line is green while nothing is paused', async () => {
    expect((await withSnapshot(null).breakers()).status).toBe('green');
  });
});

describe('StatusProbesService.callsPath (Integrations -> «Связь для звонков»)', () => {
  type CallsPath = {
    transport: string;
    carrying: string;
    breakers: { turn: string; sfu: string };
    cloudflare: {
      configured: boolean;
      lastProbeOk: boolean | null;
      check: { ok: boolean } | null;
    };
    own: { configured: boolean; check: { ok: boolean } | null };
  };
  function withRedis(secrets: Record<string, Fields>, transport = 'auto') {
    const store = new Map<string, string>();
    const redis = {
      status: 'end',
      get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
      set: jest.fn((k: string, v: string) => {
        store.set(k, v);
        return Promise.resolve('OK');
      }),
    };
    const Ctor = StatusProbesService as unknown as new (
      ...a: unknown[]
    ) => unknown;
    const p = new Ctor(
      null,
      redis,
      { get: () => undefined },
      null,
      {
        string: (k: string) =>
          Promise.resolve(k === 'calls.transport' ? transport : ''),
        number: () => Promise.resolve(5),
      },
      {
        get: (id: string) =>
          Promise.resolve(secrets[id] ? { fields: secrets[id] } : null),
      },
      null,
    ) as {
      callsPath(check?: boolean): Promise<CallsPath>;
      checkCloudflare: () => Promise<unknown>;
      checkOwn: () => Promise<unknown>;
    };
    return { p, store };
  }
  const keys = {
    cloudflare_turn: { keyId: 'key1', apiToken: 'tok-secret' },
    turn: { urls: 'turn:own.example:3478', secret: 's'.repeat(20) },
  };

  it('no keys: own path carries calls, nothing is asked outside', async () => {
    const f = jest.fn();
    global.fetch = f as never;
    const { p } = withRedis({});
    const r = await p.callsPath();
    expect(r).toMatchObject({
      transport: 'auto',
      carrying: 'own',
      cloudflare: { configured: false, check: null },
      own: { configured: false },
    });
    expect(f).not.toHaveBeenCalled();
  });

  it('«Проверить» runs both checks once, keeps the result; a second press within 10 s reuses it', async () => {
    const { p, store } = withRedis(keys);
    const cf = jest.fn(() =>
      Promise.resolve({
        at: new Date().toISOString(),
        ok: true,
        ms: 80,
        stun: null,
        turn: null,
        media: null,
        error: null,
      }),
    );
    const own = jest.fn(() =>
      Promise.resolve({
        at: new Date().toISOString(),
        ok: false,
        ms: 2000,
        stun: null,
        turn: { ok: false, ms: 2000, error: 'no answer in 2000 ms' },
        media: null,
        error: null,
      }),
    );
    p.checkCloudflare = cf;
    p.checkOwn = own;
    // The plain read asks nobody.
    const before = await p.callsPath();
    expect(before.cloudflare.check).toBeNull();
    expect(cf).not.toHaveBeenCalled();

    const r = await p.callsPath(true);
    expect(r.carrying).toBe('cloudflare');
    expect(r.cloudflare).toMatchObject({ configured: true, lastProbeOk: true });
    expect(r.own).toMatchObject({ configured: true, check: { ok: false } });
    expect(store.has('calls:path:check')).toBe(true);
    await p.callsPath(true);
    expect(cf).toHaveBeenCalledTimes(1);
    expect(own).toHaveBeenCalledTimes(1);
  });

  it('calls.transport = own: our own path carries calls even with Cloudflare keys', async () => {
    const { p } = withRedis(keys, 'own');
    const r = await p.callsPath();
    expect(r).toMatchObject({ transport: 'own', carrying: 'own' });
  });
});
