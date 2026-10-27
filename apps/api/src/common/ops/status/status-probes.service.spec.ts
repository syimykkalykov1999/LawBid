import { StatusProbesService, WATCHED } from './status-probes.service';

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
): Probes {
  const Ctor = StatusProbesService as unknown as new (
    ...a: unknown[]
  ) => unknown;
  return new Ctor(
    null,
    null,
    { get: () => undefined },
    null,
    { string: (k: string) => Promise.resolve(settings[k] ?? '') },
    {
      get: (id: string) =>
        Promise.resolve(secrets[id] ? { fields: secrets[id] } : null),
    },
    null,
  ) as Probes;
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
    expect(f).toHaveBeenCalledTimes(1);
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

describe('StatusProbesService queues probe (deploy safety 2026-10-27)', () => {
  // A stuck `cron-fast` or `cron-heavy` lane must turn «Очереди» red, not
  // only the old `cron` queue.
  function withLanes(oldestAgeSec: Record<string, number>) {
    const svc = make({}) as unknown as {
      queue: (name: string) => unknown;
      queuesProbe: (now: Date) => Promise<{
        status: string;
        detail: Record<string, unknown>;
      }>;
    };
    const now = new Date('2026-10-27T12:00:00Z');
    svc.queue = (name: string) => ({
      getJobCounts: () => Promise.resolve({ waiting: 1, failed: 0 }),
      getWaiting: () =>
        Promise.resolve(
          oldestAgeSec[name] !== undefined
            ? [{ timestamp: now.getTime() - oldestAgeSec[name] * 1000 }]
            : [],
        ),
    });
    return svc.queuesProbe(now);
  }

  it('is red when only cron-fast is stuck', async () => {
    const r = await withLanes({ 'cron-fast': 600, cron: 5 });
    expect(r.status).toBe('red');
    expect(r.detail).toMatchObject({ oldestSec: 600, waiting: 3 });
    expect(Object.keys(r.detail.lanes as object).sort()).toEqual([
      'cron',
      'cron-fast',
      'cron-heavy',
    ]);
  });

  it('is green when every lane moves', async () => {
    expect((await withLanes({ cron: 10 })).status).toBe('green');
  });
});
