import { STRIPE_WEBHOOK_JOB } from '../billing/billing.constants';
import { StripeWebhookRequeueService } from './stripe-webhook-requeue.service';

function make(
  rows: string[],
  live: Record<string, 'active' | 'failed' | undefined> = {},
) {
  const prisma = {
    stripeWebhookEvent: {
      findMany: jest.fn(() =>
        Promise.resolve(
          rows.map((id) => ({
            stripe_event_id: id,
            created_at: new Date('2026-10-25T10:00:00Z'),
          })),
        ),
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
  it('walks the unprocessed rows by keyset pages, never more than 1 000 a run', async () => {
    const page = Array.from({ length: 200 }, (_, i) => ({
      stripe_event_id: `evt_${String(i).padStart(3, '0')}`,
      created_at: new Date('2026-10-25T10:00:00Z'),
    }));
    const h = make([]);
    h.prisma.stripeWebhookEvent.findMany = jest
      .fn()
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce(page.slice(0, 3)) as never;
    const r = await h.svc.sweep(new Date('2026-10-25T12:00:00Z'));
    expect(r.found).toBe(203);
    const calls = (h.prisma.stripeWebhookEvent.findMany as unknown as jest.Mock)
      .mock.calls as [{ where: { OR?: unknown[] }; orderBy: unknown }][];
    expect(calls).toHaveLength(2);
    expect(calls[0][0].where.OR).toBeUndefined();
    expect(calls[1][0].where.OR).toEqual([
      { created_at: { gt: page[199].created_at } },
      { created_at: page[199].created_at, stripe_event_id: { gt: 'evt_199' } },
    ]);
    expect(calls[0][0].orderBy).toEqual([
      { created_at: 'asc' },
      { stripe_event_id: 'asc' },
    ]);

    const always = make([]);
    always.prisma.stripeWebhookEvent.findMany = jest
      .fn()
      .mockResolvedValue(page) as never;
    expect((await always.svc.sweep()).found).toBe(1000);
  });

  it('pack C (round 2 #13): past 1 000 dead events a newly lost one is still reached', async () => {
    // 1 500 dead events (their failed job sits in the DLQ) and, newest, one
    // event whose job Redis lost.
    const at = (i: number) => new Date(Date.UTC(2026, 9, 1) + i * 1000);
    const db = [
      ...Array.from({ length: 1500 }, (_, i) => ({
        stripe_event_id: `evt_dead_${String(i).padStart(4, '0')}`,
        created_at: at(i),
      })),
      { stripe_event_id: 'evt_lost', created_at: at(2000) },
    ];
    type Where = {
      OR?: [
        { created_at: { gt: Date } },
        { created_at: Date; stripe_event_id: { gt: string } },
      ];
    };
    const findMany = jest.fn((q: { where: Where; take: number }) => {
      const k = q.where.OR;
      const rows = db.filter(
        (r) =>
          !k ||
          r.created_at > k[0].created_at.gt ||
          (r.created_at.getTime() === k[1].created_at.getTime() &&
            r.stripe_event_id > k[1].stripe_event_id.gt),
      );
      return Promise.resolve(rows.slice(0, q.take));
    });
    const queue = {
      add: jest.fn(() => Promise.resolve({})),
      // Every dead event still has its failed job; the lost one has none.
      getJob: jest.fn((id: string) =>
        Promise.resolve(id === 'evt_lost' ? null : { id }),
      ),
      close: jest.fn(),
    };
    const svc = new StripeWebhookRequeueService(
      { stripeWebhookEvent: { findMany } } as never,
      { get: () => undefined } as never,
    );
    svc.queue = queue as never;
    const now = new Date(Date.UTC(2026, 9, 2));
    expect(await svc.sweep(now)).toEqual({ found: 1000, requeued: 0 });
    // The next run goes on where the last one stopped and reaches it.
    expect(await svc.sweep(now)).toEqual({ found: 501, requeued: 1 });
    expect(queue.add).toHaveBeenCalledWith(
      STRIPE_WEBHOOK_JOB,
      { eventId: 'evt_lost' },
      expect.objectContaining({ jobId: 'evt_lost' }),
    );
    // Reached the end: the run after starts from the oldest row again.
    findMany.mockClear();
    await svc.sweep(now);
    expect(findMany.mock.calls[0][0].where.OR).toBeUndefined();
  });
});
