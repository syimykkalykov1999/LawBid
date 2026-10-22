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
  const svc = new PayPageService(
    links,
    subscriptions as never,
    prisma as never,
    seats as never,
    promotions as never,
    provider as never,
  );
  return { svc, links, subscriptions, prisma, seats, promotions, provider };
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
