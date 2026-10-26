import {
  CLOUDFLARE_FRESH_KEY_404,
  cleanPasted,
  normalizePem,
  providerById,
} from './provider-registry';

const BODY = 'A'.repeat(100);
const CANON = `-----BEGIN PRIVATE KEY-----\n${'A'.repeat(64)}\n${'A'.repeat(36)}\n-----END PRIVATE KEY-----\n`;

describe('pasted key cleanup (owner 2026-10-06)', () => {
  it('strips quotes and a trailing comma copied from JSON', () => {
    expect(cleanPasted('  "sk_test_abc",  ')).toBe('sk_test_abc');
    expect(cleanPasted("'abc'")).toBe('abc');
    expect(cleanPasted('abc')).toBe('abc');
  });

  it.each([
    [
      'real line breaks',
      `-----BEGIN PRIVATE KEY-----\n${BODY}\n-----END PRIVATE KEY-----\n`,
    ],
    [
      'literal \\n from the JSON',
      `"-----BEGIN PRIVATE KEY-----\\n${BODY}\\n-----END PRIVATE KEY-----\\n"`,
    ],
    [
      'one line with spaces',
      `-----BEGIN PRIVATE KEY----- ${BODY.slice(0, 50)} ${BODY.slice(50)} -----END PRIVATE KEY-----`,
    ],
    [
      'CRLF breaks',
      `-----BEGIN PRIVATE KEY-----\r\n${BODY}\r\n-----END PRIVATE KEY-----`,
    ],
  ])('normalizes a PEM key with %s', (_, input) => {
    expect(normalizePem(input)).toBe(CANON);
  });

  it('leaves a non-PEM value alone (the format check rejects it)', () => {
    expect(normalizePem('not a key')).toBe('not a key');
  });

  it('cleans the Bunny CDN hostname and the Twilio number', () => {
    const bunny = providerById('bunny_stream')!.fields.find(
      (f) => f.name === 'cdnHostname',
    )!;
    expect(bunny.normalize!('https://VZ-8d71fc2c-5f9.b-cdn.net/')).toBe(
      'vz-8d71fc2c-5f9.b-cdn.net',
    );
    expect(
      bunny.pattern!.test(bunny.normalize!('https://vz-abc.b-cdn.net/x')),
    ).toBe(true);
    const from = providerById('twilio')!.fields.find(
      (f) => f.name === 'fromNumber',
    )!;
    expect(from.normalize!('+1 (218) 551-6788')).toBe('+12185516788');
  });

  it.each(['cloudflare_sfu', 'cloudflare_turn'])(
    'TS-6: «Проверить» of %s on a fresh (404) App / key says «wait up to 60 s», not a bare HTTP 404',
    async (id) => {
      const realFetch = global.fetch;
      try {
        global.fetch = jest.fn(() =>
          Promise.resolve(new Response('{}', { status: 404 })),
        ) as never;
        const def = providerById(id)!;
        const fields = {
          appId: 'a'.repeat(32),
          appToken: 'secret-token-value',
          keyId: 'key-id-123',
          apiToken: 'secret-token-value',
        };
        const err = (await def.test!(fields).catch((e: unknown) => e)) as Error;
        expect(err.message).toBe(CLOUDFLARE_FRESH_KEY_404);
        expect(err.message).toContain('60 с');
        expect(err.message).not.toContain('secret-token-value');
        // A refused key is still «wrong key?».
        global.fetch = jest.fn(() =>
          Promise.resolve(new Response('{}', { status: 401 })),
        ) as never;
        await expect(def.test!(fields)).rejects.toThrow('wrong key?');
        // Any other failure keeps its status.
        global.fetch = jest.fn(() =>
          Promise.resolve(new Response('{}', { status: 503 })),
        ) as never;
        await expect(def.test!(fields)).rejects.toThrow('HTTP 503');
      } finally {
        global.fetch = realFetch;
      }
    },
  );

  it('a normalized Firebase key passes the format check', () => {
    const pk = providerById('fcm')!.fields.find(
      (f) => f.name === 'privateKey',
    )!;
    expect(
      pk.pattern!.test(
        pk.normalize!(
          `-----BEGIN PRIVATE KEY----- ${BODY} -----END PRIVATE KEY-----`,
        ),
      ),
    ).toBe(true);
  });
});
