import { UnauthorizedException } from '@nestjs/common';
import { ReauthVerifier } from './reauth-verifier.service';

/** Detective R2B-12 (14.11): a read behind reauth that an older app does
 * without the token. With a token it is checked (not consumed); without
 * one only a build older than the admin's «from this version on» setting
 * passes, and only while that setting is filled in. */
function make(opts: {
  token?: string;
  appVersion?: string;
  minVersion: string;
  used?: boolean;
}) {
  const tokens = {
    verifyReauthToken: jest
      .fn()
      .mockReturnValue({ sub: 'u1', sid: 's1', jti: 'j1' }),
  };
  const redis = {
    set: jest.fn().mockResolvedValue('OK'),
    exists: jest.fn().mockResolvedValue(opts.used ? 1 : 0),
  };
  const config = { getOrThrow: jest.fn().mockReturnValue(300) };
  const settings = {
    string: jest.fn((k: string) =>
      Promise.resolve(
        k === 'security.export_reauth_min_app_version' ? opts.minVersion : '',
      ),
    ),
  };
  const verifier = new ReauthVerifier(
    tokens as never,
    redis as never,
    config as never,
    {} as never,
    settings as never,
  );
  const headers: Record<string, string | undefined> = {
    'x-reauth-token': opts.token,
    'x-app-version': opts.appVersion,
  };
  const req = {
    user: { sub: 'u1', sid: 's1' },
    header: (name: string) => headers[name.toLowerCase()],
  };
  return { verifier, req: req as never, redis, tokens };
}

const KEY = 'security.export_reauth_min_app_version' as const;

describe('ReauthVerifier.validOrLegacyClient (R2B-12)', () => {
  it('a valid token passes and is not consumed', async () => {
    const { verifier, req, redis } = make({ token: 't', minVersion: '1.1.0' });
    await expect(verifier.validOrLegacyClient(req, KEY)).resolves.toBe(true);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('a used or wrong token is refused even for an old app', async () => {
    const { verifier, req } = make({
      token: 't',
      appVersion: '1.0.0',
      minVersion: '1.1.0',
      used: true,
    });
    await expect(verifier.validOrLegacyClient(req, KEY)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('no token while the setting is empty = today’s behaviour', async () => {
    const { verifier, req } = make({ appVersion: '9.0.0', minVersion: '' });
    await expect(verifier.validOrLegacyClient(req, KEY)).resolves.toBe(true);
  });

  it('no token from a build older than the setting passes', async () => {
    const { verifier, req } = make({
      appVersion: '1.0.0',
      minVersion: '1.1.0',
    });
    await expect(verifier.validOrLegacyClient(req, KEY)).resolves.toBe(true);
  });

  it('no token from the setting version or newer does not', async () => {
    const { verifier, req } = make({
      appVersion: '1.1.0',
      minVersion: '1.1.0',
    });
    await expect(verifier.validOrLegacyClient(req, KEY)).resolves.toBe(false);
  });

  it('no token and no version header does not (curl, a stolen token)', async () => {
    const { verifier, req } = make({ minVersion: '1.1.0' });
    await expect(verifier.validOrLegacyClient(req, KEY)).resolves.toBe(false);
  });
});
