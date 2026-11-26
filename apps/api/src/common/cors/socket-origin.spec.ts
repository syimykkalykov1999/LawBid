import type { IncomingMessage } from 'node:http';
import { CorsPolicy } from './cors-policy';
import {
  installSocketOriginPolicy,
  SOCKET_CORS,
  socketAllowRequest,
  socketOriginAllowed,
} from './socket-origin';

/** ASVS 5.0 V4.4.2 (STAGE2_SECURITY #6): socket handshakes check Origin. */
describe('socket Origin allowlist', () => {
  const policy = new CorsPolicy(
    ['https://admin.lawbid.dev'],
    'production',
    () => Promise.resolve(['https://lawbid.dev']),
  );
  beforeEach(() => installSocketOriginPolicy(policy));
  afterAll(() => installSocketOriginPolicy(null));

  const ask = (origin?: string) =>
    new Promise<{ err: unknown; ok: boolean }>((resolve) =>
      socketAllowRequest(
        { headers: origin ? { origin } : {} } as IncomingMessage,
        (err, ok) => resolve({ err, ok }),
      ),
    );

  it('accepts the phone apps (no Origin), the web app and the admin', async () => {
    expect(await ask()).toEqual({ err: null, ok: true });
    expect(await ask('https://lawbid.dev')).toEqual({ err: null, ok: true });
    expect(await ask('https://admin.lawbid.dev')).toEqual({
      err: null,
      ok: true,
    });
  });

  it('refuses any other browser origin', async () => {
    for (const o of [
      'https://evil.example',
      'http://lawbid.dev',
      'https://lawbid.dev.evil.example',
      'null',
    ]) {
      const r = await ask(o);
      expect(r.ok).toBe(false);
      expect(r.err).toBeTruthy();
    }
  });

  it('polling CORS uses the same list (no reflection of any origin)', async () => {
    const cors = (o?: string) =>
      new Promise<boolean | undefined>((resolve) =>
        SOCKET_CORS.origin(o, (_e, allow) => resolve(allow)),
      );
    expect(await cors('https://lawbid.dev')).toBe(true);
    expect(await cors('https://evil.example')).toBe(false);
  });

  it('fails closed for a browser origin before the policy is installed', async () => {
    installSocketOriginPolicy(null);
    expect(await socketOriginAllowed('https://lawbid.dev')).toBe(false);
    expect(await socketOriginAllowed(undefined)).toBe(true);
  });
});
