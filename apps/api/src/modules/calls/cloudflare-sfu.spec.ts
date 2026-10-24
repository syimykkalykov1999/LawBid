import {
  CloudflareSfuClient,
  CloudflareSfuError,
} from './cloudflare-sfu.client';
import {
  CloudflareSfuProvider,
  SFU_ERROR_LIMIT,
  SFU_HEALTH_CACHE_MS,
} from './cloudflare-sfu.provider';
import { FakeCloudflare } from './cloudflare-sfu.fake';
import { decideMediaProvider } from './media-provider';
import { PROVIDERS } from '../../common/secrets/provider-registry';

const creds = { appId: 'a'.repeat(32), appToken: 'good-secret' };

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

  it('does not retry a mutation (tracks/new)', async () => {
    const cf = new FakeCloudflare();
    const c = new CloudflareSfuClient(creds, cf.fetch);
    const { sessionId } = await c.newSession();
    cf.failStatus = 503;
    const before = cf.calls.length;
    await expect(
      c.newTracks(sessionId, [
        { location: 'remote', sessionId: 'x', trackName: 'mic' },
      ]),
    ).rejects.toBeInstanceOf(CloudflareSfuError);
    expect(cf.calls.length - before).toBe(1);
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

  it('health: unconfigured is unhealthy; ok answers are cached 30 s; outages flip it', async () => {
    let t = 1_000_000;
    const cf = new FakeCloudflare();
    const p = new CloudflareSfuProvider(
      secrets({ appId: creds.appId, appToken: 'good-secret' }),
      undefined,
      cf.fetch,
      () => t,
    );
    expect(await p.healthy()).toBe(true);
    expect(await p.healthy()).toBe(true);
    expect(cf.calls).toHaveLength(1);
    t += SFU_HEALTH_CACHE_MS + 1;
    cf.failStatus = 503;
    expect(await p.healthy()).toBe(false);
    cf.failStatus = null;
    for (let i = 0; i < SFU_ERROR_LIMIT; i++) p.recordOutage();
    expect(await p.healthy()).toBe(false);
    t += 61_000;
    expect(await p.healthy()).toBe(true);

    const un = new CloudflareSfuProvider(secrets(null), undefined);
    expect(await un.healthy()).toBe(false);
  });
});

describe('decideMediaProvider (owner 2026-10-24, corrected)', () => {
  const base = {
    providerChoice: 'cloudflare',
    isGroup: true,
    video: true,
    headcount: 3,
    sfuHealthy: true,
    meshVideoMax: 4,
  };
  it('1:1 calls and non-cloudflare choices stay device to device', () => {
    expect(decideMediaProvider({ ...base, isGroup: false })).toMatchObject({
      mediaProvider: 'p2p',
      video: true,
      degraded: false,
    });
    expect(
      decideMediaProvider({
        ...base,
        providerChoice: 'p2p',
        sfuHealthy: false,
      }),
    ).toMatchObject({ mediaProvider: 'p2p', degraded: false });
  });
  it('healthy Cloudflare carries any size with video', () => {
    expect(decideMediaProvider({ ...base, headcount: 20 })).toEqual({
      mediaProvider: 'cloudflare',
      video: true,
      degraded: false,
    });
  });
  it('down: up to 4 keep video on mesh, 5 or more are audio only, never refused', () => {
    const down = { ...base, sfuHealthy: false };
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
    expect(decideMediaProvider({ ...down, headcount: 50 }).video).toBe(false);
    expect(
      decideMediaProvider({ ...down, headcount: 6, meshVideoMax: 6 }).video,
    ).toBe(true);
  });
  it('an audio call stays audio', () => {
    expect(
      decideMediaProvider({ ...base, video: false, sfuHealthy: false }).video,
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
