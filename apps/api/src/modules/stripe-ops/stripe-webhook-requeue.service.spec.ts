import { STRIPE_WEBHOOK_JOB } from '../billing/billing.constants';
import { StripeWebhookRequeueService } from './stripe-webhook-requeue.service';

function make(
  rows: string[],
  live: Record<string, 'active' | 'failed' | undefined> = {},
) {
  const prisma = {
    stripeWebhookEvent: {
      findMany: jest.fn(() =>
        Promise.resolve(rows.map((id) => ({ stripe_event_id: id }))),
      ),
    },
  };
  const queue = {
    add: jest.fn(() => Promise.resolve({})),
    getJob: jest.fn((id: string) =>
      Promise.resolve(
        live[id]
          ? { getState: () => Promise.resolve(live[id]), remove: jest.fn() }
          : null,
      ),
    ),
    close: jest.fn(),
  };
  const svc = new StripeWebhookRequeueService(
    prisma as never,
    {
      get: () => undefined,
    } as never,
  );
  svc.queue = queue as never;
  return { svc, prisma, queue };
}

describe('StripeWebhookRequeueService.sweep', () => {
  it('queues stored unprocessed events older than 2 minutes, jobId = event id', async () => {
    const now = new Date('2026-10-25T12:00:00Z');
    const h = make(['evt_a', 'evt_b']);
    expect(await h.svc.sweep(now)).toEqual({ found: 2, requeued: 2 });
    const where = (
      h.prisma.stripeWebhookEvent.findMany.mock.calls[0] as unknown as [
        { where: { processed_at: null; created_at: { lt: Date } } },
      ]
    )[0].where;
    expect(where.processed_at).toBeNull();
    expect(where.created_at.lt.toISOString()).toBe('2026-10-25T11:58:00.000Z');
    expect(h.queue.add).toHaveBeenCalledWith(
      STRIPE_WEBHOOK_JOB,
      { eventId: 'evt_a' },
      expect.objectContaining({ jobId: 'evt_a' }),
    );
  });

  it('leaves events that still have a live job alone', async () => {
    const h = make(['evt_a', 'evt_b'], { evt_a: 'active' });
    expect(await h.svc.sweep()).toEqual({ found: 2, requeued: 1 });
    expect(h.queue.add).toHaveBeenCalledTimes(1);
  });

  it('never touches a failed job (the DLQ owns it)', async () => {
    const h = make(['evt_f'], { evt_f: 'failed' });
    expect(await h.svc.sweep()).toEqual({ found: 1, requeued: 0 });
    expect(h.queue.add).not.toHaveBeenCalled();
  });

  it('does nothing without Redis', async () => {
    const h = make(['evt_a']);
    h.svc.queue = undefined;
    expect(await h.svc.sweep()).toEqual({ found: 0, requeued: 0 });
  });
});
