import { createHash } from 'node:crypto';
import { AccessToken } from 'livekit-server-sdk';
import {
  LIVEKIT_MAX_CALL_SEC,
  LiveKitVideoProvider,
  livekitHttpUrl,
} from './livekit.provider';

const keys = {
  url: 'wss://lk.example.test',
  apiKey: 'APIkey123',
  apiSecret: 'secret-secret-secret-secret-1234',
};
const CALL = '11111111-2222-3333-4444-555555555555';
const USER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

interface Claims {
  sub: string;
  iss: string;
  nbf: number;
  exp: number;
  video: Record<string, unknown>;
}

function decode(jwt: string): Claims {
  return JSON.parse(
    Buffer.from(jwt.split('.')[1], 'base64url').toString(),
  ) as Claims;
}

describe('LiveKitVideoProvider', () => {
  const provider = new LiveKitVideoProvider(undefined, undefined);

  it('is not configured without keys and reads env keys', async () => {
    expect(await provider.isConfigured()).toBe(false);
    const env: Record<string, string> = {
      LIVEKIT_URL: keys.url,
      LIVEKIT_API_KEY: keys.apiKey,
      LIVEKIT_API_SECRET: keys.apiSecret,
    };
    const withEnv = new LiveKitVideoProvider(undefined, {
      get: (k: string) => env[k],
    });
    expect(await withEnv.keys()).toEqual(keys);
    // The admin's Integrations card wins over the env.
    const withDb = new LiveKitVideoProvider(
      {
        get: () => Promise.resolve({ fields: { url: 'wss://db.test' } }),
      } as never,
      { get: (k: string) => env[k] },
    );
    expect((await withDb.keys())?.url).toBe('wss://db.test');
  });

  it('issues a token: identity = user id, room = call id, TTL = call max', async () => {
    const now = new Date('2026-10-23T10:00:00Z');
    const j = await provider.issueToken(keys, CALL, USER, 'speaker', now);
    const c = decode(j.token);
    expect(c.sub).toBe(USER);
    expect(c.iss).toBe(keys.apiKey);
    expect(c.video).toMatchObject({
      room: CALL,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });
    expect(c.exp - c.nbf).toBe(LIVEKIT_MAX_CALL_SEC);
    expect(j.expiresAt.getTime() - now.getTime()).toBe(
      LIVEKIT_MAX_CALL_SEC * 1000,
    );
  });

  it('a listener cannot publish', async () => {
    const j = await provider.issueToken(keys, CALL, USER, 'listener');
    const v = decode(j.token).video;
    expect(v.canPublish).toBe(false);
    expect(v.canPublishData).toBe(false);
    expect(v.canSubscribe).toBe(true);
  });

  async function signedWebhook(body: string, secret = keys.apiSecret) {
    const t = new AccessToken(keys.apiKey, secret);
    t.sha256 = createHash('sha256').update(body).digest('base64');
    return t.toJwt();
  }

  it('accepts a correctly signed webhook', async () => {
    const body = JSON.stringify({
      event: 'participant_left',
      room: { name: CALL },
      participant: { identity: USER },
    });
    const ev = await provider.verifyWebhook(
      keys,
      body,
      await signedWebhook(body),
    );
    expect(ev.event).toBe('participant_left');
    expect(ev.room?.name).toBe(CALL);
  });

  it('rejects a wrong secret, a tampered body and a missing header', async () => {
    const body = JSON.stringify({ event: 'room_finished' });
    await expect(
      provider.verifyWebhook(
        keys,
        body,
        await signedWebhook(body, 'x'.repeat(32)),
      ),
    ).rejects.toThrow();
    await expect(
      provider.verifyWebhook(
        keys,
        body.replace('finished', 'started'),
        await signedWebhook(body),
      ),
    ).rejects.toThrow();
    await expect(
      provider.verifyWebhook(keys, body, undefined),
    ).rejects.toThrow();
  });

  it('turns wss into https for the REST API', () => {
    expect(livekitHttpUrl('wss://a.b')).toBe('https://a.b');
    expect(livekitHttpUrl('ws://localhost:7880')).toBe('http://localhost:7880');
  });
});
