import { UnauthorizedException } from '@nestjs/common';
import { PayPageService } from './pay-page.service';

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
  const svc = new PayPageService(
    config as never,
    subscriptions as never,
    prisma as never,
    secrets as never,
    settings as never,
    config as never,
  );
  return { svc, subscriptions, prisma };
}

describe('PayPageService (owner 2026-10-16, our own card page)', () => {
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

  it('the link carries a signed token; the page gets a SetupIntent for that attorney', async () => {
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
      publishableKey: 'pk_test_abcdefghijk',
      clientSecret: 'seti_secret',
      priceCents: 39900,
      trialDays: 7,
    });
    expect(subscriptions.start).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'u1', role: 'attorney' }),
      { planCode: 'pro' },
    );
    await svc.confirm(tokenOf(link.url), 'seti_1', false);
    expect(subscriptions.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'u1' }),
      'seti_1',
      false,
    );
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

  it('a link of a user who is not an active attorney does nothing', async () => {
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
