import {
  assertPublicResolution,
  assertRegistryUrl,
  isPrivateAddress,
  getPath,
  namesMatch,
  outcomeFor,
  splitValues,
} from './registry-http';
import { fillTemplate } from './state-bar-adapter';

describe('registry helpers (owner 2026-10-05)', () => {
  it('getPath walks objects and list indexes', () => {
    const body = { a: { list: [{ b: 'x' }] } };
    expect(getPath(body, 'a.list.0.b')).toBe('x');
    expect(getPath(body, 'a.missing.b')).toBeUndefined();
    expect(getPath(body, '')).toBe(body);
  });

  it('namesMatch: apart, full name, and an empty account name', () => {
    const acc = { firstName: 'José', lastName: "O'Brien" };
    expect(namesMatch(acc, { first: 'JOSE', last: 'OBRIEN' })).toBe(true);
    expect(namesMatch(acc, { first: 'JUAN', last: 'OBRIEN' })).toBe(false);
    expect(namesMatch(acc, { full: 'Jose Maria O Brien' })).toBe(true);
    expect(namesMatch({ firstName: 'A', lastName: '' }, { last: '' })).toBe(
      false,
    );
  });

  it('splitValues lowercases and trims', () => {
    expect(splitValues(' Active ,Active - Good Standing,')).toEqual([
      'active',
      'active - good standing',
    ]);
  });

  it('fillTemplate URL-encodes the values', () => {
    expect(
      fillTemplate('https://x.example/{state}/{bar_number}?n={last_name}', {
        stateCode: 'CA',
        barNumber: '12/3',
        firstName: 'A',
        lastName: 'De La Cruz',
      }),
    ).toBe('https://x.example/CA/12%2F3?n=De%20La%20Cruz');
  });

  it('assertRegistryUrl: public https only in production', () => {
    expect(assertRegistryUrl('https://api.example.com/x', false).host).toBe(
      'api.example.com',
    );
    for (const bad of [
      'http://api.example.com/',
      'https://localhost/',
      'https://10.0.0.5/',
      'https://192.168.1.1/',
      'https://[::1]/',
      'https://metadata.internal/',
      'https://user:pw@api.example.com/',
      'ftp://api.example.com/',
      'nonsense',
    ]) {
      expect(() => assertRegistryUrl(bad, false)).toThrow();
    }
    expect(assertRegistryUrl('http://127.0.0.1:9/x', true).port).toBe('9');
  });

  it('assertRegistryUrl: metadata service, IPv4-in-IPv6 and multicast (audit 2026-10-07)', () => {
    for (const bad of [
      'https://169.254.169.254/latest/meta-data/',
      'https://[::ffff:169.254.169.254]/',
      'https://[::ffff:a9fe:a9fe]/',
      'https://[fe80::1]/',
      'https://[::]/',
      'https://0.0.0.0/',
      'https://224.0.0.1/',
    ]) {
      expect(() => assertRegistryUrl(bad, false)).toThrow(
        'Local and private addresses are not allowed',
      );
    }
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('assertPublicResolution: a public name pointing at a private address is refused', async () => {
    const url = new URL('https://registry.example.com/x');
    await expect(
      assertPublicResolution(url, false, () =>
        Promise.resolve([
          { address: '93.184.216.34' },
          { address: '169.254.169.254' },
        ]),
      ),
    ).rejects.toThrow('Local and private addresses are not allowed');
    await expect(
      assertPublicResolution(url, false, () =>
        Promise.reject(new Error('ENOTFOUND')),
      ),
    ).rejects.toThrow('was not found');
    await expect(
      assertPublicResolution(url, false, () =>
        Promise.resolve([{ address: '93.184.216.34' }]),
      ),
    ).resolves.toBeUndefined();
    // Tests and dev talk to a fake registry on 127.0.0.1.
    await expect(
      assertPublicResolution(url, true, () =>
        Promise.resolve([{ address: '127.0.0.1' }]),
      ),
    ).resolves.toBeUndefined();
  });

  it('outcomeFor keeps the raw record short', () => {
    const big = { text: 'x'.repeat(5000), last: 'Doe', first: 'Jane' };
    const out = outcomeFor(
      'p',
      { firstName: 'Jane', lastName: 'Doe' },
      {
        status: 'ok',
        first: 'Jane',
        last: 'Doe',
        full: undefined,
        admitted: null,
        raw: big,
      },
      [],
      null,
    );
    expect(out.result).toBe('pass');
    expect(String(out.details.raw).length).toBeLessThanOrEqual(1001);
  });
});
