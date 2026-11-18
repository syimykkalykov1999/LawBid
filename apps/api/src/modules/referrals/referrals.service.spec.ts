import { Prisma } from '../../generated/prisma/client';
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
  presentReward,
  remainingDays,
  rewardFromInput,
  roundDays,
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
    // Both sides of a referral are live accounts unless a test says otherwise.
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ status: 'active', deleted_at: null }),
    },
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
    debitCustomerBalance: jest.fn().mockResolvedValue(undefined),
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

  it('share URL: app link when configured, else lawbid.dev', () => {
    const { service, config } = setup();
    expect(service.shareUrl('ABCDEFG')).toBe('https://lawbid.dev/r/ABCDEFG');
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

  it('accepts small rewards: 0.5 day, whole cents (owner 2026-10-05)', () => {
    expect(
      validateReward('referrer', 'client', {
        type: 'promotion_days',
        value: 0.5,
      }),
    ).toBeNull();
    expect(
      validateReward('referee', 'client', {
        type: 'promotion_days',
        value: 0.01,
      }),
    ).toBeNull();
    // Percent stays whole.
    expect(
      validateReward('referee', 'attorney', {
        type: 'percent_first_invoice',
        value: 0.05,
      }),
    ).toMatch(/integer/);
    // $0.05 is 5 whole cents.
    expect(
      validateReward('referrer', 'attorney', {
        type: 'balance_cents',
        value: 5,
      }),
    ).toBeNull();
    expect(
      validateReward('referrer', 'attorney', {
        type: 'balance_cents',
        value: 0.5,
      }),
    ).toMatch(/integer/);
    expect(
      validateReward('referrer', 'client', {
        type: 'promotion_days',
        value: 0.005,
      }),
    ).toMatch(/2 decimals/);
  });

  it('remaining fractional days never show float noise', () => {
    expect(
      remainingDays({
        type: 'promotion_days',
        value: 0.3,
        issuedAt: 'x',
        uses: { a: 0.1, b: 0.1 },
      }),
    ).toBe(0.1);
    expect(roundDays(0.1 + 0.2)).toBe(0.3);
  });

  it('API keeps whole days in value and the exact days in amount', () => {
    expect(presentReward({ type: 'promotion_days', value: 0.5 })).toEqual({
      type: 'promotion_days',
      value: 0,
      amount: 0.5,
    });
    expect(presentReward({ type: 'balance_cents', value: 5 })).toEqual({
      type: 'balance_cents',
      value: 5,
      amount: 5,
    });
    expect(
      rewardFromInput({ type: 'promotion_days', value: 0, amount: 1.5 }),
    ).toEqual({ type: 'promotion_days', value: 1.5 });
    expect(rewardFromInput({ type: 'promotion_days', value: 2 })).toEqual({
      type: 'promotion_days',
      value: 2,
    });
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
      reward: { type: 'promotion_days', value: 1, amount: 1 },
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
    created_at: new Date(),
    referrer_reward: { type: 'balance_cents', value: 10_000 },
    referee_reward: { type: 'promotion_days', value: 1 },
  };

  it('owner 2026-10-24: a client qualifies on the first COMPLETED case, not a published one', async () => {
    const s = setup();
    s.prisma.referral.findUnique.mockResolvedValue(pending);
    await s.service.onQualifyingEvent('cli', 'case_published');
    expect(s.prisma.referral.updateMany).not.toHaveBeenCalled();
  });

  it('owner 2026-10-24: with clientQualifyOn = case_published the published case qualifies', async () => {
    const s = setup();
    s.prisma.appConfig.findUnique.mockResolvedValue({
      key: 'referrals.program',
      value: {
        ...DEFAULT_REFERRAL_SETTINGS,
        enabled: true,
        clientQualifyOn: 'case_published',
      },
    });
    s.prisma.referral.findUnique.mockResolvedValue(pending);
    s.prisma.referral.updateMany.mockResolvedValue({ count: 0 });
    await s.service.onQualifyingEvent('cli', 'case_published');
    expect(s.prisma.referral.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'qualified' }),
      }),
    );
  });

  it('owner 2026-10-24: after the end date (qualifyWindowDays) the referral is rejected, no reward', async () => {
    const s = setup();
    s.prisma.referral.findUnique.mockResolvedValue({
      ...pending,
      created_at: new Date(Date.now() - 91 * DAY),
    });
    s.prisma.referral.updateMany.mockResolvedValue({ count: 1 });
    await s.service.onQualifyingEvent('cli', 'case_completed');
    expect(s.prisma.referral.updateMany).toHaveBeenCalledTimes(1);
    expect(s.prisma.referral.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', status: 'pending' },
      data: { status: 'rejected', rejected_reason: 'qualify_window_expired' },
    });
    expect(s.provider.creditCustomerBalance).not.toHaveBeenCalled();
  });

  it('owner 2026-10-24: qualifyWindowDays = 0 means no end date', async () => {
    const s = setup();
    s.prisma.appConfig.findUnique.mockResolvedValue({
      key: 'referrals.program',
      value: {
        ...DEFAULT_REFERRAL_SETTINGS,
        enabled: true,
        qualifyWindowDays: 0,
      },
    });
    s.prisma.referral.findUnique.mockResolvedValue({
      ...pending,
      created_at: new Date(Date.now() - 900 * DAY),
    });
    s.prisma.referral.updateMany.mockResolvedValue({ count: 0 });
    await s.service.onQualifyingEvent('cli', 'case_completed');
    expect(s.prisma.referral.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'qualified' }),
      }),
    );
  });

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
    await s.service.onQualifyingEvent('cli', 'case_completed');
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
    await s.service.onQualifyingEvent('cli', 'case_completed');
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
      s.service.onQualifyingEvent('cli', 'case_completed'),
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

  it('PM2 (batch 8): a restored promotion keeps a note, and a revived one spends the same days again', async () => {
    const s = setup();
    const row = {
      id: 'r1',
      referrer_id: 'cli',
      referee_id: 'x',
      status: 'rewarded',
      referrer_reward: {
        type: 'promotion_days',
        value: 2,
        issuedAt: '2026-10-01T00:00:00Z',
        uses: { p1: 1 },
      } as Record<string, unknown>,
      referee_reward: {},
    };
    s.prisma.referral.findMany.mockImplementation(() => Promise.resolve([row]));
    s.prisma.referral.update.mockImplementation(
      ({ data }: { data: { referrer_reward: Record<string, unknown> } }) => {
        row.referrer_reward = data.referrer_reward;
        return Promise.resolve(row);
      },
    );
    const tx = s.prisma as unknown as Prisma.TransactionClient;
    expect(await s.service.restorePromotionCredits(tx, 'cli', 'p1')).toBe(1);
    expect(row.referrer_reward).toMatchObject({
      uses: {},
      restored: { p1: 1 },
    });
    expect(await s.service.promotionCreditDays('cli')).toBe(2);

    // The checkout is paid after all: the day is taken again.
    expect(await s.service.reconsumePromotionCredits(tx, 'cli', 'p1')).toBe(
      true,
    );
    expect(row.referrer_reward).toMatchObject({ uses: { p1: 1 } });
    expect(
      (row.referrer_reward.restored as Record<string, number>)?.p1,
    ).toBeUndefined();
    expect(await s.service.promotionCreditDays('cli')).toBe(1);
  });

  it('PM2 (batch 8): a revive whose days were spent elsewhere meanwhile is refused', async () => {
    const s = setup();
    const row = {
      id: 'r1',
      referrer_id: 'cli',
      referee_id: 'x',
      status: 'rewarded',
      referrer_reward: {
        type: 'promotion_days',
        value: 1,
        issuedAt: '2026-10-01T00:00:00Z',
        uses: { p2: 1 },
        restored: { p1: 1 },
      } as Record<string, unknown>,
      referee_reward: {},
    };
    s.prisma.referral.findMany.mockResolvedValue([row]);
    const tx = s.prisma as unknown as Prisma.TransactionClient;
    expect(await s.service.reconsumePromotionCredits(tx, 'cli', 'p1')).toBe(
      false,
    );
    // Nothing is taken from the other promotion.
    const writes = (s.prisma.referral.update.mock.calls as unknown[][]).map(
      (c) => c[0] as { data: { referrer_reward?: { uses?: unknown } } },
    );
    for (const w of writes) {
      expect(w.data.referrer_reward?.uses).toEqual({ p2: 1 });
    }
  });
});

describe('RF1/RF2 (batch 8, audit 2026-11-17)', () => {
  const qualified = {
    id: 'r1',
    referrer_id: 'att',
    referee_id: 'ref',
    status: 'qualified',
    referee_role: 'attorney',
    created_at: new Date(Date.now() - 5 * DAY),
    qualified_at: new Date(Date.now() - DAY),
    referrer_reward: { type: 'balance_cents', value: 10_000 },
    referee_reward: { type: 'percent_first_invoice', value: 50 },
  };

  it('tryReward pays nobody when the referee account was deleted', async () => {
    const s = setup();
    s.prisma.referral.findUnique.mockResolvedValue(qualified);
    s.prisma.user.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'ref'
            ? { status: 'deleted', deleted_at: new Date() }
            : { status: 'active', deleted_at: null },
        ),
    );
    s.prisma.stripeCustomer.findUnique.mockResolvedValue({
      stripe_customer_id: 'cus_1',
    });
    s.prisma.referral.updateMany.mockResolvedValue({ count: 1 });
    await s.service.tryReward('r1');
    expect(s.provider.creditCustomerBalance).not.toHaveBeenCalled();
    expect(s.prisma.referral.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', status: 'qualified' },
      data: { status: 'rejected', rejected_reason: 'account_closed' },
    });
  });

  it('tryReward waits (stays qualified) while the referrer is suspended', async () => {
    const s = setup();
    s.prisma.referral.findUnique.mockResolvedValue(qualified);
    s.prisma.user.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'att'
            ? { status: 'suspended', deleted_at: null }
            : { status: 'active', deleted_at: null },
        ),
    );
    s.prisma.stripeCustomer.findUnique.mockResolvedValue({
      stripe_customer_id: 'cus_1',
    });
    await s.service.tryReward('r1');
    expect(s.provider.creditCustomerBalance).not.toHaveBeenCalled();
    expect(s.prisma.referral.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'rewarded' }),
      }),
    );
  });

  function refundSetup(referral: Record<string, unknown>) {
    const s = setup();
    const p = s.prisma as unknown as {
      payment: Record<string, jest.Mock>;
    };
    p.payment.findUnique = jest.fn().mockResolvedValue({
      id: 'pay1',
      user_id: 'ref',
      stripe_invoice_id: 'in_1',
      created_at: new Date(Date.now() - 2 * DAY),
    });
    p.payment.findFirst = jest.fn().mockResolvedValue({ id: 'pay1' });
    s.prisma.referral.findUnique.mockResolvedValue(referral);
    s.prisma.referral.updateMany.mockResolvedValue({ count: 1 });
    return s;
  }

  it('a refund of the qualifying invoice rejects a reward not paid yet', async () => {
    const s = refundSetup(qualified);
    await s.service.onPaymentRefunded('pay1');
    expect(s.prisma.referral.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', status: { in: ['qualified', 'rewarded'] } },
      data: { status: 'rejected', rejected_reason: 'payment_refunded' },
    });
  });

  const credited = {
    ...qualified,
    status: 'rewarded',
    referrer_reward: {
      type: 'balance_cents',
      value: 10_000,
      issuedAt: '2026-11-10T00:00:00Z',
    },
  };

  it('a refund of the qualifying invoice after a balance credit: the credit is debited back once', async () => {
    const s = refundSetup(credited);
    s.prisma.stripeCustomer.findUnique.mockResolvedValue({
      stripe_customer_id: 'cus_1',
    });
    await s.service.onPaymentRefunded('pay1');
    expect(s.provider.debitCustomerBalance).toHaveBeenCalledWith(
      'cus_1',
      10_000,
      expect.any(String),
      'ref-reverse:r1:referrer',
      { reversal_of: 'referral-reward:r1:referrer' },
    );
    expect(s.provider.debitCustomerBalance).toHaveBeenCalledTimes(1);
    expect(s.prisma.referral.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', status: { in: ['qualified', 'rewarded'] } },
      data: {
        status: 'rejected',
        rejected_reason:
          'payment_refunded: Stripe balance credit reversed (referrer 10000 cents)',
      },
    });
  });

  it('a balance credit that cannot be debited back is listed for a manual reversal', async () => {
    const s = refundSetup(credited);
    // No Stripe customer row: nothing to debit.
    await s.service.onPaymentRefunded('pay1');
    expect(s.provider.debitCustomerBalance).not.toHaveBeenCalled();
    expect(s.prisma.referral.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', status: { in: ['qualified', 'rewarded'] } },
      data: {
        status: 'rejected',
        rejected_reason:
          'payment_refunded: Stripe balance credit could not be reversed (referrer 10000 cents), reverse it by hand',
      },
    });
  });

  it('a refund of a later invoice (or a non-subscription payment) leaves the reward alone', async () => {
    const s = refundSetup({ ...qualified, status: 'rewarded' });
    const p = s.prisma as unknown as { payment: Record<string, jest.Mock> };
    p.payment.findFirst.mockResolvedValue({ id: 'pay0' });
    await s.service.onPaymentRefunded('pay1');
    p.payment.findUnique.mockResolvedValue({
      id: 'pay2',
      user_id: 'ref',
      stripe_invoice_id: null,
      created_at: new Date(),
    });
    await s.service.onPaymentRefunded('pay2');
    expect(s.prisma.referral.updateMany).not.toHaveBeenCalled();
  });

  it('RF2: the invitation limit is counted and the referral created in one serializable transaction', async () => {
    const s = setup();
    const now = Date.now();
    s.prisma.appConfig.findUnique.mockResolvedValue({
      key: 'referrals.program',
      value: {
        ...DEFAULT_REFERRAL_SETTINGS,
        enabled: true,
        maxInvitesPerReferrer: 3,
      },
    });
    s.prisma.user.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'referee'
            ? { id: 'referee', role: 'client', created_at: new Date(now) }
            : { role: 'attorney', status: 'active', deleted_at: null },
        ),
    );
    s.prisma.referralCode.findUnique.mockResolvedValue({
      user_id: 'referrer',
      code: 'ABCDEFG',
    });
    s.prisma.referral.findUnique.mockResolvedValue(null);
    const tx = {
      referral: {
        count: jest.fn().mockResolvedValue(3),
        create: jest.fn(),
      },
    };
    const opts: unknown[] = [];
    s.prisma.$transaction.mockImplementation(
      (fn: (t: typeof tx) => Promise<unknown>, o: unknown) => {
        opts.push(o);
        return fn(tx);
      },
    );
    await expect(s.service.apply('referee', 'abcdefg')).rejects.toMatchObject({
      response: expect.objectContaining({
        details: expect.objectContaining({ reason: 'limit_reached' }),
      }),
    });
    expect(tx.referral.count).toHaveBeenCalled();
    expect(s.prisma.referral.count).not.toHaveBeenCalled();
    expect(opts[0]).toMatchObject({ isolationLevel: 'Serializable' });
  });
});
