import {
  CLOUDFLARE_SFU_CONNECT_BUDGET_MS,
  CloudflareSfuClient,
  CloudflareSfuError,
} from './cloudflare-sfu.client';
import { CloudflareSfuProvider } from './cloudflare-sfu.provider';
import { FakeCloudflare } from './cloudflare-sfu.fake';
import { decideMediaProvider } from './media-provider';
import { PROVIDERS } from '../../common/secrets/provider-registry';

const creds = { appId: 'a'.repeat(32), appToken: 'good-secret' };
/** No real backoff in unit tests. */
const fast = { sleep: () => Promise.resolve() };

describe('CloudflareSfuClient', () => {
  it('sends the App Secret only as a Bearer header, never in the URL or body', async () => {
    const cf = new FakeCloudflare();
    const c = new CloudflareSfuClient(creds, cf.fetch);
    const { sessionId } = await c.newSession();
    await c.newTracks(
      sessionId,
      [{ location: 'local', mid: '0', trackName: 'mic' }],
      { type: 'offer', sdp: 'v=0' },
    );
    for (const call of cf.calls) {
      expect(call.auth).toBe('Bearer good-secret');
      expect(call.path).not.toContain('good-secret');
      expect(JSON.stringify(call.body)).not.toContain('good-secret');
    }
    expect(cf.calls[0].path).toBe(`/apps/${creds.appId}/sessions/new`);
    expect(cf.calls[1].path).toBe(
      `/apps/${creds.appId}/sessions/${sessionId}/tracks/new`,
    );
  });

  it('closes by mid with force, as in the OpenAPI file', async () => {
    const cf = new FakeCloudflare();
    const c = new CloudflareSfuClient(creds, cf.fetch);
    const { sessionId } = await c.newSession();
    await c.closeTracks(sessionId, ['3', '4'], { force: true });
    const last = cf.calls[cf.calls.length - 1];
    expect(last.method).toBe('PUT');
    expect(last.body).toEqual({
      tracks: [{ mid: '3' }, { mid: '4' }],
      force: true,
    });
  });

  it('maps a rejected key to an error without echoing the secret', async () => {
    const cf = new FakeCloudflare();
    const c = new CloudflareSfuClient(
      { appId: creds.appId, appToken: 'wrong-secret-value' },
      cf.fetch,
    );
    const err = await c.newSession().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CloudflareSfuError);
    expect((err as CloudflareSfuError).status).toBe(401);
    expect((err as Error).message).not.toContain('wrong-secret-value');
    expect((err as CloudflareSfuError).isOutage).toBe(false);
  });

  it('treats a network failure as an outage and hides the raw error', async () => {
    const boom = jest.fn(() =>
      Promise.reject(new Error('socket hang up Bearer good-secret')),
    ) as unknown as typeof fetch;
    const c = new CloudflareSfuClient(creds, boom);
    const err = (await c
      .newSession()
      .catch((e: unknown) => e)) as CloudflareSfuError;
    expect(err.isOutage).toBe(true);
    expect(err.message).not.toContain('good-secret');
    // sessions/new is retried once.
    expect(boom).toHaveBeenCalledTimes(2);
  });

  it('FO-3: a mutation (tracks/new) is retried ONCE after a backoff on 5xx; a second 5xx is final', async () => {
    const cf = new FakeCloudflare();
    const sleep = jest.fn<Promise<void>, [number]>(() => Promise.resolve());
    const c = new CloudflareSfuClient(creds, cf.fetch, { sleep });
    const { sessionId } = await c.newSession();
    cf.failStatus = 503;
    const before = cf.calls.length;
    await expect(
      c.newTracks(sessionId, [
        { location: 'remote', sessionId: 'x', trackName: 'mic' },
      ]),
    ).rejects.toMatchObject({ status: 503, isOutage: true });
    expect(cf.calls.length - before).toBe(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    const wait = sleep.mock.calls[0][0];
    expect(wait).toBeGreaterThanOrEqual(200);
    expect(wait).toBeLessThan(400);
  });

  it('FO-3: one 5xx blip is absorbed — the retry succeeds and the caller never sees it', async () => {
    const cf = new FakeCloudflare();
    const c = new CloudflareSfuClient(creds, cf.fetch, fast);
    cf.failStatus = 503;
    cf.failTimes = 1;
    const { sessionId } = await c.newSession();
    expect(sessionId).toBe('sess-1');
    expect(cf.calls).toHaveLength(2);
  });

  it('a 4xx of the caller (bad request) is never retried', async () => {
    const cf = new FakeCloudflare();
    const c = new CloudflareSfuClient(creds, cf.fetch, fast);
    const { sessionId } = await c.newSession();
    cf.failStatus = 400;
    const before = cf.calls.length;
    await expect(
      c.renegotiate(sessionId, { type: 'answer', sdp: 'v=0' }),
    ).rejects.toMatchObject({ status: 400, kind: 'caller' });
    expect(cf.calls.length - before).toBe(1);
  });

  it('CF-1: HTTP 404 on sessions/new is the App ID (configuration), not the caller, not an outage', async () => {
    const cf = new FakeCloudflare();
    const c = new CloudflareSfuClient(creds, cf.fetch, fast);
    cf.failStatus = 404;
    const err = (await c
      .newSession()
      .catch((e: unknown) => e)) as CloudflareSfuError;
    expect(err).toBeInstanceOf(CloudflareSfuError);
    expect(err.status).toBe(404);
    expect(err.kind).toBe('config');
    expect(err.isConfigFailure).toBe(true);
    expect(err.isOutage).toBe(false);
    expect(err.countsAgainstCloudflare).toBe(true);
    expect(err.message).toMatch(/App ID/);
    expect(err.message).not.toContain('good-secret');
    // Deterministic: not retried.
    expect(cf.calls).toHaveLength(1);
  });

  it('CF-4: HTTP 404 on a session route means the session is gone (the phone opens a new one)', async () => {
    const cf = new FakeCloudflare();
    const c = new CloudflareSfuClient(creds, cf.fetch, fast);
    const err = (await c
      .newTracks('sess-gone', [
        { location: 'remote', sessionId: 'x', trackName: 'mic' },
      ])
      .catch((e: unknown) => e)) as CloudflareSfuError;
    expect(err.status).toBe(404);
    expect(err.kind).toBe('session');
    expect(err.isSessionGone).toBe(true);
    expect(err.countsAgainstCloudflare).toBe(false);
  });

  it('CF-3: HTTP 429 is a rate limit of this session — retried once after Retry-After, never an outage', async () => {
    const cf = new FakeCloudflare();
    const sleep = jest.fn<Promise<void>, [number]>(() => Promise.resolve());
    const c = new CloudflareSfuClient(creds, cf.fetch, { sleep });
    const { sessionId } = await c.newSession();
    cf.failStatus = 429;
    cf.failHeaders = { 'retry-after': '1' };
    const before = cf.calls.length;
    const err = (await c
      .renegotiate(sessionId, { type: 'answer', sdp: 'v=0' })
      .catch((e: unknown) => e)) as CloudflareSfuError;
    expect(err.status).toBe(429);
    expect(err.isRateLimited).toBe(true);
    expect(err.isOutage).toBe(false);
    expect(err.countsAgainstCloudflare).toBe(false);
    expect(err.retryAfterMs).toBe(1000);
    expect(cf.calls.length - before).toBe(2);
    expect(sleep).toHaveBeenCalledWith(1000);
    // A 429 that clears after the backoff is invisible to the caller.
    cf.failTimes = 1;
    await expect(
      c.renegotiate(sessionId, { type: 'answer', sdp: 'v=0' }),
    ).resolves.toBeDefined();
  });

  it.each([
    ['retryable_transient_error', 'outage', 503, 2],
    ['temporarily_unavailable_error', 'outage', 503, 2],
    ['backend_error', 'outage', 503, 2],
    ['internal_error', 'outage', 503, 2],
    ['session_error', 'session', 404, 1],
    ['session_not_found', 'session', 404, 1],
    ['some_new_code', 'caller', 400, 1],
  ])(
    'CF-4: HTTP 200 with errorCode %s is %s (status %i, %i attempt(s))',
    async (code, kind, status, attempts) => {
      const cf = new FakeCloudflare();
      const c = new CloudflareSfuClient(creds, cf.fetch, fast);
      const { sessionId } = await c.newSession();
      cf.bodyErrorCode = code;
      const before = cf.calls.length;
      const err = (await c
        .newTracks(sessionId, [
          { location: 'remote', sessionId: 'x', trackName: 'mic' },
        ])
        .catch((e: unknown) => e)) as CloudflareSfuError;
      expect(err).toBeInstanceOf(CloudflareSfuError);
      expect(err.code).toBe(code);
      expect(err.kind).toBe(kind);
      expect(err.status).toBe(status);
      expect(cf.calls.length - before).toBe(attempts);
    },
  );

  it('CF-4: an in-body not_found on sessions/new is the App ID too', async () => {
    const cf = new FakeCloudflare();
    const c = new CloudflareSfuClient(creds, cf.fetch, fast);
    cf.bodyErrorCode = 'not_found';
    const err = (await c
      .newSession()
      .catch((e: unknown) => e)) as CloudflareSfuError;
    expect(err.kind).toBe('config');
    expect(err.isConfigFailure).toBe(true);
  });

  it('TS-1: a dead SFU (fetch never answers) fails sessions/new within the 2.5 s connect budget, not 16 s', async () => {
    jest.useFakeTimers();
    try {
      const hanging: typeof fetch = (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const e = new Error('aborted');
            e.name = 'AbortError';
            reject(e);
          });
        });
      const c = new CloudflareSfuClient(creds, hanging);
      const started = Date.now();
      let settled: CloudflareSfuError | null = null;
      const p = c.newSession().catch((e: CloudflareSfuError) => {
        settled = e;
      });
      await jest.advanceTimersByTimeAsync(
        CLOUDFLARE_SFU_CONNECT_BUDGET_MS + 50,
      );
      await p;
      expect(settled).not.toBeNull();
      expect(settled!.status).toBe(0);
      expect(settled!.isOutage).toBe(true);
      expect(Date.now() - started).toBeLessThanOrEqual(
        CLOUDFLARE_SFU_CONNECT_BUDGET_MS + 50,
      );
      expect(Date.now() - started).toBeLessThan(3000);
    } finally {
      jest.useRealTimers();
    }
  });

  it('in-call mutations keep the long 8 s attempt (a retry only when the 12 s budget allows)', async () => {
    jest.useFakeTimers();
    try {
      let attempts = 0;
      const hanging: typeof fetch = (_input, init) =>
        new Promise((_resolve, reject) => {
          attempts += 1;
          init?.signal?.addEventListener('abort', () => {
            const e = new Error('aborted');
            e.name = 'AbortError';
            reject(e);
          });
        });
      const c = new CloudflareSfuClient(creds, hanging);
      let settled: CloudflareSfuError | null = null;
      const p = c
        .renegotiate('s', { type: 'answer', sdp: 'v=0' })
        .catch((e: CloudflareSfuError) => {
          settled = e;
        });
      await jest.advanceTimersByTimeAsync(7_900);
      expect(settled).toBeNull(); // still the first 8 s attempt
      await jest.advanceTimersByTimeAsync(4_200);
      await p;
      expect(settled).not.toBeNull();
      expect(attempts).toBe(2); // one bounded retry inside the budget
    } finally {
      jest.useRealTimers();
    }
  });

  it('turns an errorCode inside HTTP 200 into an error', async () => {
    const f = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ errorCode: 'bad', errorDescription: 'x' }),
          {
            status: 200,
          },
        ),
      )) as unknown as typeof fetch;
    await expect(
      new CloudflareSfuClient(creds, f).newSession(),
    ).rejects.toMatchObject({
      code: 'bad',
    });
  });
});

describe('CloudflareSfuProvider', () => {
  const secrets = (fields: Record<string, string> | null) => ({
    get: jest.fn().mockResolvedValue(fields ? { fields } : null),
  });

  it('name is cloudflare; configured needs both fields (secrets or env)', async () => {
    const p = new CloudflareSfuProvider(
      secrets({ appId: creds.appId, appToken: 'good-secret' }),
      undefined,
    );
    expect(p.name).toBe('cloudflare');
    expect(await p.isConfigured()).toBe(true);
    const none = new CloudflareSfuProvider(secrets(null), undefined);
    expect(await none.isConfigured()).toBe(false);
    const half = new CloudflareSfuProvider(
      secrets({ appId: creds.appId }),
      undefined,
    );
    expect(await half.isConfigured()).toBe(false);
    const env = new CloudflareSfuProvider(secrets(null), {
      get: (k: string) =>
        k === 'CLOUDFLARE_SFU_APP_ID'
          ? creds.appId
          : k === 'CLOUDFLARE_SFU_APP_TOKEN'
            ? 'good-secret'
            : undefined,
    });
    expect(await env.isConfigured()).toBe(true);
  });

  it('probe: one real sessions/new with the current keys; healthy() never throws', async () => {
    const cf = new FakeCloudflare();
    const p = new CloudflareSfuProvider(
      secrets({ appId: creds.appId, appToken: 'good-secret' }),
      undefined,
      cf.fetch,
    );
    await expect(p.probe()).resolves.toBeUndefined();
    expect(await p.healthy()).toBe(true);
    expect(cf.calls).toHaveLength(2);
    cf.failStatus = 503;
    expect(await p.healthy()).toBe(false);
    await expect(p.probe()).rejects.toBeInstanceOf(CloudflareSfuError);

    const un = new CloudflareSfuProvider(secrets(null), undefined);
    expect(await un.healthy()).toBe(false);
    await expect(un.probe()).rejects.toThrow('not set');
  });
});

describe('decideMediaProvider (owner 2026-10-26: Cloudflare primary)', () => {
  const base = {
    isGroup: true,
    video: true,
    headcount: 3,
    useCloudflare: true,
    cloudflareWanted: true,
    meshVideoMax: 4,
  };
  it('1:1 calls are device to device (relayed by TURN), never the SFU', () => {
    expect(decideMediaProvider({ ...base, isGroup: false })).toEqual({
      mediaProvider: 'p2p',
      video: true,
      degraded: false,
    });
  });
  it('Cloudflare up carries any size with video', () => {
    expect(decideMediaProvider({ ...base, headcount: 20 })).toEqual({
      mediaProvider: 'cloudflare',
      video: true,
      degraded: false,
    });
  });
  it('own path chosen on purpose (no keys / transport own): plain mesh, not degraded', () => {
    expect(
      decideMediaProvider({
        ...base,
        useCloudflare: false,
        cloudflareWanted: false,
        headcount: 8,
      }),
    ).toEqual({ mediaProvider: 'p2p', video: true, degraded: false });
  });
  it('backup (wanted but failing): up to 4 keep video, 5 or more audio, never refused', () => {
    const down = { ...base, useCloudflare: false };
    expect(decideMediaProvider({ ...down, headcount: 4 })).toEqual({
      mediaProvider: 'p2p',
      video: true,
      degraded: true,
    });
    expect(decideMediaProvider({ ...down, headcount: 5 })).toEqual({
      mediaProvider: 'p2p',
      video: false,
      degraded: true,
    });
    expect(
      decideMediaProvider({ ...down, headcount: 6, meshVideoMax: 6 }).video,
    ).toBe(true);
  });
  it('an audio call stays audio', () => {
    expect(
      decideMediaProvider({ ...base, video: false, useCloudflare: false })
        .video,
    ).toBe(false);
  });
});

describe('cloudflare_sfu integration definition', () => {
  const def = PROVIDERS.find((p) => p.id === 'cloudflare_sfu');
  it('has a secret token, a hex app id and a test button', () => {
    expect(def).toBeDefined();
    const id = def!.fields.find((f) => f.name === 'appId')!;
    const tok = def!.fields.find((f) => f.name === 'appToken')!;
    expect(id.secret).toBe(false);
    expect(id.pattern!.test('0123456789abcdef0123456789abcdef')).toBe(true);
    expect(id.pattern!.test('nope')).toBe(false);
    expect(tok.secret).toBe(true);
    expect(def!.test).toBeInstanceOf(Function);
  });
});
