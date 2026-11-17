import { ConflictException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { HotlineAddonService } from './hotline-addon.service';
import type { ProviderSeatCharge } from './payment-provider';

/**
 * Owner row 87 (16.11, plan PR 8): the «Горячая линия» add-on is an item of
 * the ONE subscription, bought and dropped like a seat — on = the prorated
 * rest of the period charged now (`always_invoice` + `pending_if_incomplete`
 * at the preview's proration date, one idempotency key per purchase), off =
 * no refund, the item leaves Stripe with `none` and stays usable to the
 * period end; on again inside the paid period costs nothing.
 */
describe('HotlineAddonService', () => {
  const user = { sub: 'att-1', role: 'attorney' } as never;
  const periodEnd = new Date(Date.now() + 10 * 86_400_000);

  type Row = {
    id: string;
    user_id: string;
    status: string;
    stripe_subscription_id: string | null;
    price_cents: number;
    current_period_end: Date | null;
    trial_ends_at: Date | null;
    hotline_addon: boolean;
    hotline_addon_ends_at: Date | null;
    hotline_addon_invoice_id: string | null;
  };

  function setup(
    opts: {
      row?: Partial<Row>;
      payments?: number;
      flag?: boolean;
      mode?: string;
      values?: Record<string, unknown>;
      charge?: Partial<ProviderSeatCharge>;
    } = {},
  ) {
    const row: Row = {
      id: 'sub-row',
      user_id: 'att-1',
      status: 'active',
      stripe_subscription_id: 'sub_1',
      price_cents: 39_900,
      current_period_end: periodEnd,
      trial_ends_at: null,
      hotline_addon: false,
      hotline_addon_ends_at: null,
      hotline_addon_invoice_id: null,
      ...opts.row,
    };
    const prisma = {
      subscription: {
        findUnique: jest.fn().mockResolvedValue(row),
        update: jest.fn(({ data }: { data: Partial<Row> }) => {
          Object.assign(row, data);
          return Promise.resolve(row);
        }),
      },
      payment: { count: jest.fn().mockResolvedValue(opts.payments ?? 1) },
    };
    const provider = {
      previewSeatIncrease: jest.fn().mockResolvedValue({
        amountNowCents: 1_633,
        currency: 'usd',
        prorationDate: 0,
        periodEnd: Math.floor(periodEnd.getTime() / 1000),
      }),
      chargeSeatIncrease: jest.fn().mockResolvedValue({
        status: 'applied',
        invoiceId: 'in_hl',
        amountCents: 1_633,
        currency: 'usd',
        clientSecret: null,
        subscription: {},
        ...opts.charge,
      }),
      setSeatQuantity: jest.fn().mockResolvedValue({}),
    };
    const pricing = {
      ensureRow: jest.fn().mockResolvedValue(4_900),
      amountOf: jest.fn().mockResolvedValue(4_900),
      requirePriceId: jest.fn().mockResolvedValue('price_hl'),
      allHotlinePriceIds: jest
        .fn()
        .mockResolvedValue(['price_hl', 'price_hl_old']),
    };
    const resolved = {
      audience: 'attorney',
      planCode: 'pro',
      values: { hotline_addon_price_cents: 4_900, ...opts.values },
    };
    const entitlements = {
      forUser: jest.fn().mockResolvedValue(resolved),
      invalidateUser: jest.fn().mockResolvedValue(undefined),
    };
    const me = { isActive: true };
    const subscriptions = {
      assertVerifiedAttorney: jest.fn().mockResolvedValue({ email: null }),
      stripeTaxEnabled: jest.fn().mockResolvedValue(false),
      me: jest.fn().mockResolvedValue(me),
      setHotlineAddonView: jest.fn(),
    };
    const flags = {
      isEnabled: jest.fn().mockResolvedValue(opts.flag ?? true),
    };
    const settings = {
      all: jest
        .fn()
        .mockResolvedValue({ 'hotline.mode': opts.mode ?? 'by_subscription' }),
    };
    const svc = new HotlineAddonService(
      prisma as never,
      provider as never,
      pricing as never,
      entitlements as never,
      subscriptions as never,
      flags as never,
      settings as never,
    );
    return { svc, row, prisma, provider, pricing, entitlements, subscriptions };
  }

  it('registers its card row on /subscriptions/me', () => {
    const { subscriptions } = setup();
    expect(subscriptions.setHotlineAddonView).toHaveBeenCalledTimes(1);
  });

  it('previews «К оплате сейчас» with Stripe at one proration moment', async () => {
    const { svc, provider } = setup();
    const p = await svc.preview(user);
    expect(provider.previewSeatIncrease).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: 'sub_1',
        seatPriceId: 'price_hl',
        knownSeatPriceIds: ['price_hl', 'price_hl_old'],
        addSeats: 1,
        prorationDate: p.prorationDate,
      }),
    );
    expect(p).toMatchObject({
      amountNowCents: 1_633,
      priceCents: 4_900,
      monthlyIncreaseCents: 4_900,
      nextChargeCents: 39_900 + 4_900,
    });
  });

  it('turning on charges the prorated rest now, with one idempotency key', async () => {
    const { svc, provider, row, entitlements } = setup();
    const at = Math.floor(Date.now() / 1000) - 5;
    const r = await svc.set(user, true, at);
    expect(provider.chargeSeatIncrease).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: 'sub_1',
        seatPriceId: 'price_hl',
        quantity: 1,
        prorationDate: at,
        idempotencyKey: `hotline-addon:att-1:sub_1:${at}`,
      }),
    );
    expect(r.status).toBe('applied');
    expect(r.amountCents).toBe(1_633);
    expect(row).toMatchObject({
      hotline_addon: true,
      hotline_addon_ends_at: null,
      price_cents: 44_800,
    });
    expect(entitlements.invalidateUser).toHaveBeenCalledWith('att-1');
  });

  it('3-D Secure: nothing is on until the webhook; the invoice is remembered', async () => {
    const { svc, row } = setup({
      charge: { status: 'requires_action', clientSecret: 'pi_x_secret_y' },
    });
    const r = await svc.set(user, true);
    expect(r.status).toBe('requires_action');
    expect(r.clientSecret).toBe('pi_x_secret_y');
    expect(row.hotline_addon).toBe(false);
    expect(row.hotline_addon_invoice_id).toBe('in_hl');
  });

  it('a declined card changes nothing', async () => {
    const { svc, row } = setup({ charge: { status: 'failed' } });
    const r = await svc.set(user, true);
    expect(r.status).toBe('failed');
    expect(row.hotline_addon).toBe(false);
    expect(row.price_cents).toBe(39_900);
  });

  it('turning off refunds nothing: the item leaves Stripe with `none`, usable to the period end', async () => {
    const { svc, provider, row } = setup({
      row: { hotline_addon: true, price_cents: 44_800 },
    });
    const r = await svc.set(user, false);
    expect(provider.setSeatQuantity).toHaveBeenCalledWith(
      'sub_1',
      'price_hl',
      0,
      ['price_hl', 'price_hl_old'],
      'none',
    );
    expect(provider.chargeSeatIncrease).not.toHaveBeenCalled();
    expect(r.status).toBe('scheduled');
    expect(r.effectiveAt).toBe(periodEnd.toISOString());
    expect(row).toMatchObject({
      hotline_addon: false,
      hotline_addon_ends_at: periodEnd,
      price_cents: 39_900,
    });
  });

  it('on again inside the paid period: back on Stripe for the next invoice, no charge', async () => {
    const { svc, provider, row } = setup({
      row: { hotline_addon: false, hotline_addon_ends_at: periodEnd },
    });
    const p = await svc.preview(user);
    expect(p.amountNowCents).toBe(0);
    expect(provider.previewSeatIncrease).not.toHaveBeenCalled();
    const r = await svc.set(user, true);
    expect(r.status).toBe('applied');
    expect(provider.chargeSeatIncrease).not.toHaveBeenCalled();
    expect(provider.setSeatQuantity).toHaveBeenCalledWith(
      'sub_1',
      'price_hl',
      1,
      ['price_hl', 'price_hl_old'],
      'none',
    );
    expect(row).toMatchObject({
      hotline_addon: true,
      hotline_addon_ends_at: null,
      price_cents: 44_800,
    });
  });

  it('a stale price is asked again (SEATS_PREVIEW_STALE)', async () => {
    const { svc, provider } = setup();
    const old = Math.floor(Date.now() / 1000) - 2 * 3600;
    await expect(svc.set(user, true, old)).rejects.toMatchObject({
      response: { code: ErrorCode.SEATS_PREVIEW_STALE },
    });
    expect(provider.chargeSeatIncrease).not.toHaveBeenCalled();
  });

  it('like seats: not in a trial, not before the first payment', async () => {
    const trial = setup({ row: { status: 'trialing' } });
    await expect(trial.svc.set(user, true)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(trial.svc.set(user, true)).rejects.toMatchObject({
      response: { code: ErrorCode.SEATS_TRIAL_NOT_ALLOWED },
    });
    const unpaid = setup({ payments: 0 });
    await expect(unpaid.svc.set(user, true)).rejects.toMatchObject({
      response: { code: ErrorCode.SEATS_NOT_PAID_YET },
    });
    expect(unpaid.provider.chargeSeatIncrease).not.toHaveBeenCalled();
  });

  it.each([
    ['the line is off', { flag: false }],
    ['«Вкл для всех»', { mode: 'on_for_all' }],
    ['the plan includes the line', { values: { hotline: true } }],
    [
      'the plan has no add-on price',
      { values: { hotline_addon_price_cents: null } },
    ],
  ])('nothing to buy when %s (ENTITLEMENT_REQUIRED)', async (_why, o) => {
    const { svc, provider } = setup(o);
    await expect(svc.set(user, true)).rejects.toMatchObject({
      response: { code: ErrorCode.ENTITLEMENT_REQUIRED },
    });
    expect(provider.chargeSeatIncrease).not.toHaveBeenCalled();
  });

  it('a bought add-on can be turned off even after the plan stopped offering it', async () => {
    const { svc, provider } = setup({
      row: { hotline_addon: true },
      mode: 'on_for_all',
    });
    const r = await svc.set(user, false);
    expect(r.status).toBe('scheduled');
    expect(provider.setSeatQuantity).toHaveBeenCalled();
  });

  it('the card row: price, state, and whether it can be bought now', async () => {
    const { svc, row } = setup();
    const v = await svc.view(
      'att-1',
      row as never,
      {
        audience: 'attorney',
        planCode: 'pro',
        values: { hotline_addon_price_cents: 4_900 },
      } as never,
    );
    expect(v).toEqual({
      priceCents: 4_900,
      currency: 'usd',
      active: false,
      renews: false,
      endsAt: null,
      pending: false,
      canBuy: true,
    });
    const none = await svc.view(
      'att-1',
      row as never,
      {
        audience: 'attorney',
        planCode: 'pro',
        values: { hotline: true },
      } as never,
    );
    expect(none).toBeNull();
  });
});
