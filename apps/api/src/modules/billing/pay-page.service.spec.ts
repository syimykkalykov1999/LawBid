import { UnauthorizedException } from '@nestjs/common';
import { PayLinkService } from './pay-link.service';
import { PayPageService } from './pay-page.service';

/** A Redis stand-in with just SET ... EX ... NX. */
function fakeRedis() {
  const keys = new Set<string>();
  return {
    keys,
    set: jest.fn((k: string) => {
      if (keys.has(k)) return Promise.resolve(null);
      keys.add(k);
      return Promise.resolve('OK');
    }),
  };
}

function make(opts: { enabled?: boolean; key?: string | null } = {}) {
  const config = {
    getOrThrow: jest.fn(() => 'otp-secret-for-tests-0123456789'),
    get: jest.fn((k: string) =>
      k === 'APP_LINK_BASE_URL' ? 'https://lawbid.dev' : undefined,
    ),
  };
  const subscriptions = {
    stripeTaxEnabled: jest.fn().mockResolvedValue(false),
    start: jest.fn().mockResolvedValue({
      clientSecret: 'seti_secret',
      setupIntentId: 'seti_1',
      priceCents: 39900,
      trialDays: 7,
      trialEligible: true,
    }),
    confirm: jest.fn().mockResolvedValue({ status: 'trialing' }),
    customerId: jest.fn().mockResolvedValue('cus_1'),
  };
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ role: 'attorney', status: 'active' }),
    },
  };
  const secrets = {
    field: jest
      .fn()
      .mockResolvedValue(opts.key === null ? undefined : 'pk_test_abcdefghijk'),
  };
  const settings = {
    boolean: jest.fn().mockResolvedValue(opts.enabled ?? true),
    number: jest.fn().mockResolvedValue(30),
  };
  const seats = {
    preview: jest.fn().mockResolvedValue({
      seats: 3,
      currentSeats: 1,
      amountNowCents: 2500,
      currency: 'usd',
      nextChargeCents: 49900,
      periodEnd: '2026-11-22T00:00:00.000Z',
      prorationDate: 1_800_000_000,
    }),
    useCard: jest.fn().mockResolvedValue(undefined),
    set: jest
      .fn()
      .mockResolvedValue({ status: 'requires_action', clientSecret: 'pi_s' }),
  };
  const promotions = {
    payPageSession: jest.fn().mockResolvedValue({
      paid: false,
      amountCents: 3000,
      currency: 'usd',
      days: 3,
      target: 'post',
      clientSecret: 'pi_secret',
      paymentIntentId: 'pi_1',
    }),
    payPageConfirm: jest.fn().mockResolvedValue(true),
  };
  const provider = {
    createSetupIntent: jest
      .fn()
      .mockResolvedValue({ id: 'seti_9', clientSecret: 'seti_9_secret' }),
  };
  const redis = fakeRedis();
  const links = new PayLinkService(
    config as never,
    secrets as never,
    settings as never,
    redis as never,
  );
  const stars = {
    payPageSession: jest.fn().mockResolvedValue({
      paid: false,
      amountCents: 499,
      clientSecret: 'pi_stars_secret',
      stars: 100,
    }),
    payPageConfirm: jest.fn().mockResolvedValue(true),
  };
  const bidPacks = {
    payPageSession: jest.fn().mockResolvedValue({
      paid: true,
      amountCents: 1500,
      clientSecret: null,
      bids: 10,
    }),
    payPageConfirm: jest.fn().mockResolvedValue(false),
  };
  const clientPlans = {
    payPageSession: jest.fn().mockResolvedValue({
      priceCents: 999,
      trialDays: 7,
      clientSecret: 'seti_plan_secret',
      setupIntentId: 'seti_plan',
    }),
    payPageConfirm: jest.fn().mockResolvedValue(true),
  };
  const clientBadge = {
    payPageSession: jest.fn().mockResolvedValue({
      priceCents: 1000,
      clientSecret: 'seti_badge_secret',
      setupIntentId: 'seti_badge',
    }),
    payPageConfirm: jest.fn().mockResolvedValue(false),
  };
  const svc = new PayPageService(
    links,
    subscriptions as never,
    prisma as never,
    seats as never,
    promotions as never,
    provider as never,
    stars as never,
    bidPacks as never,
    clientPlans as never,
    clientBadge as never,
  );
  return {
    svc,
    links,
    subscriptions,
    prisma,
    seats,
    promotions,
    provider,
    stars,
    bidPacks,
    clientPlans,
    clientBadge,
  };
}

describe('PayPageService (owner 2026-10-16 / 2026-10-22: our own card page)', () => {
  const user = {
    sub: 'u1',
    role: 'attorney',
    sid: 's',
    verified: true,
    subscriptionStatus: 'none',
  };
  const tokenOf = (url: string) =>
    new URLSearchParams(url.split('#')[1]).get('t') as string;

  it('is on only with the switch on and the public key known', async () => {
    expect(await make().svc.enabled()).toBe(true);
    expect(await make({ enabled: false }).svc.enabled()).toBe(false);
    expect(await make({ key: null }).svc.enabled()).toBe(false);
  });

  it('subscription: the link opens a SetupIntent for that attorney; the page token pays', async () => {
    const { svc, subscriptions } = make();
    const link = await svc.link(
      user,
      { planCode: 'pro' },
      'https://api.lawbid.dev/api/v1',
    );
    expect(link.url.startsWith('https://lawbid.dev/pay.html#t=')).toBe(true);
    expect(link.url).toContain('&api=https%3A%2F%2Fapi.lawbid.dev%2Fapi%2Fv1');
    expect(link.id.startsWith('own:')).toBe(true);
    const s = await svc.session(tokenOf(link.url));
    expect(s).toMatchObject({
      kind: 'subscription',
      mode: 'setup',
      publishableKey: 'pk_test_abcdefghijk',
      clientSecret: 'seti_secret',
      priceCents: 39900,
      trialDays: 7,
    });
    expect(s.pageToken).not.toEqual(tokenOf(link.url));
    expect(subscriptions.start).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'u1', role: 'attorney' }),
      { planCode: 'pro' },
    );
    const r = await svc.confirm(s.pageToken, {
      setupIntentId: 'seti_1',
      chargeNow: false,
    });
    expect(r.status).toBe('ok');
    expect(subscriptions.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'u1' }),
      'seti_1',
      false,
    );
  });

  it('the link is one-time; the page token can reopen the page', async () => {
    const { svc } = make();
    const link = await svc.link(user, {}, 'https://api.example/api/v1');
    const first = await svc.session(tokenOf(link.url));
    await expect(svc.session(tokenOf(link.url))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // A reload of the open page keeps working.
    await expect(svc.session(first.pageToken)).resolves.toMatchObject({
      kind: 'subscription',
    });
  });

  it('seats: the price now, a card can be swapped in, 3-D Secure is handed to the page', async () => {
    const { svc, seats, provider } = make();
    const link = await svc.seatsLink(user, 3, 'https://api.example/api/v1');
    expect(seats.preview).toHaveBeenCalledWith(user, 3);
    const s = await svc.session(tokenOf(link.url));
    expect(s).toMatchObject({
      kind: 'seats',
      mode: 'setup',
      priceCents: 2500,
      seats: 3,
      currentSeats: 1,
      clientSecret: 'seti_9_secret',
    });
    expect(provider.createSetupIntent).toHaveBeenCalledWith(
      'cus_1',
      expect.objectContaining({ kind: 'assistant_seats' }),
    );
    const r = await svc.confirm(s.pageToken, {
      setupIntentId: 'seti_9',
      prorationDate: 1_800_000_000,
    });
    expect(seats.useCard).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'u1' }),
      'seti_9',
    );
    expect(seats.set).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'u1' }),
      3,
      1_800_000_000,
    );
    expect(r).toEqual({ status: 'requires_action', clientSecret: 'pi_s' });
  });

  it('Stripe Tax on: a one-time payment gets a tax calculation at the address and the intent is raised to the total; a card-saving page stores the address on the customer', async () => {
    const h = make();
    const { svc, links, prisma, subscriptions, provider } = h;
    subscriptions.stripeTaxEnabled.mockResolvedValue(true);
    subscriptions.customerId = jest.fn().mockResolvedValue('cus_1');
    const tax = Object.assign(provider, {
      retrievePaymentIntent: jest.fn().mockResolvedValue({
        id: 'pi_1',
        status: 'requires_payment_method',
        amountCents: 3000,
        currency: 'usd',
        clientSecret: 'pi_1_secret_x',
        metadata: { kind: 'case_promotion' },
      }),
      calculateTax: jest.fn().mockResolvedValue({
        calculationId: 'taxcalc_1',
        subtotalCents: 3000,
        taxCents: 248,
        totalCents: 3248,
        currency: 'usd',
      }),
      updatePaymentIntent: jest.fn().mockResolvedValue({}),
      updateCustomerTaxLocation: jest.fn().mockResolvedValue(undefined),
    });
    h.promotions.payPageSession.mockResolvedValue({
      paid: false,
      amountCents: 3000,
      currency: 'usd',
      days: 3,
      target: 'post',
      clientSecret: 'pi_1_secret_x',
      paymentIntentId: 'pi_1',
    });
    prisma.user.findUnique.mockResolvedValue({
      role: 'client',
      status: 'active',
    });
    const link = await links.link(
      'u1',
      { kind: 'promotion', promotionId: 'promo-1' },
      'https://api.example/api/v1',
    );
    const address = { country: 'US', postalCode: '94105', state: 'CA' };
    const s = await svc.session(link.token, { ip: '203.0.113.9', address });
    expect(s).toMatchObject({
      priceCents: 3248,
      subtotalCents: 3000,
      taxCents: 248,
    });
    expect(tax.calculateTax).toHaveBeenCalledWith({
      amountCents: 3000,
      currency: 'usd',
      reference: 'pi_1',
      location: { ip: '203.0.113.9', address },
    });
    expect(tax.updatePaymentIntent).toHaveBeenCalledWith('pi_1', {
      amountCents: 3248,
      metadata: {
        kind: 'case_promotion',
        taxCalculationId: 'taxcalc_1',
        taxCents: '248',
      },
    });

    // The subscription page (SetupIntent) stores the address on the customer.
    prisma.user.findUnique.mockResolvedValue({
      role: 'attorney',
      status: 'active',
    });
    const subLink = await svc.link(
      {
        sub: 'u1',
        role: 'attorney',
        sid: 's',
        verified: true,
        subscriptionStatus: 'none',
      },
      { planCode: 'pro' },
      'https://api.example/api/v1',
    );
    const sub = await svc.session(tokenOf(subLink.url), { address });
    expect(sub.mode).toBe('setup');
    expect(tax.updateCustomerTaxLocation).toHaveBeenCalledWith('cus_1', {
      ip: null,
      address,
    });

    // Switch off: nothing is computed and the price stays as listed.
    subscriptions.stripeTaxEnabled.mockResolvedValue(false);
    tax.calculateTax.mockClear();
    const again = await links.link(
      'u1',
      { kind: 'promotion', promotionId: 'promo-1' },
      'https://api.example/api/v1',
    );
    prisma.user.findUnique.mockResolvedValue({
      role: 'client',
      status: 'active',
    });
    const plain = await svc.session(again.token, { address });
    expect(plain.priceCents).toBe(3000);
    expect(plain.taxCents).toBeUndefined();
    expect(tax.calculateTax).not.toHaveBeenCalled();
  });

  it('promotion: any active user pays their own Boost by PaymentIntent', async () => {
    const { svc, links, prisma, promotions } = make();
    prisma.user.findUnique.mockResolvedValue({
      role: 'client',
      status: 'active',
    });
    const link = await links.link(
      'u1',
      { kind: 'promotion', promotionId: 'promo-1' },
      'https://api.example/api/v1',
    );
    const s = await svc.session(link.token);
    expect(s).toMatchObject({
      kind: 'promotion',
      mode: 'payment',
      clientSecret: 'pi_secret',
      priceCents: 3000,
      days: 3,
    });
    expect(promotions.payPageSession).toHaveBeenCalledWith('u1', 'promo-1');
    expect(await svc.confirm(s.pageToken, {})).toEqual({
      status: 'ok',
      clientSecret: null,
    });
    promotions.payPageConfirm.mockResolvedValue(false);
    expect((await svc.confirm(s.pageToken, {})).status).toBe('pending');
  });

  // Owner 2026-10-22 («лечи всё»): every other purchase on the same page.
  it('stars: a PaymentIntent for the top-up, any active user, back to /stars', async () => {
    const { svc, links, stars, prisma } = make();
    prisma.user.findUnique.mockResolvedValue({
      role: 'client',
      status: 'active',
    });
    const l = await links.link(
      'u1',
      { kind: 'stars', purchaseId: 'buy1' },
      'https://api.x/api/v1',
    );
    const s = await svc.session(l.token);
    expect(s).toMatchObject({
      kind: 'stars',
      mode: 'payment',
      clientSecret: 'pi_stars_secret',
      priceCents: 499,
      stars: 100,
      returnPath: '/stars',
    });
    expect(stars.payPageSession).toHaveBeenCalledWith('u1', 'buy1');
    expect((await svc.confirm(s.pageToken, {})).status).toBe('ok');
    expect(stars.payPageConfirm).toHaveBeenCalledWith('u1', 'buy1');
  });

  it('offer pack: already paid → nothing to pay; not seen yet → pending', async () => {
    const { svc, links } = make();
    const l = await links.link(
      'u1',
      { kind: 'bid_pack', purchaseId: 'bp1' },
      'https://api.x/api/v1',
    );
    const s = await svc.session(l.token);
    expect(s).toMatchObject({
      kind: 'bid_pack',
      mode: 'none',
      bids: 10,
      returnPath: '/bid-packs',
    });
    expect((await svc.confirm(s.pageToken, {})).status).toBe('pending');
  });

  it('client plan: a SetupIntent, then the plan is made on the saved card', async () => {
    const { svc, links, clientPlans, prisma } = make();
    prisma.user.findUnique.mockResolvedValue({
      role: 'client',
      status: 'active',
    });
    const l = await links.link(
      'u1',
      { kind: 'client_plan', planCode: 'client_pro' },
      'https://api.x/api/v1',
    );
    const s = await svc.session(l.token);
    expect(s).toMatchObject({
      kind: 'client_plan',
      mode: 'setup',
      clientSecret: 'seti_plan_secret',
      priceCents: 999,
      trialDays: 7,
      trialEligible: true,
      returnPath: '/plan',
    });
    expect(clientPlans.payPageSession).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'u1', role: 'client' }),
      'client_pro',
    );
    await expect(svc.confirm(s.pageToken, {})).rejects.toThrow(
      'The card was not saved.',
    );
    expect(
      (await svc.confirm(s.pageToken, { setupIntentId: 'seti_plan' })).status,
    ).toBe('ok');
    expect(clientPlans.payPageConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'u1' }),
      'client_pro',
      'seti_plan',
    );
  });

  it('gold badge: clients only; the first charge still confirming → pending', async () => {
    const { svc, links, clientBadge, prisma } = make();
    const l = await links.link(
      'u1',
      { kind: 'client_badge' },
      'https://api.x/api/v1',
    );
    // An attorney's token for a client purchase does nothing.
    await expect(svc.session(l.token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    prisma.user.findUnique.mockResolvedValue({
      role: 'client',
      status: 'active',
    });
    const l2 = await links.link(
      'u1',
      { kind: 'client_badge' },
      'https://api.x/api/v1',
    );
    const s = await svc.session(l2.token);
    expect(s).toMatchObject({
      kind: 'client_badge',
      mode: 'setup',
      priceCents: 1000,
      returnPath: '/verification',
    });
    expect(
      (await svc.confirm(s.pageToken, { setupIntentId: 'seti_badge' })).status,
    ).toBe('pending');
    expect(clientBadge.payPageConfirm).toHaveBeenCalledWith('u1', 'seti_badge');
  });

  it('a changed, foreign or expired token is refused', async () => {
    const { svc } = make();
    const link = await svc.link(user, {}, 'https://api.example/api/v1');
    const t = tokenOf(link.url);
    const [body, sig] = t.split('.');
    const forged = `${Buffer.from(JSON.stringify({ u: 'attacker', r: {}, e: 9999999999 })).toString('base64url')}.${sig}`;
    await expect(svc.session(forged)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(svc.session(`${body}.x`)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(svc.session('nonsense')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    jest.useFakeTimers().setSystemTime(Date.now() + 31 * 60_000);
    try {
      await expect(svc.session(t)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('a subscription / seats link of a user who is not an active attorney does nothing', async () => {
    const { svc, prisma } = make();
    prisma.user.findUnique.mockResolvedValue({
      role: 'client',
      status: 'active',
    });
    const link = await svc.link(user, {}, 'https://api.example/api/v1');
    await expect(svc.session(tokenOf(link.url))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
