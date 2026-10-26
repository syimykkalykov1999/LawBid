import {
  WebRtcVideoProvider,
  videoCallAvailability,
} from './video-call-provider';

function make(
  env: Record<string, string>,
  secrets: Record<string, Record<string, string>> = {},
) {
  return new WebRtcVideoProvider(
    {
      get: (k: string) =>
        Promise.resolve(secrets[k] ? { fields: secrets[k] } : null),
    } as never,
    { get: (k: string) => env[k] },
  );
}

describe('WebRtcVideoProvider.isConfigured', () => {
  const prod = { NODE_ENV: 'production' };

  it('is true in development and test without any keys', async () => {
    expect(await make({ NODE_ENV: 'development' }).isConfigured()).toBe(true);
    expect(await make({ NODE_ENV: 'test' }).isConfigured()).toBe(true);
  });

  it('is false in production with no TURN of any kind', async () => {
    expect(await make(prod).isConfigured()).toBe(false);
  });

  it('is true with Cloudflare TURN keys from the admin, no own TURN', async () => {
    const p = make(prod, { cloudflare_turn: { keyId: 'k', apiToken: 't' } });
    expect(await p.isConfigured()).toBe(true);
  });

  it('is true with Cloudflare TURN keys from the env', async () => {
    const p = make({
      ...prod,
      CLOUDFLARE_TURN_KEY_ID: 'k',
      CLOUDFLARE_TURN_API_TOKEN: 't',
    });
    expect(await p.isConfigured()).toBe(true);
  });

  it('needs both Cloudflare values', async () => {
    const p = make(prod, { cloudflare_turn: { keyId: 'k' } });
    expect(await p.isConfigured()).toBe(false);
  });

  it('still accepts own coturn', async () => {
    const p = make({
      ...prod,
      TURN_URLS: 'turn:t.example.com:3478',
      TURN_SECRET: 's'.repeat(20),
    });
    expect(await p.isConfigured()).toBe(true);
  });

  it('videoCallAvailability is available with Cloudflare only', async () => {
    const p = make(prod, { cloudflare_turn: { keyId: 'k', apiToken: 't' } });
    expect(await videoCallAvailability(true, p)).toEqual({
      available: true,
      reason: null,
    });
    expect(await videoCallAvailability(true, make(prod))).toEqual({
      available: false,
      reason: 'provider_not_configured',
    });
  });
});
