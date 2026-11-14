import {
  unusedShare,
  VerificationLossBillingJob,
} from './verification-loss-billing.job';

describe('unusedShare', () => {
  it('is the part of the amount that was not used, never more than paid', () => {
    expect(unusedShare(39900, 15, 30)).toBe(19950);
    expect(unusedShare(39900, 0, 30)).toBe(0);
    expect(unusedShare(39900, 40, 30)).toBe(39900);
    expect(unusedShare(0, 5, 10)).toBe(0);
    expect(unusedShare(1000, 5, 0)).toBe(0);
  });
});

describe('VerificationLossBillingJob', () => {
  const DAY = 86_400_000;
  // A frozen clock: the unused share must not depend on milliseconds.
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-16T12:00:00Z') });
  });
  afterEach(() => {
    jest.useRealTimers();
  });
  function make(
    opts: {
      enabled?: boolean;
      payments?: Record<string, unknown>[];
      seatInvoices?: string[];
      credit?: { balance: number } | null;
      purchases?: Record<string, unknown>[];
      lost?: string[];
      redis?: unknown;
      numbers?: Record<string, number>;
    } = {},
  ) {
    const now = Date.now();
    const prisma = {
      attorneyProfile: {
        // Batch E: paged by user_id (keyset) — the fake keeps list order.
        findMany: jest.fn(
          (q?: {
            where?: { user_id?: { gt?: string; in?: string[] } };
            take?: number;
          }) => {
            const all = opts.lost ?? ['u1'];
            const gt = q?.where?.user_id?.gt;
            const only = q?.where?.user_id?.in;
            let rows = gt ? all.slice(all.indexOf(gt) + 1) : all;
            if (only) rows = rows.filter((id) => only.includes(id));
            return Promise.resolve(
              rows
                .slice(0, q?.take ?? rows.length)
                .map((user_id) => ({ user_id })),
            );
          },
        ),
      },
      subscription: {
        // 13.11: the set-based pre-check (u1 has a live Stripe subscription).
        findMany: jest.fn().mockResolvedValue([{ user_id: 'u1' }]),
        findUnique: jest.fn().mockResolvedValue({
          stripe_subscription_id: 'sub_1',
          status: 'active',
          current_period_start: new Date(now - 10 * DAY),
          current_period_end: new Date(now + 20 * DAY),
        }),
      },
      payment: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            opts.payments ?? [
              { id: 'pay1', amount_cents: 30000, stripe_invoice_id: 'in_1' },
            ],
          ),
        findUnique: jest.fn().mockResolvedValue({
          id: 'pay1',
          user_id: 'u1',
          amount_cents: 30000,
          stripe_payment_intent_id: 'pi_1',
        }),
      },
      refund: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount_cents: 0 } }),
        create: jest.fn().mockResolvedValue({ id: 'r1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      casePromotion: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      bidCredit: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            opts.credit && opts.credit.balance > 0 ? [{ user_id: 'u1' }] : [],
          ),
        findUnique: jest.fn().mockResolvedValue(opts.credit ?? null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      bidPackPurchase: {
        findMany: jest.fn().mockResolvedValue(opts.purchases ?? []),
      },
      assistantSeatChange: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            (opts.seatInvoices ?? []).map((i) => ({ stripe_invoice_id: i })),
          ),
      },
    };
    const provider = {
      name: 'stripe',
      cancelNow: jest.fn().mockResolvedValue({ id: 'sub_1' }),
      refund: jest.fn().mockResolvedValue({
        id: 're_1',
        status: 'succeeded',
        failureReason: null,
      }),
    };
    const sync = { apply: jest.fn().mockResolvedValue(null) };
    const settings = {
      boolean: jest.fn().mockResolvedValue(opts.enabled ?? true),
      number: jest.fn((k: string) =>
        Promise.resolve(
          {
            'billing.verification_loss_overlap_minutes': 15,
            'billing.verification_loss_full_scan_hours': 6,
            ...opts.numbers,
          }[k] ?? 0,
        ),
      ),
    };
    const logger = { setContext: jest.fn(), info: jest.fn(), error: jest.fn() };
    const job = new VerificationLossBillingJob(
      prisma as never,
      settings as never,
      sync as never,
      provider as never,
      logger as never,
      opts.redis as never,
    );
    return { job, prisma, provider, sync };
  }

  it('cancels the subscription now and refunds the unused two thirds of the period', async () => {
    const { job, provider, sync } = make();
    const out = await job.run();
    expect(provider.cancelNow).toHaveBeenCalledWith('sub_1');
    expect(sync.apply).toHaveBeenCalled();
    expect(provider.refund).toHaveBeenCalledWith(
      expect.objectContaining({ paymentIntentId: 'pi_1', amountCents: 20000 }),
    );
    expect(out).toMatchObject({
      attorneys: 1,
      subscriptionsCanceled: 1,
      refundedCents: 20000,
    });
  });

  it('reads per attorney only those with something to stop, in set-based batches (13.11, 1B load test)', async () => {
    // 2 001 lost attorneys; only u1 (a live subscription) has anything.
    const lost = [...Array.from({ length: 2000 }, (_, i) => `idle-${i}`), 'u1'];
    const { job, prisma, provider } = make({ lost });
    const out = await job.run();
    // Three reads per 1 000 attorneys, not four per attorney.
    expect(prisma.subscription.findMany).toHaveBeenCalledTimes(3);
    expect(prisma.bidCredit.findMany).toHaveBeenCalledTimes(3);
    expect(prisma.subscription.findMany.mock.calls[0][0]).toEqual({
      where: {
        user_id: { in: lost.slice(0, 1000) },
        stripe_subscription_id: { not: null },
        status: { in: ['active', 'trialing', 'past_due'] },
      },
      select: { user_id: true },
    });
    expect(prisma.casePromotion.findMany.mock.calls[0][0].where).toEqual({
      user_id: { in: lost.slice(0, 1000) },
      status: { in: ['active', 'paused', 'pending_review'] },
    });
    expect(prisma.bidCredit.findMany.mock.calls[0][0].where).toEqual({
      user_id: { in: lost.slice(0, 1000) },
      balance: { gt: 0 },
    });
    expect(prisma.subscription.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.bidCredit.findUnique).toHaveBeenCalledTimes(1);
    expect(provider.cancelNow).toHaveBeenCalledTimes(1);
    expect(out.attorneys).toBe(1);
  });

  it('does nothing when switched off', async () => {
    const { job, provider } = make({ enabled: false });
    expect((await job.run()).attorneys).toBe(0);
    expect(provider.cancelNow).not.toHaveBeenCalled();
  });
  it('MONEY M-1: the base is the last renewal, not a seat-purchase invoice', async () => {
    const { job, provider } = make({
      payments: [
        { id: 'seat', amount_cents: 3000, stripe_invoice_id: 'in_seat' },
        { id: 'pay1', amount_cents: 30000, stripe_invoice_id: 'in_1' },
      ],
      seatInvoices: ['in_seat'],
    });
    await job.run();
    expect(provider.refund).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 20000 }),
    );
  });

  it('MONEY M-1: offers spent meanwhile never push the balance below zero', async () => {
    const { job, prisma } = make({
      credit: { balance: 5 },
      purchases: [
        { id: 'bp1', bids: 10, price_cents: 1500, payment_id: 'pay1' },
      ],
    });
    await job.run();
    expect(prisma.bidCredit.updateMany).toHaveBeenNthCalledWith(1, {
      where: { user_id: 'u1', balance: { gte: 5 } },
      data: { balance: { decrement: 5 } },
    });
    // The guarded decrement found less (count 0): the rest is zeroed.
    expect(prisma.bidCredit.updateMany).toHaveBeenNthCalledWith(2, {
      where: { user_id: 'u1', balance: { gt: 0 } },
      data: { balance: 0 },
    });
  });

  // Batch E (14.11): the rejected / suspended list only grows; every 10
  // minutes the job read all of it. Now only rows changed since the last
  // run (watermark), the whole list once per full-scan period.
  describe('watermark', () => {
    function memRedis() {
      const kv = new Map<string, string>();
      return {
        kv,
        get: jest.fn((k: string) => Promise.resolve(kv.get(k) ?? null)),
        set: jest.fn((k: string, v: string) => {
          kv.set(k, v);
          return Promise.resolve('OK');
        }),
      };
    }
    const whereOf = (call: unknown[]) =>
      (call[0] as { where: Record<string, unknown> }).where;

    it('the first run reads the whole list; the next only what changed since it (minus the overlap)', async () => {
      const redis = memRedis();
      const { job, prisma } = make({ redis });
      const first = Date.now();
      await job.run();
      expect(whereOf(prisma.attorneyProfile.findMany.mock.calls[0])).toEqual({
        verification_status: { in: ['rejected', 'suspended'] },
      });
      jest.setSystemTime(first + 10 * 60_000);
      await job.run();
      expect(whereOf(prisma.attorneyProfile.findMany.mock.calls[1])).toEqual({
        verification_status: { in: ['rejected', 'suspended'] },
        updated_at: { gte: new Date(first - 15 * 60_000) },
      });
    });

    it('the whole list again once the full-scan period passed', async () => {
      const redis = memRedis();
      const { job, prisma } = make({ redis });
      const first = Date.now();
      await job.run();
      jest.setSystemTime(first + 6 * 3_600_000);
      await job.run();
      expect(whereOf(prisma.attorneyProfile.findMany.mock.calls[1])).toEqual({
        verification_status: { in: ['rejected', 'suspended'] },
      });
    });

    it('full-scan period 0 = the whole list every run (old behaviour)', async () => {
      const redis = memRedis();
      const { job, prisma } = make({
        redis,
        numbers: { 'billing.verification_loss_full_scan_hours': 0 },
      });
      await job.run();
      await job.run();
      expect(
        whereOf(prisma.attorneyProfile.findMany.mock.calls[1]).updated_at,
      ).toBeUndefined();
    });

    it('an attorney whose handling failed is tried again next run even if unchanged', async () => {
      const redis = memRedis();
      const { job, prisma, provider } = make({ redis });
      provider.cancelNow.mockRejectedValueOnce(new Error('stripe down'));
      await job.run();
      // second run: u1 did not change, the changed-rows read finds nobody
      prisma.attorneyProfile.findMany.mockResolvedValueOnce([]);
      jest.setSystemTime(Date.now() + 10 * 60_000);
      await job.run();
      expect(provider.cancelNow).toHaveBeenCalledTimes(2);
    });

    it('reads the list in pages (never the whole list at once)', async () => {
      const ids = Array.from(
        { length: 1500 },
        (_, i) => `u${String(i).padStart(4, '0')}`,
      );
      const { job, prisma } = make({ lost: [] });
      prisma.attorneyProfile.findMany
        .mockResolvedValueOnce(
          ids.slice(0, 1000).map((user_id) => ({ user_id })),
        )
        .mockResolvedValueOnce(ids.slice(1000).map((user_id) => ({ user_id })));
      await job.run();
      const calls = prisma.attorneyProfile.findMany.mock.calls as [
        { take: number; where: { user_id?: { gt: string } } },
      ][];
      expect(calls).toHaveLength(2);
      expect(calls[0][0].take).toBe(1000);
      expect(calls[1][0].where.user_id).toEqual({ gt: 'u0999' });
    });

    it('the changed-rows read pages by (updated_at, user_id), the order its index serves', async () => {
      const redis = memRedis();
      const { job, prisma } = make({ redis });
      await job.run(); // full read, sets the mark
      const at = new Date();
      const page = Array.from({ length: 1000 }, (_, i) => ({
        user_id: `c${String(i).padStart(4, '0')}`,
        updated_at: at,
      }));
      prisma.attorneyProfile.findMany
        .mockResolvedValueOnce(page)
        .mockResolvedValueOnce([]);
      jest.setSystemTime(Date.now() + 10 * 60_000);
      await job.run();
      const calls = prisma.attorneyProfile.findMany.mock.calls as [
        { orderBy: unknown; where: Record<string, unknown> },
      ][];
      expect(calls[1][0].orderBy).toEqual([
        { updated_at: 'asc' },
        { user_id: 'asc' },
      ]);
      expect(calls[2][0].where.OR).toEqual([
        { updated_at: { gt: at } },
        { updated_at: at, user_id: { gt: 'c0999' } },
      ]);
    });
  });
});
