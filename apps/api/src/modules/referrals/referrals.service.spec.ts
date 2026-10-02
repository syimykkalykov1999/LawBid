import { Prisma } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PaymentProvider } from '../billing/payment-provider';
import {
  generateReferralCode,
  normalizeReferralCode,
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_PATTERN,
} from './referral-code.util';
import { ReferralsService } from './referrals.service';
import {
  DEFAULT_REFERRAL_SETTINGS,
  parseReferralSettings,
  remainingDays,
  validateReward,
} from './referrals.settings';

const DAY = 86_400_000;

function p2002(target: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: [target] },
  });
}

function setup(opts: { enabled?: boolean } = {}) {
  const prisma = {
    appConfig: {
      findUnique: jest.fn().mockResolvedValue({
        key: 'referrals.program',
        value: { ...DEFAULT_REFERRAL_SETTINGS, enabled: opts.enabled ?? true },
      }),
    },
    referralCode: { findUnique: jest.fn(), create: jest.fn() },
    referral: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    user: { findUnique: jest.fn() },
    case: { count: jest.fn().mockResolvedValue(0) },
    payment: { count: jest.fn().mockResolvedValue(0) },
    stripeCustomer: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
  );
  const provider = {
    creditCustomerBalance: jest.fn().mockResolvedValue(undefined),
  };
  const config = {
    get: jest.fn().mockReturnValue(undefined),
  } as unknown as ConfigService;
  const service = new ReferralsService(
    prisma as unknown as PrismaService,
    config,
    provider as unknown as PaymentProvider,
  );
  return { prisma, provider, service, config };
}

describe('referral codes', () => {
  it('uses only the unambiguous alphabet and a 7-char length', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateReferralCode();
      expect(code).toHaveLength(7);
      expect(REFERRAL_CODE_PATTERN.test(code)).toBe(true);
      for (const ch of code) expect(REFERRAL_CODE_ALPHABET).toContain(ch);
    }
    expect(REFERRAL_CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it('normalizes typed codes', () => {
    expect(normalizeReferralCode(' k7mx-2qp ')).toBe('K7MX2QP');
  });

  it('returns an existing code without creating one', async () => {
    const { prisma, service } = setup();
    prisma.referralCode.findUnique.mockResolvedValue({ code: 'ABCDEFG' });
    expect(await service.ensureCode('u1')).toBe('ABCDEFG');
    expect(prisma.referralCode.create).not.toHaveBeenCalled();
  });

  it('retries on a code collision', async () => {
    const { prisma, service } = setup();
    prisma.referralCode.findUnique.mockResolvedValue(null);
    prisma.referralCode.create
      .mockRejectedValueOnce(p2002('code'))
      .mockRejectedValueOnce(p2002('code'))
      .mockImplementation(({ data }: { data: { code: string } }) =>
        Promise.resolve({ code: data.code }),
      );
    const code = await service.ensureCode('u1');
    expect(REFERRAL_CODE_PATTERN.test(code)).toBe(true);
    expect(prisma.referralCode.create).toHaveBeenCalledTimes(3);
  });

  it('re-reads when a concurrent request created the user code', async () => {
    const { prisma, service } = setup();
    prisma.referralCode.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ code: 'RACEWON' });
    prisma.referralCode.create.mockRejectedValueOnce(p2002('user_id'));
    expect(await service.ensureCode('u1')).toBe('RACEWON');
  });

  it('gives up after repeated collisions', async () => {
    const { prisma, service } = setup();
    prisma.referralCode.findUnique.mockResolvedValue(null);
    prisma.referralCode.create.mockRejectedValue(p2002('code'));
    await expect(service.ensureCode('u1')).rejects.toThrow(/unique/);
  });

  it('share URL: app link when configured, else the deep link', () => {
    const { service, config } = setup();
    expect(service.shareUrl('ABCDEFG')).toBe('lawbid://referral/ABCDEFG');
    (config.get as jest.Mock).mockReturnValue('https://lawbid.app/');
    expect(service.shareUrl('ABCDEFG')).toBe('https://lawbid.app/r/ABCDEFG');
  });
});

describe('settings', () => {
  it('defaults every missing or malformed field', () => {
    expect(parseReferralSettings(null)).toEqual(DEFAULT_REFERRAL_SETTINGS);
    const s = parseReferralSettings({
      enabled: true,
      attorneyReferrerReward: { type: 'nope', value: 1 },
      clientRefereeReward: { type: 'promotion_days', value: 3 },
    });
    expect(s.enabled).toBe(true);
    expect(s.attorneyReferrerReward).toEqual({
      type: 'balance_cents',
      value: 10_000,
    });
    expect(s.clientRefereeReward).toEqual({ type: 'promotion_days', value: 3 });
  });

  it('validates reward types per recipient role', () => {
    expect(
      validateReward('referrer', 'client', { type: 'balance_cents', value: 1 }),
    ).toMatch(/must be one of/);
    expect(
      validateReward('referee', 'attorney', {
        type: 'percent_first_invoice',
        value: 101,
      }),
    ).toMatch(/0–100/);
    expect(
      validateReward('referee', 'attorney', {
        type: 'percent_first_invoice',
        value: 20,
      }),
    ).toBeNull();
  });
});

describe('ReferralsService.apply', () => {
  const now = Date.now();
  function ready(s: ReturnType<typeof setup>, createdDaysAgo = 1) {
    s.prisma.user.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'referee'
            ? {
                id: 'referee',
                role: 'client',
                created_at: new Date(now - createdDaysAgo * DAY),
              }
            : { role: 'attorney', status: 'active', deleted_at: null },
        ),
    );
    s.prisma.referralCode.findUnique.mockResolvedValue({
      user_id: 'referrer',
      code: 'ABCDEFG',
    });
    s.prisma.referral.findUnique.mockResolvedValue(null);
    s.prisma.referral.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'r1', ...data }),
    );
  }

  it('creates a pending referral with reward snapshots', async () => {
    const s = setup();
    ready(s);
    const res = await s.service.apply('referee', 'abcdefg');
    expect(res).toEqual({
      status: 'pending',
      reward: { type: 'promotion_days', value: 1 },
    });
    expect(s.prisma.referral.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        referrer_id: 'referrer',
        referee_id: 'referee',
        code: 'ABCDEFG',
        referrer_role: 'attorney',
        referee_role: 'client',
        referrer_reward: { type: 'balance_cents', value: 10_000 },
        referee_reward: { type: 'promotion_days', value: 1 },
      }),
    });
  });

  it('refuses when the program is off', async () => {
    const s = setup({ enabled: false });
    ready(s);
    await expect(s.service.apply('referee', 'ABCDEFG')).rejects.toMatchObject({
      response: { code: 'FEATURE_DISABLED' },
    });
  });

  it('refuses your own code', async () => {
    const s = setup();
    ready(s);
    s.prisma.referralCode.findUnique.mockResolvedValue({
      user_id: 'referee',
      code: 'ABCDEFG',
    });
    await expect(s.service.apply('referee', 'ABCDEFG')).rejects.toMatchObject({
      response: { code: 'REFERRAL_NOT_ALLOWED', details: { reason: 'self' } },
    });
  });

  it('refuses a second code', async () => {
    const s = setup();
    ready(s);
    s.prisma.referral.findUnique.mockResolvedValue({ id: 'old' });
    await expect(s.service.apply('referee', 'ABCDEFG')).rejects.toMatchObject({
      response: { details: { reason: 'already_referred' } },
    });
  });

  it('maps a concurrent duplicate insert to already_referred', async () => {
    const s = setup();
    ready(s);
    s.prisma.referral.create.mockRejectedValue(p2002('referee_id'));
    await expect(s.service.apply('referee', 'ABCDEFG')).rejects.toMatchObject({
      response: { details: { reason: 'already_referred' } },
    });
  });

  it('refuses after the 14-day sign-up window', async () => {
    const s = setup();
    ready(s, 15);
    await expect(s.service.apply('referee', 'ABCDEFG')).rejects.toMatchObject({
      response: { details: { reason: 'window_expired' } },
    });
  });

  it('refuses a user without a role and an unknown code', async () => {
    const s = setup();
    ready(s);
    s.prisma.referralCode.findUnique.mockResolvedValue(null);
    await expect(s.service.apply('referee', 'ZZZZZZZ')).rejects.toMatchObject({
      response: { code: 'REFERRAL_CODE_INVALID' },
    });
    s.prisma.user.findUnique.mockResolvedValue({
      id: 'referee',
      role: null,
      created_at: new Date(),
    });
    await expect(s.service.apply('referee', 'ABCDEFG')).rejects.toMatchObject({
      response: { details: { reason: 'role_required' } },
    });
  });

  it('refuses mutual referrals', async () => {
    const s = setup();
    ready(s);
    s.prisma.referral.findFirst.mockResolvedValue({ id: 'back' });
    await expect(s.service.apply('referee', 'ABCDEFG')).rejects.toMatchObject({
      response: { details: { reason: 'mutual' } },
    });
  });
});

describe('qualification and rewards', () => {
  const pending = {
    id: 'r1',
    referrer_id: 'att',
    referee_id: 'cli',
    status: 'pending',
    referee_role: 'client',
    referrer_reward: { type: 'balance_cents', value: 10_000 },
    referee_reward: { type: 'promotion_days', value: 1 },
  };

  it('qualifies once and credits the referrer through the provider', async () => {
    const s = setup();
    s.prisma.referral.findUnique
      .mockResolvedValueOnce(pending)
      .mockResolvedValue({ ...pending, status: 'qualified' });
    s.prisma.referral.updateMany.mockResolvedValue({ count: 1 });
    s.prisma.stripeCustomer.findUnique.mockResolvedValue({
      stripe_customer_id: 'cus_1',
    });
    s.prisma.referral.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...pending, ...data }),
    );
    await s.service.onQualifyingEvent('cli', 'case_published');
    expect(s.provider.creditCustomerBalance).toHaveBeenCalledWith(
      'cus_1',
      10_000,
      'LawBid referral reward',
      'referral-reward:r1:referrer',
    );
    const data = s.prisma.referral.update.mock.calls[0][0].data;
    expect(data.status).toBe('rewarded');
    expect(data.referrer_reward.issuedAt).toBeDefined();
    expect(data.referee_reward.issuedAt).toBeDefined();
  });

  it('is idempotent: an already-claimed qualification issues nothing', async () => {
    const s = setup();
    s.prisma.referral.findUnique.mockResolvedValue(pending);
    s.prisma.referral.updateMany.mockResolvedValue({ count: 0 });
    await s.service.onQualifyingEvent('cli', 'case_published');
    expect(s.provider.creditCustomerBalance).not.toHaveBeenCalled();
    expect(s.prisma.referral.update).not.toHaveBeenCalled();
  });

  it('ignores an event that is not the referee role rule', async () => {
    const s = setup();
    s.prisma.referral.findUnique.mockResolvedValue(pending);
    await s.service.onQualifyingEvent('cli', 'subscription_payment');
    expect(s.prisma.referral.updateMany).not.toHaveBeenCalled();
  });

  it('keeps qualified when the attorney has no Stripe customer yet', async () => {
    const s = setup();
    s.prisma.referral.findUnique.mockResolvedValue({
      ...pending,
      status: 'qualified',
    });
    s.prisma.referral.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...pending, status: 'qualified', ...data }),
    );
    const after = await s.service.tryReward('r1');
    expect(s.provider.creditCustomerBalance).not.toHaveBeenCalled();
    const data = s.prisma.referral.update.mock.calls[0][0].data;
    expect(data.status).toBeUndefined();
    expect(data.referrer_reward.issuedAt).toBeUndefined();
    // The client's promotion day is available right away.
    expect(data.referee_reward.issuedAt).toBeDefined();
    expect(after?.status).toBe('qualified');
  });

  it('never throws into billing / cases', async () => {
    const s = setup();
    s.prisma.referral.findUnique.mockRejectedValue(new Error('db down'));
    await expect(
      s.service.onQualifyingEvent('cli', 'case_published'),
    ).resolves.toBeUndefined();
  });

  it('a payment retries rewards waiting for that user', async () => {
    const s = setup();
    s.prisma.referral.findUnique.mockResolvedValue(null);
    s.prisma.referral.findMany.mockResolvedValue([{ id: 'r9' }]);
    const spy = jest.spyOn(s.service, 'tryReward').mockResolvedValue(null);
    await s.service.onQualifyingEvent('att', 'subscription_payment');
    expect(spy).toHaveBeenCalledWith('r9');
  });
});

describe('integration helpers', () => {
  it('pendingReferralDiscountPercent: only before the first paid invoice', async () => {
    const s = setup();
    s.prisma.referral.findUnique.mockResolvedValue({
      status: 'pending',
      referee_role: 'attorney',
      referee_reward: { type: 'percent_first_invoice', value: 20 },
    });
    expect(await s.service.pendingReferralDiscountPercent('a')).toBe(20);
    s.prisma.payment.count.mockResolvedValue(1);
    expect(await s.service.pendingReferralDiscountPercent('a')).toBe(0);
  });

  it('counts, consumes and restores promotion credit days', async () => {
    const s = setup();
    const rows = [
      {
        id: 'r1',
        referrer_id: 'cli',
        referee_id: 'x',
        referrer_reward: {
          type: 'promotion_days',
          value: 1,
          issuedAt: '2026-10-01T00:00:00Z',
        },
        referee_reward: {},
      },
      {
        id: 'r2',
        referrer_id: 'y',
        referee_id: 'cli',
        referrer_reward: {},
        referee_reward: {
          type: 'promotion_days',
          value: 2,
          issuedAt: '2026-10-01T00:00:00Z',
        },
      },
      {
        id: 'r3',
        referrer_id: 'cli',
        referee_id: 'z',
        // Not issued yet (referral still pending): not spendable.
        referrer_reward: { type: 'promotion_days', value: 5 },
        referee_reward: {},
      },
    ];
    s.prisma.referral.findMany.mockResolvedValue(rows);
    expect(await s.service.promotionCreditDays('cli')).toBe(3);

    const tx = s.prisma as unknown as Prisma.TransactionClient;
    expect(await s.service.consumePromotionCredits(tx, 'cli', 'p1', 2)).toBe(2);
    const calls = (s.prisma.referral.update.mock.calls as unknown[][]).map(
      (c) => c[0],
    );
    expect(calls[0]).toEqual({
      where: { id: 'r1' },
      data: {
        referrer_reward: expect.objectContaining({ uses: { p1: 1 } }),
      },
    });
    expect(calls[1]).toEqual({
      where: { id: 'r2' },
      data: { referee_reward: expect.objectContaining({ uses: { p1: 1 } }) },
    });

    s.prisma.referral.update.mockClear();
    rows[0].referrer_reward = {
      ...rows[0].referrer_reward,
      uses: { p1: 1 },
    } as never;
    expect(await s.service.restorePromotionCredits(tx, 'cli', 'p1')).toBe(1);
    expect(s.prisma.referral.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { referrer_reward: expect.objectContaining({ uses: {} }) },
    });
  });

  it('remainingDays subtracts uses', () => {
    expect(
      remainingDays({ type: 'promotion_days', value: 3, uses: { a: 2 } }),
    ).toBe(1);
    expect(remainingDays({ type: 'balance_cents', value: 3 })).toBe(0);
  });
});
