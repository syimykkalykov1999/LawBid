import { BillingRunner } from './billing.runner';
import { TRIAL_REMINDER_JOB } from './billing.constants';
import { trialReminderJob } from './trial-reminder';

const DAY = 86_400_000;

function setup(rows: unknown[], notified = false) {
  const prisma = {
    subscription: {
      findMany: jest.fn(() => Promise.resolve(rows)),
    },
    notification: {
      findFirst: jest.fn(() => Promise.resolve(notified ? { id: 'n' } : null)),
    },
  };
  const queue = { addBulk: jest.fn(() => Promise.resolve([])) };
  const notifications = { emit: jest.fn(() => Promise.resolve()) };
  const runner = new BillingRunner(
    { mode: 'worker' },
    { get: () => undefined } as never,
    prisma as never,
    {} as never,
    notifications as never,
  );
  (runner as unknown as { subscriptionsQueue: unknown }).subscriptionsQueue =
    queue;
  return { runner, prisma, queue, notifications };
}

const now = new Date('2026-11-01T12:00:00Z');
const row = (id: string, endsInMs: number) => ({
  id,
  user_id: `u-${id}`,
  trial_started_at: new Date(now.getTime() - 3 * DAY),
  trial_ends_at: new Date(now.getTime() + endsInMs),
  price_cents: 39900,
});

describe('trialReminderJob', () => {
  it('id and delay come from the trial end; null once the time has passed', () => {
    const r = row('a', 5 * DAY);
    const j = trialReminderJob(r, now.getTime());
    expect(j?.delay).toBe(3 * DAY);
    expect(j?.jobId).toBe(`trial-a-${r.trial_ends_at.getTime()}`);
    expect(trialReminderJob(row('b', 1 * DAY), now.getTime())).toBeNull();
    expect(trialReminderJob({ id: 'c', trial_ends_at: null })).toBeNull();
  });
});

describe('BillingRunner.reconcileTrialReminders (S10-6)', () => {
  it('re-adds the delayed reminder of every trialing subscription under the same job id', async () => {
    const r = row('a', 5 * DAY);
    const { runner, queue } = setup([r]);
    const out = await runner.reconcileTrialReminders(now);
    expect(out).toEqual({ scheduled: 1, late: 0 });
    expect(queue.addBulk).toHaveBeenCalledWith([
      expect.objectContaining({
        name: TRIAL_REMINDER_JOB,
        data: { subscriptionId: 'a' },
        opts: expect.objectContaining({
          jobId: `trial-a-${r.trial_ends_at.getTime()}`,
          delay: 3 * DAY,
        }),
      }),
    ]);
  });

  it('sends a reminder the queue never delivered, once', async () => {
    const { runner, notifications } = setup([row('b', 1 * DAY)], false);
    const out = await runner.reconcileTrialReminders(now);
    expect(out.late).toBe(1);
    expect(notifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'subscription_trial_ending',
        recipientId: 'u-b',
      }),
    );
  });

  it('does not send again when the notification already exists', async () => {
    const { runner, notifications } = setup([row('b', 1 * DAY)], true);
    const out = await runner.reconcileTrialReminders(now);
    expect(out.late).toBe(0);
    expect(notifications.emit).not.toHaveBeenCalled();
  });

  it('leaves a reminder alone in the first 30 minutes after its time (the delayed job is about to run)', async () => {
    // reminder time = now - 10 min  => trial ends in 2 days - 10 min
    const { runner, notifications } = setup([row('c', 2 * DAY - 10 * 60_000)]);
    const out = await runner.reconcileTrialReminders(now);
    expect(out.late).toBe(0);
    expect(notifications.emit).not.toHaveBeenCalled();
  });

  it('is a no-op without Redis', async () => {
    const { runner } = setup([]);
    (runner as unknown as { subscriptionsQueue: unknown }).subscriptionsQueue =
      undefined;
    await expect(runner.reconcileTrialReminders(now)).resolves.toEqual({
      scheduled: 0,
      late: 0,
    });
  });
});
