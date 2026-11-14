import { CircuitOpenError } from './resilience';
import { outageProof } from '../queues/queue-hardening';
import {
  isTransientInfraError,
  isDatabaseOutageError,
  isUnreachableBeforeSend,
  retryTransient,
  sqlStateOf,
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
    expect(isUnreachableBeforeSend(new Error('connect ECONNREFUSED'))).toBe(
      true,
    );
    // P1001 may also mean a connection that dropped mid-query.
    expect(isUnreachableBeforeSend(prismaErr('P1001'))).toBe(false);
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
    query: () => {
      calls += 1;
      if (clock.t < upAt)
        return Promise.reject(
          prismaErr('P1001', "Can't reach database server"),
        );
      return Promise.resolve('ok');
    },
  };
}

describe('outage simulation: database away for 40 s', () => {
  const clockSleep = (clock: { t: number }) => (ms: number) => {
    clock.t += ms;
    return Promise.resolve();
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
      retryTransient(fn, { sleep: () => Promise.resolve() }),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('outageProof wraps a BullMQ processor and recovers after the outage', async () => {
    jest.useFakeTimers();
    try {
      const upAt = Date.now() + 40_000;
      const process = jest.fn((id: string) => {
        if (Date.now() < upAt) return Promise.reject(prismaErr('P1017'));
        return Promise.resolve(`done ${id}`);
      });
      const run = outageProof(process)('job-1');
      await jest.advanceTimersByTimeAsync(60_000);
      await expect(run).resolves.toBe('done job-1');
      // A partner call timing out is NOT repeated (its side effect may exist).
      const push = jest.fn().mockRejectedValue(new Error('read ECONNRESET'));
      await expect(outageProof(push)()).rejects.toThrow('ECONNRESET');
      expect(push).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('isDatabaseOutageError (whole-job retries)', () => {
  it('matches a database outage only', () => {
    expect(isDatabaseOutageError(prismaErr('P1017'))).toBe(true);
    expect(isDatabaseOutageError(prismaErr('57P01'))).toBe(true);
    expect(
      isDatabaseOutageError(
        Object.assign(new Error('x'), {
          name: 'CircuitOpenError',
          service: 'database#1',
        }),
      ),
    ).toBe(true);
  });

  it.each([
    new Error('read ECONNRESET'), // FCM / Stripe / SES call: side effect unknown
    new Error('Connection is closed.'), // Redis: the job lock goes with it
    new Error('Command timed out'),
    Object.assign(new Error('x'), {
      name: 'CircuitOpenError',
      service: 'stripe',
    }),
    prismaErr('P2002'),
  ])('does not match %p', (e) => expect(isDatabaseOutageError(e)).toBe(false));
});

describe('Prisma 7 (driver adapter) error shapes, measured 13.11', () => {
  // Unreachable database: the OS code is in `code`, the message is empty.
  const refused = Object.assign(new Error(''), { code: 'ECONNREFUSED' });
  // node-pg pool: no free connection within connectionTimeoutMillis.
  const poolTimeout = new Error('timeout exceeded when trying to connect');
  // Failover: a raw query fails with the SQLSTATE nested in the adapter error.
  const shutdown = Object.assign(new Error('Raw query failed'), {
    code: 'P2010',
    meta: { driverAdapterError: { cause: { originalCode: '57P01' } } },
  });
  // A failed COMMIT, passed through unwrapped.
  const commit = Object.assign(new Error('TransactionWriteConflict'), {
    name: 'DriverAdapterError',
    cause: { originalCode: '40001', kind: 'TransactionWriteConflict' },
  });

  it('transient: refused connection, pool timeout, nested shutdown state', () => {
    expect(isTransientInfraError(refused)).toBe(true);
    expect(isTransientInfraError(poolTimeout)).toBe(true);
    expect(isTransientInfraError(shutdown)).toBe(true);
    expect(isDatabaseOutageError(refused)).toBe(true);
    expect(isDatabaseOutageError(poolTimeout)).toBe(true);
    expect(isDatabaseOutageError(shutdown)).toBe(true);
  });

  it('a refused connection never left the process (safe to repeat a write)', () => {
    expect(isUnreachableBeforeSend(refused)).toBe(true);
    expect(isUnreachableBeforeSend(poolTimeout)).toBe(false);
  });

  it('sqlStateOf reads Prisma 6 meta.code, Prisma 7 nested and unwrapped shapes', () => {
    expect(sqlStateOf({ code: 'P2010', meta: { code: '23505' } })).toBe(
      '23505',
    );
    expect(sqlStateOf(shutdown)).toBe('57P01');
    expect(sqlStateOf(commit)).toBe('40001');
    expect(sqlStateOf(new Error('x'))).toBeUndefined();
  });
});
