import {
  assertRegistryUrl,
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
