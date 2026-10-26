import { QueueAdminService } from './queue-admin.service';

const queues = new Map<
  string,
  {
    name: string;
    getJobCounts: jest.Mock;
    retryJobs: jest.Mock;
    getJobs: jest.Mock;
    add: jest.Mock;
    close: jest.Mock;
  }
>();
const failedBy: Record<string, number> = {};
let dead: Array<{ data: unknown; remove: jest.Mock }> = [];

jest.mock('bullmq', () => ({
  Queue: jest.fn((name: string) => {
    const q = {
      name,
      getJobCounts: jest.fn(() =>
        Promise.resolve({ failed: failedBy[name] ?? 0 }),
      ),
      retryJobs: jest.fn(() => Promise.resolve()),
      getJobs: jest.fn(() => Promise.resolve(dead)),
      add: jest.fn(() => Promise.resolve({})),
      close: jest.fn(() => Promise.resolve()),
    };
    queues.set(name, q);
    return q;
  }),
}));

function service() {
  return new QueueAdminService(
    { getOrThrow: () => 'redis://x' } as never,
    { setContext: jest.fn(), info: jest.fn() } as never,
  );
}

describe('QueueAdminService.retryFailed (S10-7)', () => {
  beforeEach(() => {
    queues.clear();
    for (const k of Object.keys(failedBy)) delete failedBy[k];
    dead = [];
  });

  it('retries failed jobs of every worker queue, never the cron lanes or the DLQ', async () => {
    failedBy['data-export'] = 2;
    failedBy.cron = 9;
    failedBy['cron-fast'] = 9;
    failedBy['stripe-webhooks-dlq'] = 5;
    const out = await service().retryFailed();
    expect(out.byQueue).toEqual({ 'data-export': 2 });
    expect(out.retried).toBe(2);
    expect(queues.get('data-export')?.retryJobs).toHaveBeenCalledWith({
      state: 'failed',
      count: 2,
    });
    expect(queues.has('cron')).toBe(false);
    expect(queues.has('cron-fast')).toBe(false);
    // every queue handle was closed
    for (const q of queues.values()) expect(q.close).toHaveBeenCalled();
  });

  it('caps one press at 200 per queue', async () => {
    failedBy.push = 5000;
    const out = await service().retryFailed();
    expect(out.byQueue.push).toBe(200);
  });

  it('replays Stripe dead letters as fresh events and clears the DLQ entry', async () => {
    const remove = jest.fn(() => Promise.resolve());
    dead = [
      { data: { eventId: 'evt_1', error: 'x' }, remove },
      { data: { nope: true }, remove: jest.fn() },
    ];
    const out = await service().retryFailed();
    expect(out.stripeReplayed).toBe(1);
    const intake = queues.get('stripe-webhooks');
    expect(intake?.add).toHaveBeenCalledWith(
      'stripe-event',
      { eventId: 'evt_1' },
      expect.objectContaining({
        jobId: expect.stringMatching(/^evt_1-replay-\d+$/),
      }),
    );
    expect(remove).toHaveBeenCalled();
  });
});
