import { AuthChallengeService } from './auth-challenge.service';

/** S14-13 (2026-10-25): count failures, challenge only after N. */
describe('AuthChallengeService', () => {
  function make(threshold: number) {
    const counts = new Map<string, number>();
    const rateLimit = {
      hashIdentifier: (v: string) => `h(${v})`,
      consumeFixedWindow: jest.fn((parts: string[]) => {
        const k = parts.join(':');
        counts.set(k, (counts.get(k) ?? 0) + 1);
        return Promise.resolve({ allowed: true });
      }),
      peekFixedWindow: jest.fn((parts: string[]) =>
        Promise.resolve(counts.get(parts.join(':')) ?? 0),
      ),
      resetFixedWindow: jest.fn((parts: string[]) => {
        counts.delete(parts.join(':'));
        return Promise.resolve();
      }),
    };
    const logger = { setContext: jest.fn(), info: jest.fn() };
    const service = new AuthChallengeService(
      rateLimit as never,
      logger as never,
      { number: () => Promise.resolve(threshold) } as never,
    );
    return { service, logger };
  }

  it('off (0): never challenged, but failures are still logged for the alarm', async () => {
    const { service, logger } = make(0);
    for (let i = 0; i < 20; i += 1) {
      await service.recordFailure('password', '+1415', '1.2.3.4');
    }
    expect(await service.isChallenged('+1415', '1.2.3.4')).toBe(false);
    expect(logger.info).toHaveBeenCalledWith(
      { metric: 'auth_failure', kind: 'password' },
      'auth failure',
    );
  });

  it('challenges an account after N failures, an address after 5N, and a good sign-in clears the account', async () => {
    const { service } = make(3);
    for (let i = 0; i < 2; i += 1) {
      await service.recordFailure('password', '+1415', '1.2.3.4');
    }
    expect(await service.isChallenged('+1415', '9.9.9.9')).toBe(false);
    await service.recordFailure('password', '+1415', '1.2.3.4');
    expect(await service.isChallenged('+1415', '9.9.9.9')).toBe(true);
    // another account from the same (not yet noisy) address: still open
    expect(await service.isChallenged('+1999', '1.2.3.4')).toBe(false);
    await service.clear('+1415');
    expect(await service.isChallenged('+1415', '9.9.9.9')).toBe(false);
    // 15 failures from one address across accounts challenge the address
    for (let i = 0; i < 12; i += 1) {
      await service.recordFailure('password', `+1${i}00`, '1.2.3.4');
    }
    expect(await service.isChallenged('+1999', '1.2.3.4')).toBe(true);
  });

  it('a Redis failure is "not challenged"', async () => {
    const { service } = make(3);
    (
      service as unknown as { rateLimit: { peekFixedWindow: jest.Mock } }
    ).rateLimit.peekFixedWindow = jest
      .fn()
      .mockRejectedValue(new Error('down'));
    expect(await service.isChallenged('+1415', '1.2.3.4')).toBe(false);
  });
});
