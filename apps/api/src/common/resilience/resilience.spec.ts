import {
  CallTimeoutError,
  CircuitBreaker,
  CircuitOpenError,
  withRetry,
  withTimeout,
} from './resilience';

describe('withTimeout', () => {
  it('passes a fast answer through', async () => {
    await expect(withTimeout('x', 50, () => Promise.resolve(7))).resolves.toBe(
      7,
    );
  });

  it('rejects a slow call with CallTimeoutError', async () => {
    await expect(
      withTimeout('twilio', 20, () => new Promise(() => undefined)),
    ).rejects.toBeInstanceOf(CallTimeoutError);
  });
});

describe('withRetry', () => {
  const sleep = jest.fn(() => Promise.resolve());

  it('tries again after a brief failure and returns the second answer', async () => {
    const fn = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new Error('reset'))
      .mockResolvedValueOnce('ok');
    await expect(withRetry(fn, { sleep })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('gives up after the attempts and throws the last error', async () => {
    const fn = jest.fn(() => Promise.reject(new Error('down')));
    await expect(withRetry(fn, { attempts: 3, sleep })).rejects.toThrow('down');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry what is not retryable', async () => {
    const fn = jest.fn(() => Promise.reject(new Error('bad number')));
    await expect(
      withRetry(fn, { sleep, retryable: () => false }),
    ).rejects.toThrow('bad number');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('CircuitBreaker', () => {
  const failing = () => Promise.reject(new Error('503'));

  it('opens after the threshold and stops calling the service', async () => {
    const t = 0;
    const b = new CircuitBreaker('bunny', {
      threshold: 3,
      openMs: 1000,
      now: () => t,
    });
    const fn = jest.fn(failing);
    for (let i = 0; i < 3; i += 1) {
      await expect(b.run(fn)).rejects.toThrow('503');
    }
    expect(b.isOpen).toBe(true);
    await expect(b.run(fn)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('lets one trial call through after the pause; success closes it', async () => {
    let t = 0;
    const b = new CircuitBreaker('fcm', {
      threshold: 1,
      openMs: 1000,
      now: () => t,
    });
    await expect(b.run(failing)).rejects.toThrow();
    t = 1500;
    await expect(b.run(() => Promise.resolve('back'))).resolves.toBe('back');
    expect(b.isOpen).toBe(false);
    await expect(b.run(() => Promise.resolve('again'))).resolves.toBe('again');
  });

  it('a failed trial opens it again', async () => {
    let t = 0;
    const b = new CircuitBreaker('fcm', {
      threshold: 1,
      openMs: 1000,
      now: () => t,
    });
    await expect(b.run(failing)).rejects.toThrow();
    t = 1500;
    await expect(b.run(failing)).rejects.toThrow('503');
    expect(b.isOpen).toBe(true);
  });

  it("errors that are the caller's fault do not count", async () => {
    const b = new CircuitBreaker('twilio', { threshold: 2 });
    const bad = () => Promise.reject(new Error('invalid number'));
    for (let i = 0; i < 5; i += 1) {
      await expect(b.run(bad, () => false)).rejects.toThrow();
    }
    expect(b.isOpen).toBe(false);
  });

  it('a success in between resets the count', async () => {
    const b = new CircuitBreaker('x', { threshold: 3 });
    await expect(b.run(failing)).rejects.toThrow();
    await expect(b.run(failing)).rejects.toThrow();
    await b.run(() => Promise.resolve(1));
    await expect(b.run(failing)).rejects.toThrow();
    await expect(b.run(failing)).rejects.toThrow();
    expect(b.isOpen).toBe(false);
  });

  it('lists every breaker with its state for the health board', () => {
    const b = new CircuitBreaker('snap-test', { threshold: 1, openMs: 60_000 });
    expect(
      CircuitBreaker.snapshot().find((x) => x.service === 'snap-test'),
    ).toEqual({ service: 'snap-test', state: 'closed' });
    return b.run(failing).catch(() => {
      expect(
        CircuitBreaker.snapshot().find((x) => x.service === 'snap-test')?.state,
      ).toBe('open');
    });
  });
});
