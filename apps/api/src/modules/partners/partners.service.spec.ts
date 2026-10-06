import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  PartnersService,
  referredStatusOf,
  shortName,
} from './partners.service';
import {
  DEFAULT_PARTNER_SETTINGS,
  effectiveRates,
  PARTNER_TERMS_VERSION,
  parsePartnerSettings,
  periodOf,
} from './partners.settings';

const DAY = 86_400_000;
/** Owner 2026-10-05 (legal): joining needs the rules accepted. */
const ACCEPT = { termsAccepted: true, ip: '203.0.113.9' };

function setup(
  opts: {
    partner?: Partial<Record<string, unknown>> | null;
    referral?: Partial<Record<string, unknown>> | null;
    settings?: Record<string, unknown>;
  } = {},
) {
  const partner =
    opts.partner === null
      ? null
      : {
          id: 'p1',
          user_id: 'blogger',
          status: 'active',
          attorney_rate_cents: null,
          client_rate_cents: null,
          monthly_base_cents: 0,
          client_rule: null,
          hold_days: null,
          ...opts.partner,
        };
  const referral =
    opts.referral === null
      ? null
      : {
          id: 'r1',
          referrer_id: 'blogger',
          referee_id: 'att',
          referee_role: 'attorney',
          status: 'pending',
          ...opts.referral,
        };
  const prisma = {
    appConfig: {
      findUnique: jest
        .fn()
        .mockResolvedValue(opts.settings ? { value: opts.settings } : null),
    },
    partner: {
      findUnique: jest.fn().mockResolvedValue(partner),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'p-new' }),
      update: jest.fn().mockResolvedValue({}),
    },
    referral: { findUnique: jest.fn().mockResolvedValue(referral) },
    partnerCommission: {
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'c1', created_at: new Date(), ...data }),
        ),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    payment: { count: jest.fn().mockResolvedValue(0) },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'blogger',
        role: 'client',
        status: 'active',
        deleted_at: null,
        ui_language: 'en',
      }),
    },
    referralCode: {
      findUnique: jest.fn().mockResolvedValue({ code: 'ABCD1234' }),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
  );
  const notifications = { emit: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn().mockReturnValue('https://lawbid.dev') };
  const svc = new PartnersService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
    notifications as never,
  );
  return { svc, prisma, notifications };
}

describe('partner settings', () => {
  it('joining is open by default; unknown modes fall back', () => {
    expect(parsePartnerSettings(null).joinMode).toBe('open');
    expect(parsePartnerSettings({ joinMode: 'approval' }).joinMode).toBe(
      'approval',
    );
    expect(parsePartnerSettings({ joinMode: 'closed' }).joinMode).toBe(
      'closed',
    );
    expect(parsePartnerSettings({ joinMode: 'maybe' }).joinMode).toBe('open');
  });

  it('defaults field by field', () => {
    expect(parsePartnerSettings(null)).toEqual(DEFAULT_PARTNER_SETTINGS);
    const s = parsePartnerSettings({
      attorneyRateCents: 9_900,
      clientRule: 'case_published',
      holdDays: -1,
      texts: { ru: { title: 'Партнёры' } },
    });
    expect(s.attorneyRateCents).toBe(9_900);
    expect(s.clientRule).toBe('case_published');
    expect(s.holdDays).toBe(DEFAULT_PARTNER_SETTINGS.holdDays);
    expect(s.texts.ru.title).toBe('Партнёры');
    expect(s.texts.en.title).toBe(DEFAULT_PARTNER_SETTINGS.texts.en.title);
  });

  it('partner overrides win over program defaults', () => {
    const rates = effectiveRates(DEFAULT_PARTNER_SETTINGS, {
      attorney_rate_cents: 100,
      client_rate_cents: null,
      monthly_base_cents: 50_000,
      client_rule: 'case_published',
      hold_days: 0,
    });
    expect(rates).toEqual({
      attorneyRateCents: 100,
      clientRateCents: DEFAULT_PARTNER_SETTINGS.clientRateCents,
      monthlyBaseCents: 50_000,
      clientRule: 'case_published',
      holdDays: 0,
    });
  });

  it('period and names', () => {
    expect(periodOf(new Date('2026-10-05T23:59:00Z'))).toBe('2026-10');
    expect(shortName('Anna Karenina')).toBe('Anna K.');
    expect(shortName('Cher')).toBe('Cher');
    expect(referredStatusOf(undefined)).toBe('joined');
    expect(referredStatusOf({ status: 'held' } as never)).toBe('qualified');
    expect(referredStatusOf({ status: 'paid' } as never)).toBe('paid');
    expect(referredStatusOf({ status: 'reversed' } as never)).toBe('reversed');
  });
});

describe('PartnersService.onQualifyingEvent', () => {
  it('accrues the attorney rate on the first paid invoice, held for the program hold', async () => {
    const { svc, prisma, notifications } = setup();
    const now = new Date('2026-10-05T12:00:00Z');
    const c = await svc.onQualifyingEvent('att', 'subscription_payment', now);
    expect(c).toMatchObject({
      kind: 'attorney_subscription',
      amount_cents: DEFAULT_PARTNER_SETTINGS.attorneyRateCents,
      status: 'held',
      event_ref: 'referral:r1:attorney_subscription',
      period: '2026-10',
    });
    expect(
      prisma.partnerCommission.create.mock.calls[0][0].data.hold_until,
    ).toEqual(
      new Date(now.getTime() + DEFAULT_PARTNER_SETTINGS.holdDays * DAY),
    );
    expect(notifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'partner_commission',
        recipientId: 'blogger',
      }),
    );
  });

  it('ignores other events for an attorney and approves at once when the hold is 0', async () => {
    const { svc, prisma } = setup({
      partner: { hold_days: 0, attorney_rate_cents: 123 },
    });
    expect(await svc.onQualifyingEvent('att', 'case_published')).toBeNull();
    const c = await svc.onQualifyingEvent('att', 'subscription_payment');
    expect(c).toMatchObject({ status: 'approved', amount_cents: 123 });
    expect(
      prisma.partnerCommission.create.mock.calls[0][0].data.hold_until,
    ).toBeNull();
  });

  it('a client pays on the rule (case_published by default — owner 2026-10-05 (legal): never the hire; bid_accepted when set)', async () => {
    expect(DEFAULT_PARTNER_SETTINGS.clientRule).toBe('case_published');
    const a = setup({ referral: { referee_role: 'client' } });
    expect(await a.svc.onQualifyingEvent('att', 'bid_accepted')).toBeNull();
    expect(
      await a.svc.onQualifyingEvent('att', 'case_published'),
    ).toMatchObject({
      kind: 'client_qualified',
      amount_cents: DEFAULT_PARTNER_SETTINGS.clientRateCents,
    });
    const b = setup({
      referral: { referee_role: 'client' },
      partner: { client_rule: 'bid_accepted' },
    });
    expect(await b.svc.onQualifyingEvent('att', 'case_published')).toBeNull();
    expect(await b.svc.onQualifyingEvent('att', 'bid_accepted')).not.toBeNull();
  });

  it('nothing without a referral, with a paused partner, a rejected referral, a disabled program or a zero rate', async () => {
    expect(
      await setup({ referral: null }).svc.onQualifyingEvent(
        'x',
        'subscription_payment',
      ),
    ).toBeNull();
    expect(
      await setup({ partner: null }).svc.onQualifyingEvent(
        'att',
        'subscription_payment',
      ),
    ).toBeNull();
    expect(
      await setup({ partner: { status: 'paused' } }).svc.onQualifyingEvent(
        'att',
        'subscription_payment',
      ),
    ).toBeNull();
    expect(
      await setup({ referral: { status: 'rejected' } }).svc.onQualifyingEvent(
        'att',
        'subscription_payment',
      ),
    ).toBeNull();
    expect(
      await setup({ settings: { enabled: false } }).svc.onQualifyingEvent(
        'att',
        'subscription_payment',
      ),
    ).toBeNull();
    expect(
      await setup({
        partner: { attorney_rate_cents: 0 },
      }).svc.onQualifyingEvent('att', 'subscription_payment'),
    ).toBeNull();
  });

  it('a second event for the same person is a no-op (unique event_ref), and errors never escape', async () => {
    const { svc, prisma } = setup();
    const { Prisma } =
      jest.requireActual<typeof import('@prisma/client')>('@prisma/client');
    prisma.partnerCommission.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 't',
      }),
    );
    expect(
      await svc.onQualifyingEvent('att', 'subscription_payment'),
    ).toBeNull();
    prisma.referral.findUnique.mockRejectedValueOnce(new Error('db down'));
    expect(
      await svc.onQualifyingEvent('att', 'subscription_payment'),
    ).toBeNull();
  });
});

describe('PartnersService.release / reverse / markPaid', () => {
  const held = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    partner_id: 'p1',
    partner_user_id: 'blogger',
    referral_id: 'r1',
    referred_user_id: 'att',
    kind: 'attorney_subscription',
    amount_cents: 5_000,
    status: 'held',
    hold_until: new Date('2026-10-01T00:00:00Z'),
    ...over,
  });

  it('releases due holds, reverses when the referral was rejected or the payment refunded', async () => {
    const { svc, prisma } = setup();
    prisma.partnerCommission.findMany.mockResolvedValueOnce([held()]);
    expect(await svc.release(new Date('2026-10-20T00:00:00Z'))).toEqual({
      approved: 1,
      reversed: 0,
    });
    expect(prisma.partnerCommission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'approved' }),
      }),
    );

    prisma.partnerCommission.findMany.mockResolvedValueOnce([held()]);
    prisma.referral.findUnique.mockResolvedValueOnce({ status: 'rejected' });
    prisma.partnerCommission.findUnique.mockResolvedValueOnce(held());
    expect(await svc.release(new Date('2026-10-20T00:00:00Z'))).toEqual({
      approved: 0,
      reversed: 1,
    });

    prisma.partnerCommission.findMany.mockResolvedValueOnce([held()]);
    prisma.payment.count.mockResolvedValueOnce(1);
    prisma.partnerCommission.findUnique.mockResolvedValueOnce(held());
    expect(await svc.release(new Date('2026-10-20T00:00:00Z'))).toEqual({
      approved: 0,
      reversed: 1,
    });
  });

  it('a paid commission reverses into a negative adjustment', async () => {
    const { svc, prisma } = setup();
    prisma.partnerCommission.findUnique.mockResolvedValueOnce(
      held({ status: 'paid' }),
    );
    expect(await svc.reverseOne('c1', 'refund')).toBe(true);
    const data = prisma.partnerCommission.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      kind: 'adjustment',
      amount_cents: -5_000,
      status: 'approved',
      event_ref: 'reverse:c1',
    });
  });

  it('markPaid pays approved rows once and tells the partner', async () => {
    const { svc, prisma, notifications } = setup();
    prisma.partnerCommission.findMany.mockResolvedValueOnce([
      held({ status: 'approved' }),
      held({ id: 'c2', status: 'approved', amount_cents: 1_000 }),
    ]);
    const res = await svc.markPaid(['c1', 'c2'], {
      payoutRef: 'ACH-1',
      actorId: 'adm',
    });
    expect(res).toEqual({
      count: 2,
      totalCents: 6_000,
      partnerUserIds: ['blogger'],
    });
    expect(notifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'partner_payout',
        recipientId: 'blogger',
        payload: expect.objectContaining({ amountCents: 6_000, count: 2 }),
      }),
    );
    expect(await svc.markPaid([], {})).toEqual({
      count: 0,
      totalCents: 0,
      partnerUserIds: [],
    });
  });

  it('accrues the monthly base once per period', async () => {
    const { svc, prisma } = setup();
    prisma.partner.findMany.mockResolvedValueOnce([
      {
        id: 'p1',
        user_id: 'blogger',
        monthly_base_cents: 20_000,
        status: 'active',
      },
    ]);
    expect(await svc.accrueMonthlyBase(new Date('2026-11-03T00:00:00Z'))).toBe(
      1,
    );
    expect(prisma.partnerCommission.create.mock.calls[0][0].data).toMatchObject(
      {
        kind: 'monthly_base',
        amount_cents: 20_000,
        status: 'approved',
        event_ref: 'base:p1:2026-11',
        period: '2026-11',
      },
    );
  });
});

describe('PartnersService.join (self-enrolment)', () => {
  it('a client who is not a partner joins and gets the program rates and a link', async () => {
    const { svc, prisma } = setup({ partner: null });
    // me() after the create: the partner row now exists.
    prisma.partner.findUnique.mockResolvedValueOnce(null).mockResolvedValue({
      id: 'p-new',
      user_id: 'blogger',
      status: 'active',
      attorney_rate_cents: null,
      client_rate_cents: null,
      monthly_base_cents: 0,
      client_rule: null,
      hold_days: null,
    });
    jest.spyOn(svc, 'totals').mockResolvedValue({
      heldCents: 0,
      approvedCents: 0,
      paidCents: 0,
      thisMonthCents: 0,
      referredCount: 0,
      qualifiedCount: 0,
    });
    jest
      .spyOn(
        svc as unknown as { referredOf: () => Promise<never[]> },
        'referredOf',
      )
      .mockResolvedValue([]);
    const me = await svc.join('blogger', ACCEPT);
    expect(prisma.partner.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 'blogger',
        status: 'active',
        note: 'self-enrolled',
        terms_version: PARTNER_TERMS_VERSION,
        terms_ip: '203.0.113.9',
      }),
    });
    expect(me.termsAcceptedVersion).toBeNull(); // the mocked row has none
    expect(me.isPartner).toBe(true);
    expect(me.canJoin).toBe(false);
    expect(me.code).toBe('ABCD1234');
    expect(me.rates.attorneyRateCents).toBe(
      DEFAULT_PARTNER_SETTINGS.attorneyRateCents,
    );
  });

  it('non-partners see canJoin and the program rates; off switches hide it', async () => {
    const on = await setup({ partner: null }).svc.me('blogger');
    expect(on).toMatchObject({
      enabled: true,
      isPartner: false,
      canJoin: true,
    });
    expect(on.rates.attorneyRateCents).toBe(5_000);
    const noSelf = await setup({
      partner: null,
      settings: { joinMode: 'closed' },
    }).svc.me('blogger');
    expect(noSelf.canJoin).toBe(false);
    const off = await setup({
      partner: null,
      settings: { enabled: false },
    }).svc.me('blogger');
    expect(off).toMatchObject({ enabled: false, canJoin: false });
  });

  it('in approval mode the request is pending: no link works until the admin approves', async () => {
    const { svc, prisma } = setup({
      partner: null,
      settings: { joinMode: 'approval' },
    });
    prisma.partner.findUnique.mockResolvedValueOnce(null).mockResolvedValue({
      id: 'p-new',
      user_id: 'blogger',
      status: 'pending',
      attorney_rate_cents: null,
      client_rate_cents: null,
      monthly_base_cents: 0,
      client_rule: null,
      hold_days: null,
    });
    jest.spyOn(svc, 'totals').mockResolvedValue({
      heldCents: 0,
      approvedCents: 0,
      paidCents: 0,
      thisMonthCents: 0,
      referredCount: 0,
      qualifiedCount: 0,
    });
    jest
      .spyOn(
        svc as unknown as { referredOf: () => Promise<never[]> },
        'referredOf',
      )
      .mockResolvedValue([]);
    const me = await svc.join('blogger', ACCEPT);
    expect(prisma.partner.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 'blogger',
        status: 'pending',
        note: 'self-enrolled',
      }),
    });
    expect(me.status).toBe('pending');
    expect(me.joinMode).toBe('approval');
    // A pending partner attributes nobody.
    expect(await svc.activePartnerOf('blogger')).toBeNull();
    // Asking again while pending is a 409.
    await expect(svc.join('blogger', ACCEPT)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('refuses when the program is off or joining is closed, for assistants, and for existing or ended partners', async () => {
    await expect(
      setup({ partner: null, settings: { enabled: false } }).svc.join(
        'b',
        ACCEPT,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      setup({ partner: null, settings: { joinMode: 'closed' } }).svc.join(
        'b',
        ACCEPT,
      ),
    ).rejects.toMatchObject({ status: 403 });
    const assistant = setup({ partner: null });
    assistant.prisma.user.findUnique.mockResolvedValue({
      id: 'a',
      role: 'assistant',
      status: 'active',
      deleted_at: null,
    });
    await expect(assistant.svc.join('a', ACCEPT)).rejects.toMatchObject({
      status: 403,
    });
    await expect(setup().svc.join('blogger', ACCEPT)).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      setup({ partner: { status: 'ended' } }).svc.join('blogger', ACCEPT),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('Owner 2026-10-05 (legal): joining without accepting the rules is a 400 and creates nothing', async () => {
    const { svc, prisma } = setup({ partner: null });
    await expect(
      svc.join('blogger', { termsAccepted: false }),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.partner.create).not.toHaveBeenCalled();
  });

  it('me: the rules, the disclosure, the accepted version and the W-9 state', async () => {
    const { svc } = setup({
      partner: {
        terms_accepted_at: new Date('2026-10-05T00:00:00Z'),
        terms_version: PARTNER_TERMS_VERSION,
        w9_received_at: null,
      },
    });
    jest.spyOn(svc, 'totals').mockResolvedValue({
      heldCents: 0,
      approvedCents: 0,
      paidCents: 0,
      thisMonthCents: 0,
      referredCount: 0,
      qualifiedCount: 0,
    });
    jest
      .spyOn(
        svc as unknown as { referredOf: () => Promise<never[]> },
        'referredOf',
      )
      .mockResolvedValue([]);
    const me = await svc.me('blogger');
    expect(me.termsVersion).toBe(PARTNER_TERMS_VERSION);
    expect(me.termsAcceptedVersion).toBe(PARTNER_TERMS_VERSION);
    expect(me.w9Required).toBe(true);
    expect(me.w9Received).toBe(false);
    expect(me.texts.disclosure).toContain('FTC');
    expect(me.texts.terms).toContain('W-9');
    // An older acceptance does not count once the version moved on.
    const old = setup({
      partner: { terms_accepted_at: new Date(), terms_version: '2020-01-01' },
    });
    jest.spyOn(old.svc, 'totals').mockResolvedValue(await svc.totals('p1'));
    jest
      .spyOn(
        old.svc as unknown as { referredOf: () => Promise<never[]> },
        'referredOf',
      )
      .mockResolvedValue([]);
    expect((await old.svc.me('blogger')).termsAcceptedVersion).toBeNull();
  });

  it('acceptTerms records the current version and the IP on an existing partner', async () => {
    const { svc, prisma } = setup();
    jest.spyOn(svc, 'me').mockResolvedValue({} as never);
    await svc.acceptTerms('blogger', '198.51.100.7');
    expect(prisma.partner.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: expect.objectContaining({
        terms_version: PARTNER_TERMS_VERSION,
        terms_ip: '198.51.100.7',
      }),
    });
    await expect(
      setup({ partner: null }).svc.acceptTerms('nobody'),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('markPaid refuses while the W-9 is missing (requireW9 on) and pays when it is off', async () => {
    const { svc, prisma } = setup();
    prisma.partnerCommission.findMany.mockResolvedValueOnce([
      {
        id: 'c1',
        partner_id: 'p1',
        partner_user_id: 'blogger',
        status: 'approved',
        amount_cents: 5_000,
      },
    ]);
    prisma.partner.findMany.mockResolvedValueOnce([{ id: 'p1' }]);
    await expect(svc.markPaid(['c1'], {})).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ message: 'W-9 not received' }),
    });
    expect(prisma.partnerCommission.updateMany).not.toHaveBeenCalled();
    const off = setup({ settings: { requireW9: false } });
    off.prisma.partnerCommission.findMany.mockResolvedValueOnce([
      {
        id: 'c1',
        partner_id: 'p1',
        partner_user_id: 'blogger',
        status: 'approved',
        amount_cents: 5_000,
      },
    ]);
    expect((await off.svc.markPaid(['c1'], {})).count).toBe(1);
    expect(off.prisma.partner.findMany).not.toHaveBeenCalled();
  });
});
