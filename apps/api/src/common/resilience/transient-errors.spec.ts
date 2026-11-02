import { CircuitOpenError } from './resilience';
import { outageProof } from '../queues/queue-hardening';
import {
  isTransientInfraError,
  isUnreachableBeforeSend,
  retryTransient,
} from './transient-errors';

const prismaErr = (code: string, message = 'x') =>
  Object.assign(new Error(message), { code });

describe('isTransientInfraError', () => {
  it.each([
    prismaErr('P1001'),
    prismaErr('P1017'),
    prismaErr('P2024'),
    prismaErr('57P01'),
    prismaErr('08006'),
    prismaErr('25006'),
    new Error('read ECONNRESET'),
    new Error('Command timed out'),
    new CircuitOpenError('database'),
    new Error('terminating connection due to administrator command'),
    Object.assign(new Error('wrapper'), {
      cause: new Error('connect ECONNREFUSED'),
    }),
  ])('retries %p', (e) => expect(isTransientInfraError(e)).toBe(true));

  it.each([
    prismaErr('P2002'),
    prismaErr('23505'),
    new Error('Validation failed'),
    null,
    undefined,
    'string',
  ])('does not retry %p', (e) => expect(isTransientInfraError(e)).toBe(false));

  it('a write is repeated only when it never left the process', () => {
    expect(isUnreachableBeforeSend(prismaErr('P1001'))).toBe(true);
    expect(isUnreachableBeforeSend(prismaErr('P1017'))).toBe(false);
    expect(isUnreachableBeforeSend(prismaErr('P1002'))).toBe(false);
  });
});

/** A database that is away for [downMs] of fake time, then answers. */
function flakyDb(downMs: number, clock: { t: number }) {
  const upAt = clock.t + downMs;
  let calls = 0;
  return {
    calls: () => calls,
    query: async () => {
      calls += 1;
      if (clock.t < upAt)
        throw prismaErr('P1001', "Can't reach database server");
      return 'ok';
    },
  };
}

describe('outage simulation: database away for 40 s', () => {
  const clockSleep = (clock: { t: number }) => async (ms: number) => {
    clock.t += ms;
  };

  it('retryTransient rides it out without a restart', async () => {
    const clock = { t: 0 };
    const db = flakyDb(40_000, clock);
    const result = await retryTransient(db.query, {
      windowMs: 90_000,
      baseDelayMs: 1_000,
      maxDelayMs: 10_000,
      sleep: clockSleep(clock),
      now: () => clock.t,
    });
    expect(result).toBe('ok');
    expect(db.calls()).toBeGreaterThan(3);
    expect(clock.t).toBeGreaterThanOrEqual(40_000);
  });

  it('gives up (and fails the job) when the outage outlasts the window', async () => {
    const clock = { t: 0 };
    const db = flakyDb(300_000, clock);
    await expect(
      retryTransient(db.query, {
        windowMs: 90_000,
        sleep: clockSleep(clock),
        now: () => clock.t,
      }),
    ).rejects.toMatchObject({ code: 'P1001' });
    expect(clock.t).toBeLessThanOrEqual(90_000);
  });

  it('does not repeat a real error', async () => {
    const fn = jest.fn().mockRejectedValue(prismaErr('P2002'));
    await expect(
      retryTransient(fn, { sleep: async () => undefined }),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('outageProof wraps a BullMQ processor and recovers after the outage', async () => {
    jest.useFakeTimers();
    try {
      const upAt = Date.now() + 40_000;
      const process = jest.fn(async (id: string) => {
        if (Date.now() < upAt) throw new Error('read ECONNRESET');
        return `done ${id}`;
      });
      const run = outageProof(process)('job-1');
      await jest.advanceTimersByTimeAsync(60_000);
      await expect(run).resolves.toBe('done job-1');
    } finally {
      jest.useRealTimers();
    }
  });
});
