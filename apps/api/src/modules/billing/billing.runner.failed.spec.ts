import { BillingRunner } from './billing.runner';
import { STRIPE_WEBHOOKS_QUEUE, TRIAL_REMINDER_JOB } from './billing.constants';

/** Verify batch 13 (Q2, Q4): failed billing jobs are not lost. */
function setup(rows: unknown[] = []) {
  const prisma = {
    subscription: { findMany: jest.fn(() => Promise.resolve(rows)) },
    notification: { findFirst: jest.fn(() => Promise.resolve(null)) },
  };
  const dlq = { add: jest.fn(() => Promise.resolve()) };
  const queue = {
    addBulk: jest.fn<Promise<unknown[]>, [unknown[]]>(() =>
      Promise.resolve([]),
    ),
  };
  const runner = new BillingRunner(
    { mode: 'worker' },
    { get: () => undefined } as never,
    prisma as never,
    {} as never,
    { emit: jest.fn(() => Promise.resolve()) } as never,
  );
  Object.assign(runner, { dlq, subscriptionsQueue: queue });
  return { runner, dlq, queue };
}

const stalled = new Error('job stalled more than allowable limit');
const job = (attemptsMade: number) =>
  ({
    id: 'evt_1',
    data: { eventId: 'evt_1' },
    attemptsMade,
    opts: { attempts: 5 },
  }) as never;

describe('BillingRunner failed jobs (verify batch 13)', () => {
  it('Q2: a webhook job failed by stalling (no attempt used) goes to the DLQ', async () => {
    const { runner, dlq } = setup();
    await runner.onFailed(STRIPE_WEBHOOKS_QUEUE, job(1), stalled);
    expect(dlq.add).toHaveBeenCalledWith(
      'dead',
      expect.objectContaining({ eventId: 'evt_1' }),
      expect.objectContaining({ jobId: 'evt_1' }),
    );
  });

  it('Q2: an ordinary failed attempt does not (the processor owns the last-attempt DLQ)', async () => {
    const { runner, dlq } = setup();
    await runner.onFailed(STRIPE_WEBHOOKS_QUEUE, job(1), new Error('boom'));
    await runner.onFailed('subscription-jobs', job(1), stalled);
    expect(dlq.add).not.toHaveBeenCalled();
  });

  it('Q4: a trial reminder job retries a passing error instead of failing for good', async () => {
    const now = new Date();
    const { runner, queue } = setup([
      {
        id: 's1',
        user_id: 'u1',
        trial_started_at: now,
        trial_ends_at: new Date(now.getTime() + 5 * 86_400_000),
        price_cents: 100,
      },
    ]);
    await (
      runner as unknown as { reconcileTrialReminders(): Promise<unknown> }
    ).reconcileTrialReminders();
    const [jobs] = queue.addBulk.mock.calls[0] as [
      Array<{ name: string; opts: { attempts?: number; backoff?: unknown } }>,
    ];
    expect(jobs[0].name).toBe(TRIAL_REMINDER_JOB);
    expect(jobs[0].opts.attempts).toBeGreaterThan(1);
    expect(jobs[0].opts.backoff).toBeDefined();
  });
});
