import { ConflictException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type { ProviderSeatCharge } from './payment-provider';
import { SeatsService } from './seats.service';

/**
 * Owner 2026-10-22 — seats like Slack: a bought seat is charged now (the
 * prorated rest of the period, `always_invoice` + `pending_if_incomplete`)
 * and written only once paid; a removed seat stays until the period end
 * (Stripe quantity lowered with `none`, `assistant_seats` kept); seats are
 * bought only after the first paid period.
 */
describe('SeatsService', () => {
  const user = { sub: 'att-1', role: 'attorney' } as never;
  const periodEnd = new Date(Date.now() + 15 * 86_400_000);

  type Row = {
    id: string;
    user_id: string;
    status: string;
    stripe_subscription_id: string | null;
    assistant_seats: number;
    price_cents: number;
    plan: string;
    current_period_end: Date | null;
    trial_ends_at: Date | null;
  };

  function setup(
    opts: {
      row?: Partial<Row>;
      payments?: number;
      live?: number;
      scheduled?: {
        id: string;
        to_seats: number;
        effective_at: Date;
      } | null;
      charge?: Partial<ProviderSeatCharge>;
      included?: number;
      max?: number;
    } = {},
  ) {
    const row: Row = {
      id: 'sub-row',
      user_id: 'att-1',
      status: 'active',
      stripe_subscription_id: 'sub_1',
      assistant_seats: 1,
      price_cents: 49_900,
      plan: 'monthly',
      current_period_end: periodEnd,
      trial_ends_at: null,
      ...opts.row,
    };
    const changes: Record<string, unknown>[] = [];
    let scheduled = opts.scheduled ?? null;
    const prisma = {
      subscription: {
        findUnique: jest.fn().mockResolvedValue(row),
        update: jest.fn(({ data }: { data: Partial<Row> }) => {
          Object.assign(row, data);
          return Promise.resolve(row);
        }),
      },
      payment: { count: jest.fn().mockResolvedValue(opts.payments ?? 1) },
      assistantMembership: {
        count: jest.fn().mockResolvedValue(opts.live ?? 0),
      },
      assistantSeatChange: {
        findFirst: jest.fn(
          ({ where }: { where: { effective_at?: { lte: Date } } }) => {
            if (!scheduled) return Promise.resolve(null);
            if (where.effective_at && scheduled.effective_at > new Date())
              return Promise.resolve(null);
            return Promise.resolve(scheduled);
          },
        ),
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          const c = { id: `chg-${changes.length + 1}`, ...data };
          changes.push(c);
          return Promise.resolve(c);
        }),
        update: jest.fn(
          ({
            where,
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            if (scheduled && where.id === scheduled.id && data.status) {
              scheduled = null;
            }
            const c = { id: where.id, ...data };
            changes.push(c);
            return Promise.resolve(c);
          },
        ),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const provider = {
      previewSeatIncrease: jest.fn().mockResolvedValue({
        amountNowCents: 5_000,
        currency: 'usd',
        prorationDate: 0,
        periodEnd: Math.floor(periodEnd.getTime() / 1000),
      }),
      chargeSeatIncrease: jest.fn().mockResolvedValue({
        status: 'applied',
        invoiceId: 'in_1',
        amountCents: 5_000,
        currency: 'usd',
        clientSecret: null,
        subscription: {},
        ...opts.charge,
      }),
      setSeatQuantity: jest.fn().mockResolvedValue({}),
    };
    const pricing = {
      requirePriceId: jest.fn().mockResolvedValue('price_seat'),
      knownPriceIds: jest.fn().mockResolvedValue(['price_seat_old']),
      amountOf: jest.fn().mockResolvedValue(10_000),
      amount: jest.fn().mockResolvedValue(10_000),
    };
    const entitlements = {
      forUser: jest.fn().mockResolvedValue({
        values: {},
        planCode: null,
        seats: {
          included: opts.included ?? 0,
          extra: row.assistant_seats,
          total: row.assistant_seats,
          max: opts.max ?? 6,
        },
      }),
      invalidateUser: jest.fn().mockResolvedValue(undefined),
    };
    const subscriptions = {
      assertVerifiedAttorney: jest.fn().mockResolvedValue({ email: null }),
      me: jest.fn().mockResolvedValue({ isActive: true }),
    };
    const svc = new SeatsService(
      prisma as never,
      provider as never,
      pricing as never,
      entitlements as never,
      subscriptions as never,
    );
    return { svc, row, prisma, provider, changes, entitlements };
  }

  const code = (e: unknown) =>
    ((e as ConflictException).getResponse() as { code: string }).code;

  describe('preview', () => {
    it('asks Stripe for the price of the added seats now', async () => {
      const { svc, provider } = setup();
      const p = await svc.preview(user, 3);
      expect(provider.previewSeatIncrease).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionId: 'sub_1',
          seatPriceId: 'price_seat',
          knownSeatPriceIds: ['price_seat_old'],
          addSeats: 2,
        }),
      );
      expect(p).toMatchObject({
        seats: 3,
        currentSeats: 1,
        amountNowCents: 5_000,
        seatCents: 10_000,
        monthlyIncreaseCents: 20_000,
        nextChargeCents: 69_900,
        periodEnd: new Date(
          Math.floor(periodEnd.getTime() / 1000) * 1000,
        ).toISOString(),
      });
      expect(p.prorationDate).toBeGreaterThan(0);
    });

    it('nothing to pay now for fewer seats', async () => {
      const { svc, provider } = setup();
      const p = await svc.preview(user, 0);
      expect(p.amountNowCents).toBe(0);
      expect(provider.previewSeatIncrease).not.toHaveBeenCalled();
    });

    it('refuses during a trial (owner rule 3)', async () => {
      const { svc } = setup({ row: { status: 'trialing' } });
      const e = await svc.preview(user, 2).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(ConflictException);
      expect(code(e)).toBe(ErrorCode.SEATS_TRIAL_NOT_ALLOWED);
    });

    it('refuses before the first real payment', async () => {
      const { svc } = setup({ payments: 0 });
      const e = await svc.preview(user, 2).catch((x: unknown) => x);
      expect(code(e)).toBe(ErrorCode.SEATS_NOT_PAID_YET);
    });
  });

  describe('more seats', () => {
    it('applied: charged now, seats and price written, change paid', async () => {
      const { svc, row, provider, changes, entitlements } = setup();
      const at = Math.floor(Date.now() / 1000) - 30;
      const r = await svc.set(user, 3, at);
      expect(provider.chargeSeatIncrease).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionId: 'sub_1',
          quantity: 3,
          prorationDate: at,
        }),
      );
      expect(r.status).toBe('applied');
      expect(row.assistant_seats).toBe(3);
      expect(row.price_cents).toBe(69_900);
      expect(changes[0]).toMatchObject({
        from_seats: 1,
        to_seats: 3,
        stripe_invoice_id: 'in_1',
        amount_cents: 5_000,
        status: 'paid',
      });
      expect(entitlements.invalidateUser).toHaveBeenCalledWith('att-1');
    });

    it('requires_action: 3-D Secure secret back, nothing written yet', async () => {
      const { svc, row, changes } = setup({
        charge: { status: 'requires_action', clientSecret: 'pi_secret' },
      });
      const r = await svc.set(user, 2);
      expect(r).toMatchObject({
        status: 'requires_action',
        clientSecret: 'pi_secret',
      });
      expect(row.assistant_seats).toBe(1);
      expect(changes[0]).toMatchObject({ status: 'pending' });
    });

    it('failed: declined card changes nothing', async () => {
      const { svc, row, changes } = setup({ charge: { status: 'failed' } });
      const r = await svc.set(user, 2);
      expect(r.status).toBe('failed');
      expect(row.assistant_seats).toBe(1);
      expect(changes[0]).toMatchObject({ status: 'failed' });
    });

    it('refuses a stale preview price', async () => {
      const { svc, provider } = setup();
      const old = Math.floor(Date.now() / 1000) - 2 * 3600;
      const e = await svc.set(user, 2, old).catch((x: unknown) => x);
      expect(code(e)).toBe(ErrorCode.SEATS_PREVIEW_STALE);
      expect(provider.chargeSeatIncrease).not.toHaveBeenCalled();
    });

    it('refuses during a trial', async () => {
      const { svc, provider } = setup({ row: { status: 'trialing' } });
      const e = await svc.set(user, 2).catch((x: unknown) => x);
      expect(code(e)).toBe(ErrorCode.SEATS_TRIAL_NOT_ALLOWED);
      expect(provider.chargeSeatIncrease).not.toHaveBeenCalled();
    });

    it('a waiting removal is undone free before the charge', async () => {
      const { svc, provider, changes } = setup({
        row: { assistant_seats: 2 },
        scheduled: { id: 'sch-1', to_seats: 0, effective_at: periodEnd },
      });
      await svc.set(user, 3);
      expect(provider.setSeatQuantity).toHaveBeenCalledWith(
        'sub_1',
        'price_seat',
        2,
        expect.any(Array),
        'none',
      );
      expect(changes[0]).toMatchObject({ id: 'sch-1', status: 'canceled' });
      expect(provider.chargeSeatIncrease).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 3 }),
      );
    });
  });

  describe('fewer seats', () => {
    it('scheduled for the period end: no refund, seats kept until then', async () => {
      const { svc, row, provider, changes } = setup({
        row: { assistant_seats: 3 },
      });
      const r = await svc.set(user, 1);
      expect(provider.setSeatQuantity).toHaveBeenCalledWith(
        'sub_1',
        'price_seat',
        1,
        expect.any(Array),
        'none',
      );
      expect(provider.chargeSeatIncrease).not.toHaveBeenCalled();
      expect(r).toMatchObject({
        status: 'scheduled',
        effectiveAt: periodEnd.toISOString(),
      });
      expect(row.assistant_seats).toBe(3);
      expect(changes[0]).toMatchObject({
        from_seats: 3,
        to_seats: 1,
        status: 'scheduled',
      });
    });

    it('works even in a trial (only buying needs a paid period)', async () => {
      const { svc } = setup({
        row: { assistant_seats: 2, status: 'trialing' },
      });
      await expect(svc.set(user, 1)).resolves.toMatchObject({
        status: 'scheduled',
      });
    });

    it('never below the assistants in use', async () => {
      const { svc } = setup({ row: { assistant_seats: 3 }, live: 2 });
      const e = await svc.set(user, 1).catch((x: unknown) => x);
      expect(code(e)).toBe(ErrorCode.ASSISTANT_SEATS_IN_USE);
    });

    it('back to the paid count calls the removal off', async () => {
      const { svc, provider, changes } = setup({
        row: { assistant_seats: 3 },
        scheduled: { id: 'sch-1', to_seats: 1, effective_at: periodEnd },
      });
      const r = await svc.set(user, 3);
      expect(r.status).toBe('applied');
      expect(provider.setSeatQuantity).toHaveBeenCalledWith(
        'sub_1',
        'price_seat',
        3,
        expect.any(Array),
        'none',
      );
      expect(changes[0]).toMatchObject({ id: 'sch-1', status: 'canceled' });
    });

    it('a due removal applies on the next read', async () => {
      const { svc, row, changes } = setup({
        row: { assistant_seats: 3, price_cents: 69_900 },
        scheduled: {
          id: 'sch-1',
          to_seats: 1,
          effective_at: new Date(Date.now() - 1000),
        },
      });
      await svc.applyDueDecrease('att-1');
      expect(row.assistant_seats).toBe(1);
      expect(row.price_cents).toBe(49_900);
      expect(changes[0]).toMatchObject({ id: 'sch-1', status: 'applied' });
    });
  });

  it('the plan that includes every seat sells none', async () => {
    const { svc } = setup({ included: 6, max: 6 });
    const e = await svc.preview(user, 1).catch((x: unknown) => x);
    expect(code(e)).toBe(ErrorCode.SUBSCRIPTION_PLAN_INCLUDES_SEATS);
  });
});
