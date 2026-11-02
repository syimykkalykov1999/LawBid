import type { CheckOutcome } from '../verification-providers';
import {
  BREAKER_FAILURES,
  BREAKER_OPEN_MS,
  CACHE_TTL_MS,
  RegistryGuard,
  RegistryGuardError,
} from './registry-guard';
import { RegistryRateLimitedError } from './registry-session';
import { allowed, parseRobots } from './robots';

const PASS: CheckOutcome = { result: 'pass', details: { found: true } };
const input = { barNumber: '123', firstName: 'Jane', lastName: 'Example' };

function setup() {
  const g = new RegistryGuard();
  let t = 1_000_000;
  g.now = () => t;
  return {
    g,
    tick: (ms: number) => {
      t += ms;
    },
    key: (n = '123') =>
      RegistryGuard.key('CA', 'state_preset', { ...input, barNumber: n }),
  };
}

describe('RegistryGuard (owner 2026-10-28: polite use)', () => {
  it('caches an answer for 24 h (same number and name)', async () => {
    const { g, tick, key } = setup();
    const call = jest.fn().mockResolvedValue(PASS);
    await g.run('CA', key(), { ratePerMin: 10 }, call);
    const again = await g.run('CA', key(), { ratePerMin: 10 }, call);
    expect(call).toHaveBeenCalledTimes(1);
    expect(again.details.cachedAt).toBeDefined();
    tick(CACHE_TTL_MS + 1);
    await g.run('CA', key(), { ratePerMin: 10 }, call);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('"fresh" (admin test) skips the cache', async () => {
    const { g, key } = setup();
    const call = jest.fn().mockResolvedValue(PASS);
    await g.run('CA', key(), { ratePerMin: 10 }, call);
    await g.run('CA', key(), { ratePerMin: 10, fresh: true }, call);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('rate limit: the 11th lookup in a minute is refused, next minute is fine', async () => {
    const { g, tick, key } = setup();
    const call = jest.fn().mockResolvedValue(PASS);
    for (let i = 0; i < 10; i += 1) {
      await g.run('CA', key(String(i)), { ratePerMin: 10 }, call);
    }
    await expect(
      g.run('CA', key('x'), { ratePerMin: 10 }, call),
    ).rejects.toMatchObject({
      kind: 'rate_limited',
    });
    // Other states have their own budget.
    await g.run('TX', 'TX|k', { ratePerMin: 10 }, call);
    tick(60_001);
    await g.run('CA', key('y'), { ratePerMin: 10 }, call);
    expect(call).toHaveBeenCalledTimes(12);
  });

  it('circuit breaker: 5 failures in a row pause the state for 10 min', async () => {
    const { g, tick, key } = setup();
    const boom = jest.fn().mockRejectedValue(new Error('HTTP 500'));
    for (let i = 0; i < BREAKER_FAILURES; i += 1) {
      await expect(
        g.run('CA', key(String(i)), { ratePerMin: 60 }, boom),
      ).rejects.toThrow('HTTP 500');
    }
    const ok = jest.fn().mockResolvedValue(PASS);
    const err = await g
      .run('CA', key('z'), { ratePerMin: 60 }, ok)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RegistryGuardError);
    expect((err as RegistryGuardError).kind).toBe('circuit_open');
    expect(ok).not.toHaveBeenCalled();
    expect(g.status('CA').pausedUntil).not.toBeNull();
    tick(BREAKER_OPEN_MS + 1);
    await g.run('CA', key('z'), { ratePerMin: 60 }, ok);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(g.status('CA').pausedUntil).toBeNull();
  });

  it('HTTP 429 pauses at once for Retry-After, doubling while it repeats', async () => {
    const { g, tick, key } = setup();
    const limited = jest
      .fn()
      .mockRejectedValue(new RegistryRateLimitedError(90));
    await expect(
      g.run('FL', 'FL|1', { ratePerMin: 4 }, limited),
    ).rejects.toBeInstanceOf(RegistryRateLimitedError);
    await expect(
      g.run('FL', 'FL|2', { ratePerMin: 4 }, limited),
    ).rejects.toMatchObject({
      kind: 'circuit_open',
    });
    tick(90_001);
    await expect(
      g.run('FL', 'FL|3', { ratePerMin: 4 }, limited),
    ).rejects.toBeInstanceOf(RegistryRateLimitedError);
    tick(90_001); // second pause is 180 s
    await expect(
      g.run('FL', 'FL|4', { ratePerMin: 4 }, limited),
    ).rejects.toMatchObject({
      kind: 'circuit_open',
    });
    expect(key()).toContain('CA|state_preset|123|JANE|EXAMPLE');
  });

  it('errors are not cached; reset() forgets a state', async () => {
    const { g, key } = setup();
    const flaky = jest
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue(PASS);
    await expect(g.run('CA', key(), { ratePerMin: 10 }, flaky)).rejects.toThrow(
      'timeout',
    );
    await g.run('CA', key(), { ratePerMin: 10 }, flaky);
    g.reset('CA');
    await g.run('CA', key(), { ratePerMin: 10 }, flaky);
    expect(flaky).toHaveBeenCalledTimes(3);
  });
});

describe('robots.txt rules', () => {
  const txt = `User-agent: *
Disallow: /cgi-bin/
Allow: /cgi-bin/public/

User-agent: BadBot
Disallow: /

User-agent: LawBid-LicenseCheck
Disallow: /private/
`;
  it('our own group wins over *', () => {
    const ours = parseRobots(txt, 'LawBid-LicenseCheck');
    expect(allowed(ours, '/cgi-bin/x')).toBe(true);
    expect(allowed(ours, '/private/a')).toBe(false);
  });
  it('* group: longest match, Allow wins a tie', () => {
    const star = parseRobots(txt, 'SomeoneElse');
    expect(allowed(star, '/cgi-bin/online/maine_bar/x.pl')).toBe(false);
    expect(allowed(star, '/cgi-bin/public/x')).toBe(true);
    expect(allowed(star, '/lawyers/1')).toBe(true);
  });
  it('Disallow: / blocks everything; wildcards and $ work', () => {
    expect(
      allowed(parseRobots('User-agent: *\nDisallow: /', 'x'), '/AttorneyFirm'),
    ).toBe(false);
    const w = parseRobots(
      'User-agent: *\nDisallow: /*?add-to-cart=\nDisallow: /*.pdf$',
      'x',
    );
    expect(allowed(w, '/shop?add-to-cart=1')).toBe(false);
    expect(allowed(w, '/a.pdf')).toBe(false);
    expect(allowed(w, '/a.pdf?x')).toBe(true);
    expect(allowed(parseRobots('', 'x'), '/anything')).toBe(true);
  });
});
