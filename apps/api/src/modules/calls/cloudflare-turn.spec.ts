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

  it('puts Cloudflare first, then STUN, then own coturn; keeps explicit transports; drops port 53', async () => {
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

  it('falls back to own coturn when Cloudflare fails', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response('nope', { status: 500 })),
    ) as never;
    const res = await make({ cf, turn: ownTurn }).iceServers(user);
    expect(res.iceServers).toHaveLength(2);
    expect(res.iceServers[1].urls[0]).toBe('turn:own.example:3478');
    expect(JSON.stringify(res)).not.toContain(TOKEN);
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
      await jest.advanceTimersByTimeAsync(3_100);
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
