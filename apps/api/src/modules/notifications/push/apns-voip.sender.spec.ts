import { generateKeyPairSync, verify } from 'node:crypto';
import type { PinoLogger } from 'nestjs-pino';
import type { SecretsService } from '../../../common/secrets/secrets.service';
import { ApnsVoipSender } from './apns-voip.sender';
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
});
