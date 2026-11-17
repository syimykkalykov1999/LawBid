import {
  hotlineAddonOffer,
  hotlineAddonSync,
  proratedCents,
} from './hotline-addon.logic';

/** Owner row 87 (16.11, plan PR 8): when the card offers the add-on, how
 * the webhook keeps the row on Stripe's items, and Stripe's proration. */
describe('hotline add-on logic', () => {
  const base = {
    flagOn: true,
    mode: 'by_subscription' as const,
    planCode: 'pro',
    values: { hotline_addon_price_cents: 4_900 },
  };

  it('offers the plan price only «По подписке», not included, with a price', () => {
    expect(hotlineAddonOffer(base)).toBe(4_900);
    expect(hotlineAddonOffer({ ...base, flagOn: false })).toBeNull();
    expect(hotlineAddonOffer({ ...base, mode: 'on_for_all' })).toBeNull();
    expect(hotlineAddonOffer({ ...base, mode: 'off_for_all' })).toBeNull();
    expect(hotlineAddonOffer({ ...base, planCode: null })).toBeNull();
    expect(
      hotlineAddonOffer({
        ...base,
        values: { hotline: true, hotline_addon_price_cents: 4_900 },
      }),
    ).toBeNull();
    expect(
      hotlineAddonOffer({ ...base, values: { hotline_addon_price_cents: 0 } }),
    ).toBeNull();
    expect(hotlineAddonOffer({ ...base, values: {} })).toBeNull();
  });

  describe('webhook sync', () => {
    const ids = new Set(['price_hl']);
    const local = {
      hotline_addon: false,
      hotline_addon_invoice_id: null as string | null,
      current_period_end: new Date('2026-12-01T00:00:00Z'),
    };
    const plan = {
      priceId: 'price_plan',
      quantity: 1,
      unitAmountCents: 39_900,
    };
    const addon = { priceId: 'price_hl', quantity: 1, unitAmountCents: 4_900 };

    it('the item on Stripe (paid after 3-D Secure) turns it on, the total grows', () => {
      expect(
        hotlineAddonSync(
          { ...local, hotline_addon_invoice_id: 'in_1' },
          { items: [plan, addon] },
          ids,
          39_900,
        ),
      ).toEqual({
        hotline_addon: true,
        hotline_addon_ends_at: null,
        hotline_addon_invoice_id: null,
        price_cents: 44_800,
      });
    });

    it('already on: nothing changes (no double price)', () => {
      expect(
        hotlineAddonSync(
          { ...local, hotline_addon: true },
          { items: [plan, addon] },
          ids,
          44_800,
        ),
      ).toEqual({});
    });

    it('removed in the Stripe Dashboard: usable to the period end, no refund', () => {
      const end = Date.parse('2026-12-05T00:00:00Z') / 1000;
      expect(
        hotlineAddonSync(
          { ...local, hotline_addon: true },
          { items: [plan], currentPeriodEnd: end },
          ids,
          44_800,
        ),
      ).toEqual({
        hotline_addon: false,
        hotline_addon_ends_at: new Date(end * 1000),
        hotline_addon_invoice_id: null,
      });
    });

    it('a waiting purchase that expired is forgotten; a live one is kept', () => {
      const waiting = { ...local, hotline_addon_invoice_id: 'in_1' };
      expect(hotlineAddonSync(waiting, { items: [plan] }, ids, 39_900)).toEqual(
        { hotline_addon_invoice_id: null },
      );
      expect(
        hotlineAddonSync(
          waiting,
          { items: [plan], pendingUpdateExpiresAt: 123 },
          ids,
          39_900,
        ),
      ).toEqual({});
    });

    it('no known add-on prices (or no items): left as it is', () => {
      expect(hotlineAddonSync(local, { items: [plan] }, null, 1)).toEqual({});
      expect(hotlineAddonSync(local, { items: [plan] }, new Set(), 1)).toEqual(
        {},
      );
      expect(hotlineAddonSync(local, {}, ids, 1)).toEqual({});
    });
  });

  it('Stripe proration: unit × the unused share of the period, to the cent', () => {
    const start = 1_000_000;
    const end = start + 30 * 86_400;
    expect(proratedCents(4_900, 1, start, end, start)).toBe(4_900);
    expect(proratedCents(4_900, 1, start, end, start + 20 * 86_400)).toBe(
      1_633,
    );
    expect(proratedCents(10_000, 2, start, end, start + 15 * 86_400)).toBe(
      10_000,
    );
    expect(proratedCents(4_900, 1, start, end, end + 1)).toBe(0);
  });
});
