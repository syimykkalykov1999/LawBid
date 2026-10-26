import { CallsService } from './calls.service';
import { clearCloudflareTurnCache } from './cloudflare-turn';

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
}) {
  const secrets = {
    get: (id: string) => {
      const fields = id === 'cloudflare_turn' ? opts.cf : opts.turn;
      return Promise.resolve(fields ? { fields } : null);
    },
  };
  const config = { get: () => undefined };
  const args: unknown[] = new Array(11).fill(null);
  args[1] = config;
  args.push(secrets);
  // entitlements, privacy, groups, redis, then the SLO counters.
  args.push(undefined, undefined, undefined, undefined, opts.slo);
  const Ctor = CallsService as unknown as new (...a: unknown[]) => CallsService;
  return new Ctor(...args);
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

  it('puts Cloudflare first, then STUN; skips own coturn while Cloudflare works; keeps explicit transports; drops port 53', async () => {
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
    // Dead own-TURN addresses must not slow ICE: not offered at all.
    expect(res.iceServers).toHaveLength(2);
    expect(JSON.stringify(res)).not.toContain('own.example');
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
    expect(res.iceServers).toHaveLength(2); // no own TURN
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
      // 3 s first try + 0.3 s backoff + 1.5 s retry.
      await jest.advanceTimersByTimeAsync(5_000);
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
