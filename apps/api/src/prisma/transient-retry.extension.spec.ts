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

describe('half-open trial', () => {
  it('a trial that never settles does not shut the circuit for good', async () => {
    const clock = { t: 0 };
    const b = new CircuitBreaker('db-trial', {
      threshold: 1,
      openMs: 1_000,
      now: () => clock.t,
    });
    await expect(
      b.run(
        () => Promise.reject(new Error('x')),
        () => true,
      ),
    ).rejects.toThrow('x');
    clock.t = 2_000; // pause over: one trial call goes through ...
    void b.run(() => new Promise(() => undefined)); // ... and hangs
    await expect(b.run(() => Promise.resolve(1))).rejects.toBeInstanceOf(
      CircuitOpenError,
    );
    clock.t = 2_000 + 31_000; // deadline passed: the next call is the trial
    await expect(b.run(() => Promise.resolve('up'))).resolves.toBe('up');
  });
});
