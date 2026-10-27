import {
  billingOf,
  budgetSpent,
  DEFAULT_PROMOTION_SETTINGS,
  deliveredUnits,
  isAllowedAdLink,
  mergePricing,
  offersFor,
  parsePricing,
  parsePromotionSettings,
  pricingTargetOf,
  targetUnits,
  unitsFor,
  unspentShare,
} from './promotions.settings';

describe('boost settings (owner 2026-10-15)', () => {
  it('ads are 1 per 12 by default and clamp to 10–15', () => {
    expect(DEFAULT_PROMOTION_SETTINGS.feedEveryN).toBe(12);
    expect(DEFAULT_PROMOTION_SETTINGS.reelEveryN).toBe(12);
    const s = parsePromotionSettings({ feedEveryN: 3, reelEveryN: 40 });
    expect(s.feedEveryN).toBe(DEFAULT_PROMOTION_SETTINGS.feedEveryN);
    expect(s.reelEveryN).toBe(DEFAULT_PROMOTION_SETTINGS.reelEveryN);
    expect(parsePromotionSettings({ feedEveryN: 15 }).feedEveryN).toBe(15);
  });

  it('keeps only known button types', () => {
    const s = parsePromotionSettings({ ctaTypes: ['call', 'x', 'more'] });
    expect(s.ctaTypes).toEqual(['call', 'more']);
  });
});

describe('isAllowedAdLink', () => {
  it.each([
    ['https://smith-law.com/contact', true],
    ['http://smith-law.com', false],
    ['https://bit.ly/abc', false],
    ['https://wa.me/123', false],
    ['https://t.me/x', false],
    ['https://127.0.0.1/x', false],
    ['https://user:pw@smith-law.com', false],
    ['smith-law.com', false],
  ])('%s → %s', (url, ok) => {
    expect(isAllowedAdLink(url)).toBe(ok);
  });
});

describe('boost pricing per way to pay (owner 2026-10-27)', () => {
  it('starts with only views on, every new way to pay off', () => {
    const p = DEFAULT_PROMOTION_SETTINGS.pricing;
    for (const t of ['post', 'video', 'case'] as const) {
      expect(offersFor(p, t).map((o) => o.billing)).toEqual(['impressions']);
    }
    expect(offersFor(p, 'profile')).toEqual([]);
  });

  it('an old row without pricing keeps its CPM as the views price', () => {
    const s = parsePromotionSettings({ cpmCents: 777, postsEnabled: false });
    expect(s.pricing.post.models.impressions).toEqual({
      enabled: true,
      priceCents: 777,
    });
    expect(s.pricing.case.models.impressions.priceCents).toBe(777);
    expect(s.pricing.post.models.clicks.enabled).toBe(false);
    expect(s.cpmCents).toBe(777);
    // The old per-thing switches are untouched by the price matrix.
    expect(s.postsEnabled).toBe(false);
  });

  it('reads stored prices and switches, clamps nonsense, drops unknown actions', () => {
    const p = parsePricing(
      {
        post: {
          models: {
            clicks: { enabled: true, priceCents: 45 },
            actions: { enabled: true, priceCents: -3 },
          },
          actions: ['follow', 'hired', 'save', 'follow'],
        },
        case: { actions: ['hired', 'case_won'] },
      },
      500,
    );
    expect(p.post.models.clicks).toEqual({ enabled: true, priceCents: 45 });
    // A price below 1 cent falls back to the default.
    expect(p.post.models.actions.priceCents).toBe(150);
    expect(p.post.actions).toEqual(['follow', 'save']);
    // «Hired» / «case won» is never an action (paying for a client).
    expect(p.case.actions).toEqual([]);
    expect(p.case.models.actions.enabled).toBe(false);
  });

  it('turns a per-action model off when no action is chosen', () => {
    const p = parsePricing(
      {
        post: {
          models: { actions: { enabled: true, priceCents: 100 } },
          actions: [],
        },
      },
      500,
    );
    expect(p.post.models.actions.enabled).toBe(false);
  });

  it('merges a partial change target by target', () => {
    const base = parsePricing(null, 500);
    const next = mergePricing(
      base,
      { video: { models: { reach: { enabled: true, priceCents: 900 } } } },
      500,
    );
    expect(next.video.models.reach).toEqual({ enabled: true, priceCents: 900 });
    expect(next.video.models.impressions).toEqual(
      base.video.models.impressions,
    );
    expect(next.post).toEqual(base.post);
  });

  it('maps a thing to its price row', () => {
    expect(pricingTargetOf('post')).toBe('post');
    expect(pricingTargetOf('post', true)).toBe('video');
    expect(pricingTargetOf('case')).toBe('case');
  });

  it('units a budget buys: per 1000 for views / people, else per one', () => {
    expect(unitsFor('impressions', 1000, 500)).toBe(2000);
    expect(unitsFor('reach', 1000, 800)).toBe(1250);
    expect(unitsFor('clicks', 1000, 40)).toBe(25);
    expect(unitsFor('actions', 1000, 200)).toBe(5);
    expect(unitsFor('actions', 1, 200)).toBe(1);
  });

  const counts = (o: object) => ({
    billing: 'impressions',
    impressions: 0,
    reach: 0,
    clicks: 0,
    actions: 0,
    target_units: null,
    target_impressions: null,
    ...o,
  });

  it('measures progress in the unit the boost is paid for', () => {
    expect(billingOf('weird')).toBe('impressions');
    const taps = counts({ billing: 'clicks', clicks: 7, impressions: 900 });
    expect(deliveredUnits(taps)).toBe(7);
    expect(deliveredUnits(counts({ billing: 'reach', reach: 4 }))).toBe(4);
    expect(deliveredUnits(counts({ billing: 'actions', actions: 2 }))).toBe(2);
  });

  it('older rows keep their impressions cap; new rows use target_units', () => {
    expect(targetUnits(counts({ target_impressions: 50 }))).toBe(50);
    expect(
      targetUnits(counts({ target_impressions: 50, target_units: 10 })),
    ).toBe(10);
    expect(
      budgetSpent(counts({ impressions: 50, target_impressions: 50 })),
    ).toBe(true);
    expect(
      budgetSpent(
        counts({
          billing: 'clicks',
          clicks: 9,
          target_units: 10,
          impressions: 99,
        }),
      ),
    ).toBe(false);
    expect(budgetSpent(counts({ impressions: 99999 }))).toBe(false);
  });

  it('gives back the undelivered share of what was paid, once', () => {
    const p = counts({ billing: 'clicks', clicks: 25, target_units: 100 });
    expect(unspentShare(p, 1000, 0)).toBe(750);
    // Part of it already went back: never more than what is left.
    expect(unspentShare(p, 1000, 700)).toBe(300);
    expect(unspentShare(counts({ clicks: 5 }), 1000, 0)).toBe(0);
    expect(
      unspentShare(
        counts({ billing: 'clicks', clicks: 100, target_units: 100 }),
        1000,
        0,
      ),
    ).toBe(0);
  });
});
