import { generateKeyPairSync, verify } from 'node:crypto';
import type { PinoLogger } from 'nestjs-pino';
import type { SecretsService } from '../../../common/secrets/secrets.service';
import { ApnsVoipSender, voipEndRequest } from './apns-voip.sender';
import type { VoipTokensService } from './voip-tokens.service';

/** Owner 2026-10-17: iPhone calls as VoIP pushes straight to Apple. */
describe('ApnsVoipSender', () => {
  const logger = { warn: jest.fn(), info: jest.fn() } as unknown as PinoLogger;
  const call = {
    callId: '7f0c1e2a-1111-4222-8333-944455556666',
    conversationId: 'c',
    callerName: 'Anna',
    video: false,
    silent: false,
  };

  it('sends nothing without APNs keys', async () => {
    const tokens = { activeDevices: jest.fn() };
    const sender = new ApnsVoipSender(
      { get: jest.fn().mockResolvedValue(null) } as unknown as SecretsService,
      tokens as unknown as VoipTokensService,
      logger,
    );
    await expect(sender.ringCall('u', call)).resolves.toEqual([]);
    expect(tokens.activeDevices).not.toHaveBeenCalled();
  });

  it('signs an ES256 provider token Apple can verify, and reuses it', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const secrets = {
      get: jest.fn().mockResolvedValue({
        fingerprint: 'f1',
        fields: { keyId: 'ABC123DEFG', teamId: '78T56RPM74', privateKey: pem },
      }),
    } as unknown as SecretsService;
    const sender = new ApnsVoipSender(
      secrets,
      { activeDevices: jest.fn() } as unknown as VoipTokensService,
      logger,
    );
    const s = sender as unknown as { providerToken(): Promise<string> };
    const token = await s.providerToken();
    const [head, claims, sig] = token.split('.');
    expect(JSON.parse(Buffer.from(head, 'base64url').toString())).toEqual({
      alg: 'ES256',
      kid: 'ABC123DEFG',
    });
    expect(
      JSON.parse(Buffer.from(claims, 'base64url').toString()),
    ).toMatchObject({ iss: '78T56RPM74' });
    expect(
      verify(
        'sha256',
        Buffer.from(`${head}.${claims}`),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(sig, 'base64url'),
      ),
    ).toBe(true);
    await expect(s.providerToken()).resolves.toBe(token);
  });

  it('retries the other environment once and remembers it; drops dead tokens', async () => {
    const tokens = {
      activeDevices: jest.fn().mockResolvedValue([
        {
          token: 'a',
          topic: 't.voip',
          environment: 'sandbox',
          sessionId: 's1',
        },
        {
          token: 'b',
          topic: 't.voip',
          environment: 'sandbox',
          sessionId: 's2',
        },
      ]),
      setEnvironment: jest.fn(),
      remove: jest.fn(),
    };
    const sender = new ApnsVoipSender(
      { get: jest.fn() } as unknown as SecretsService,
      tokens as unknown as VoipTokensService,
      logger,
    );
    const s = sender as unknown as {
      providerToken(): Promise<string>;
      send(d: { token: string }, env: string): Promise<string>;
    };
    s.providerToken = () => Promise.resolve('jwt');
    s.send = (d, env) =>
      Promise.resolve(
        d.token === 'a' ? (env === 'production' ? 'ok' : 'wrong_env') : 'gone',
      );
    await expect(sender.ringCall('u', call)).resolves.toEqual(['s1']);
    expect(tokens.setEnvironment).toHaveBeenCalledWith('a', 'production');
    expect(tokens.remove).toHaveBeenCalledWith('b');
  });

  /** LC-1 (audit 2026-10-26): a cancelled ring stops a locked iPhone at
   * once — through the VoIP channel, only on the phones it rang, never on
   * the phone that answered. */
  describe('stop ringing (LC-1)', () => {
    class MemRedis {
      store = new Map<string, string>();
      ttl = new Map<string, number>();
      get(k: string) {
        return Promise.resolve(this.store.get(k) ?? null);
      }
      set(k: string, v: string, _ex: string, sec: number) {
        this.store.set(k, v);
        this.ttl.set(k, sec);
        return Promise.resolve('OK');
      }
      del(k: string) {
        return Promise.resolve(this.store.delete(k) ? 1 : 0);
      }
    }
    const devices = [
      {
        token: 'a',
        topic: 't.voip',
        environment: 'sandbox',
        sessionId: 's1',
        chainId: 'chainA',
      },
      {
        token: 'b',
        topic: 't.voip',
        environment: 'production',
        sessionId: 's2',
        chainId: 'chainB',
      },
    ];
    const make = (redis?: MemRedis) => {
      const tokens = {
        activeDevices: jest
          .fn()
          .mockResolvedValue(devices.map((d) => ({ ...d }))),
        setEnvironment: jest.fn(),
        remove: jest.fn(),
      };
      const sender = new ApnsVoipSender(
        { get: jest.fn() } as unknown as SecretsService,
        tokens as unknown as VoipTokensService,
        logger,
        redis as never,
      );
      const posted: {
        env: string;
        body: string;
        headers: Record<string, string>;
      }[] = [];
      const s = sender as unknown as {
        providerToken(): Promise<string>;
        send(d: { token: string }, env: string): Promise<string>;
        post(
          env: string,
          r: { headers: Record<string, string>; body: string },
        ): Promise<string>;
      };
      s.providerToken = () => Promise.resolve('jwt');
      s.send = () => Promise.resolve('ok');
      s.post = (env, r) => {
        posted.push({ env, ...r });
        return Promise.resolve('ok');
      };
      return { sender, posted };
    };

    it("the end push is a priority-10 VoIP push with the ring's collapse id", () => {
      const { headers, body } = voipEndRequest(
        { token: 'tok', topic: 'com.x.voip' },
        call.callId,
        'jwt',
      );
      expect(headers).toMatchObject({
        ':path': '/3/device/tok',
        'apns-topic': 'com.x.voip',
        'apns-push-type': 'voip',
        'apns-priority': '10',
        'apns-collapse-id': call.callId,
      });
      expect(JSON.parse(body)).toEqual({
        aps: {},
        type: 'call_ended',
        callId: call.callId,
      });
    });

    it('reaches every phone the call rang, each in the environment that worked', async () => {
      const redis = new MemRedis();
      const { sender, posted } = make(redis);
      await sender.ringCall('u', call);
      expect(redis.ttl.get(`push:voip:rang:${call.callId}:u`)).toBe(180);
      await expect(sender.endCall('u', call.callId)).resolves.toBe(2);
      expect(posted.map((p) => [p.env, p.headers[':path']])).toEqual([
        ['sandbox', '/3/device/a'],
        ['production', '/3/device/b'],
      ]);
      // Once: a second stop (another job) sends nothing.
      await expect(sender.endCall('u', call.callId)).resolves.toBe(0);
    });

    it('never tells the answering phone (its CallKit call is THE call)', async () => {
      const redis = new MemRedis();
      const { sender, posted } = make(redis);
      await sender.ringCall('u', call);
      await expect(sender.endCall('u', call.callId, 'chainA')).resolves.toBe(1);
      expect(posted.map((p) => p.headers[':path'])).toEqual(['/3/device/b']);
    });

    it("after the phone's own 45 s ring is over, no stop (it is quiet already)", async () => {
      const redis = new MemRedis();
      const { sender, posted } = make(redis);
      const t0 = Date.now();
      const now = jest.spyOn(Date, 'now').mockReturnValue(t0);
      try {
        await sender.ringCall('u', call);
        now.mockReturnValue(t0 + 60_000);
        await expect(sender.endCall('u', call.callId)).resolves.toBe(0);
        expect(posted).toEqual([]);
      } finally {
        now.mockRestore();
      }
    });

    it('a phone the call never rang by VoIP gets nothing (no CallKit flash)', async () => {
      const redis = new MemRedis();
      const { sender, posted } = make(redis);
      await expect(sender.endCall('u', 'other-call')).resolves.toBe(0);
      expect(posted).toEqual([]);
    });

    it('without Redis nothing is sent and nothing throws', async () => {
      const { sender, posted } = make(undefined);
      await sender.ringCall('u', call);
      await expect(sender.endCall('u', call.callId)).resolves.toBe(0);
      expect(posted).toEqual([]);
    });
  });
});
