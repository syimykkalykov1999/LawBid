import {
  CircuitBreaker,
  CircuitOpenError,
} from '../common/resilience/resilience';
import { isTransientInfraError } from '../common/resilience/transient-errors';
import { transientRetryAttempts } from './transient-retry.extension';

describe('transientRetryAttempts', () => {
  it('defaults to 3, is configurable and can be switched off', () => {
    expect(transientRetryAttempts({})).toBe(3);
    expect(transientRetryAttempts({ DB_TRANSIENT_RETRIES: '5' })).toBe(5);
    expect(transientRetryAttempts({ DB_TRANSIENT_RETRIES: '0' })).toBe(0);
    expect(transientRetryAttempts({ DB_TRANSIENT_RETRIES: '99' })).toBe(6);
  });
});

describe('database circuit breaker', () => {
  it('opens after 10 transient failures and fails calls at once', async () => {
    const b = new CircuitBreaker('db-test', { threshold: 10, openMs: 3_000 });
    const down = () =>
      b.run(
        () => Promise.reject(Object.assign(new Error('x'), { code: 'P1001' })),
        isTransientInfraError,
      );
    for (let i = 0; i < 10; i += 1) await expect(down()).rejects.toThrow('x');
    const work = jest.fn();
    await expect(b.run(work, isTransientInfraError)).rejects.toBeInstanceOf(
      CircuitOpenError,
    );
    expect(work).not.toHaveBeenCalled();
  });

  it('a constraint error does not count as the database being down', async () => {
    const b = new CircuitBreaker('db-test2', { threshold: 2, openMs: 3_000 });
    for (let i = 0; i < 5; i += 1) {
      await expect(
        b.run(
          () =>
            Promise.reject(Object.assign(new Error('dup'), { code: 'P2002' })),
          isTransientInfraError,
        ),
      ).rejects.toThrow('dup');
    }
    expect(b.isOpen).toBe(false);
  });
});
