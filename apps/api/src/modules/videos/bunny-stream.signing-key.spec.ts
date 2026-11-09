import { BunnyStreamClient, type BunnyKeys } from './bunny-stream.client';

/**
 * Security audit 2026-11-08 (L10): without the admin-saved Read-Only key
 * the webhook fell back to the token in its URL (written to ALB logs).
 * With Bunny's account API key known, the library's ReadOnlyApiKey is
 * read from Bunny's Core API, so the signature is checked anyway.
 */
const base: BunnyKeys = {
  libraryId: '12345',
  cdnHostname: 'vz.b-cdn.net',
  apiKey: 'test-library-api-key-value',
  tokenAuthKey: 'token-auth-key-0123',
  webhookToken: 'tok_abcdefghijklmnopqrstuvwxyz',
};
const RO = 'test-readonly-key-value-x';

function client() {
  return new BunnyStreamClient({} as never);
}

function okFetch(body: unknown) {
  return jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(body) }),
  ) as unknown as typeof fetch & jest.Mock;
}

describe('BunnyStreamClient.webhookSigningKey (audit L10)', () => {
  it('the admin-saved key wins and Bunny is not asked', async () => {
    const f = okFetch({ ReadOnlyApiKey: RO });
    await expect(
      client().webhookSigningKey(
        { ...base, webhookSigningKey: 'test-saved-readonly-key-value' },
        f,
      ),
    ).resolves.toBe('test-saved-readonly-key-value');
    expect(f).not.toHaveBeenCalled();
  });

  it('reads ReadOnlyApiKey with the account key, once an hour', async () => {
    const f = okFetch({ ReadOnlyApiKey: RO });
    const c = client();
    const k = { ...base, accountApiKey: 'test-account-api-key-value' };
    await expect(c.webhookSigningKey(k, f)).resolves.toBe(RO);
    await expect(c.webhookSigningKey(k, f)).resolves.toBe(RO);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.bunny.net/videolibrary/12345');
    expect((init.headers as Record<string, string>).AccessKey).toBe(
      'test-account-api-key-value',
    );
  });

  it('no account key, or Bunny failing: undefined (URL token fallback)', async () => {
    await expect(
      client().webhookSigningKey(base, okFetch({ ReadOnlyApiKey: RO })),
    ).resolves.toBeUndefined();
    const broken = jest.fn(() =>
      Promise.reject(new Error('down')),
    ) as unknown as typeof fetch;
    await expect(
      client().webhookSigningKey(
        { ...base, accountApiKey: 'test-account-api-key-value' },
        broken,
      ),
    ).resolves.toBeUndefined();
  });
});
