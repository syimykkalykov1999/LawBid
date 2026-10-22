import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  HANDLED_STRIPE_EVENTS,
  STRIPE_WEBHOOK_JOB,
  WEBHOOK_JOB_OPTS,
} from './billing.constants';
import { WebhookSignatureError } from './payment-provider';
import { StripeWebhookIntakeService } from './stripe-webhook.intake';

/**
 * Owner 2026-10-22 (audit #4 §10): the Stripe webhook intake — the
 * signature is checked before anything is stored, a replayed event id is
 * stored once and never queued twice, every handled type is queued with
 * jobId = event id, an unhandled type is stored as processed.
 */
function make(opts: { type?: string; duplicate?: boolean; badSig?: boolean }) {
  const event = {
    id: 'evt_1',
    type: opts.type ?? 'invoice.paid',
    object: { id: 'in_1' },
  };
  const provider = {
    refresh: jest.fn(() => Promise.resolve()),
    constructWebhookEvent: jest.fn(() => {
      if (opts.badSig) throw new WebhookSignatureError('bad signature');
      return event;
    }),
  };
  const prisma = {
    stripeWebhookEvent: {
      create: jest.fn(() =>
        opts.duplicate
          ? Promise.reject(
              new Prisma.PrismaClientKnownRequestError('unique', {
                code: 'P2002',
                clientVersion: 'test',
              }),
            )
          : Promise.resolve({}),
      ),
      update: jest.fn(() => Promise.resolve({})),
    },
  };
  const queue = { add: jest.fn(() => Promise.resolve({})) };
  const svc = new StripeWebhookIntakeService(
    prisma as never,
    provider as never,
    { get: () => undefined } as unknown as ConfigService,
  );
  (svc as unknown as { queue: typeof queue }).queue = queue;
  return { svc, provider, prisma, queue, event };
}

describe('StripeWebhookIntakeService.receive', () => {
  it('refuses a bad signature before storing anything', async () => {
    const h = make({ badSig: true });
    await expect(
      h.svc.receive(Buffer.from('{}'), 't=1,v1=bad'),
    ).rejects.toBeInstanceOf(WebhookSignatureError);
    expect(h.prisma.stripeWebhookEvent.create).not.toHaveBeenCalled();
    expect(h.queue.add).not.toHaveBeenCalled();
  });

  it('passes the raw body, the signature and the Connect switch to the provider (fresh keys)', async () => {
    const h = make({});
    const body = Buffer.from('{"id":"evt_1"}');
    await h.svc.receive(body, 'sig', { connect: true });
    expect(h.provider.refresh).toHaveBeenCalled();
    expect(h.provider.constructWebhookEvent).toHaveBeenCalledWith(body, 'sig', {
      connect: true,
    });
  });

  it('a replayed event id is ignored (stored once, queued once)', async () => {
    const h = make({ duplicate: true });
    expect(await h.svc.receive(Buffer.from('{}'), 'sig')).toBe(false);
    expect(h.queue.add).not.toHaveBeenCalled();
  });

  it('other database errors are not swallowed (Stripe retries)', async () => {
    const h = make({});
    h.prisma.stripeWebhookEvent.create.mockImplementationOnce(() =>
      Promise.reject(new Error('db down')),
    );
    await expect(h.svc.receive(Buffer.from('{}'), 'sig')).rejects.toThrow(
      'db down',
    );
  });

  it.each([...HANDLED_STRIPE_EVENTS])(
    'stores and queues a handled %s with jobId = event id',
    async (type) => {
      const h = make({ type });
      expect(await h.svc.receive(Buffer.from('{}'), 'sig')).toBe(true);
      expect(h.prisma.stripeWebhookEvent.create).toHaveBeenCalledWith({
        data: {
          stripe_event_id: 'evt_1',
          type,
          payload: { id: 'in_1' },
        },
      });
      expect(h.queue.add).toHaveBeenCalledWith(
        STRIPE_WEBHOOK_JOB,
        { eventId: 'evt_1' },
        { ...WEBHOOK_JOB_OPTS, jobId: 'evt_1' },
      );
      expect(h.prisma.stripeWebhookEvent.update).not.toHaveBeenCalled();
    },
  );

  it('an unhandled type is stored as processed and not queued', async () => {
    const h = make({ type: 'customer.created' });
    expect(await h.svc.receive(Buffer.from('{}'), 'sig')).toBe(false);
    expect(h.prisma.stripeWebhookEvent.update).toHaveBeenCalledWith({
      where: { stripe_event_id: 'evt_1' },
      data: { processed_at: expect.any(Date) },
    });
    expect(h.queue.add).not.toHaveBeenCalled();
  });

  it('without Redis a handled event fails loudly (Stripe retries)', async () => {
    const h = make({});
    (h.svc as unknown as { queue?: unknown }).queue = undefined;
    await expect(h.svc.receive(Buffer.from('{}'), 'sig')).rejects.toThrow(
      /queue is not available/,
    );
  });
});
