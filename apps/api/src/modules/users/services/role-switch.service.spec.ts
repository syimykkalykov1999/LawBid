import { ConflictException, HttpException } from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { AUTH_EVENT_TYPES } from '../../auth/auth.public';
import { RoleSwitchService } from './role-switch.service';

interface BidCountArgs {
  where: { status: string };
}

/** Owner 2026-11-05: Settings → Account «Сменить профиль». */
describe('RoleSwitchService', () => {
  const userId = 'u1';

  function build(over: { role?: string; limit?: number; flag?: boolean } = {}) {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const delegates = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          role: over.role ?? 'attorney',
          status: 'active',
          deleted_at: null,
          onboarding_state: { completed_at: new Date() },
        }),
        updateMany,
      },
      case: { count: jest.fn().mockResolvedValue(0) },
      bid: { count: jest.fn().mockResolvedValue(0) },
      caseDispute: { count: jest.fn().mockResolvedValue(0) },
      consultation: { count: jest.fn().mockResolvedValue(0) },
      subscription: { findUnique: jest.fn().mockResolvedValue(null) },
      clientSubscription: { findUnique: jest.fn().mockResolvedValue(null) },
      assistantMembership: { count: jest.fn().mockResolvedValue(0) },
      firmMember: { count: jest.fn().mockResolvedValue(0) },
      clientProfile: { findUnique: jest.fn().mockResolvedValue(null) },
      attorneyProfile: { findUnique: jest.fn().mockResolvedValue(null) },
      authEvent: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      onboardingState: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      ...delegates,
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(delegates)),
    };
    const me = {
      id: userId,
      missing: [] as string[],
      onboarding: { completedAt: new Date().toISOString() as string | null },
    };
    const onboarding = { getMe: jest.fn().mockResolvedValue(me) };
    const events = { record: jest.fn().mockResolvedValue(undefined) };
    const revocation = {
      revokeOtherChainsForUser: jest.fn().mockResolvedValue([]),
    };
    const flags = { isEnabled: jest.fn().mockResolvedValue(over.flag ?? true) };
    const settings = { number: jest.fn().mockResolvedValue(over.limit ?? 2) };
    const entitlements = {
      invalidateUser: jest.fn().mockResolvedValue(undefined),
    };
    const service = new RoleSwitchService(
      prisma as never,
      onboarding as never,
      events as never,
      revocation as never,
      flags as never,
      settings as never,
      entitlements as never,
    );
    return {
      service,
      prisma,
      me,
      onboarding,
      events,
      revocation,
      entitlements,
    };
  }

  const meta = { ip: '203.0.113.9', userAgent: 'ua', sessionChainId: 'chain' };

  it('flag off: the route does not exist', async () => {
    const { service } = build({ flag: false });
    await expect(service.assertEnabled()).rejects.toMatchObject({
      status: 404,
    });
  });

  it('switches: compare-and-set role, audit event, other sessions end', async () => {
    const { service, prisma, events, revocation, entitlements } = build();
    await service.switchTo(userId, 'client', meta);
    expect(entitlements.invalidateUser).toHaveBeenCalledWith(userId);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: userId, role: 'attorney' },
      data: { role: 'client' },
    });
    expect(events.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        eventType: AUTH_EVENT_TYPES.ROLE_SWITCHED,
        meta: { from: 'attorney', to: 'client' },
      }),
      expect.anything(),
    );
    expect(revocation.revokeOtherChainsForUser).toHaveBeenCalledWith(
      userId,
      'chain',
      'role_switched',
    );
  });

  it('never deletes a profile', async () => {
    const { service, prisma } = build();
    await service.switchTo(userId, 'client', meta);
    for (const model of [prisma.clientProfile, prisma.attorneyProfile]) {
      expect(model).not.toHaveProperty('delete');
      expect(model).not.toHaveProperty('deleteMany');
    }
    expect(prisma.onboardingState.upsert).not.toHaveBeenCalled();
  });

  it('same role: nothing happens', async () => {
    const { service, prisma, events } = build();
    await service.switchTo(userId, 'attorney', meta);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(events.record).not.toHaveBeenCalled();
  });

  it('a lost race does not switch twice', async () => {
    const { service, prisma, revocation } = build();
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.switchTo(userId, 'client', meta),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(revocation.revokeOtherChainsForUser).not.toHaveBeenCalled();
  });

  it.each(['assistant', null])('role %s cannot switch', async (role) => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue({
      role,
      status: 'active',
      deleted_at: null,
    });
    await expect(service.preview(userId)).rejects.toMatchObject({
      response: { code: ErrorCode.ROLE_SWITCH_NOT_ALLOWED },
    });
  });

  it('a suspended account cannot switch', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue({
      role: 'client',
      status: 'suspended',
      deleted_at: null,
    });
    await expect(
      service.switchTo(userId, 'attorney', meta),
    ).rejects.toMatchObject({
      response: { code: ErrorCode.ROLE_SWITCH_NOT_ALLOWED },
    });
  });

  describe('blockers of the profile being left', () => {
    it('client: unfinished cases, disputes, consultations', async () => {
      const { service, prisma } = build({ role: 'client' });
      prisma.case.count.mockResolvedValue(1);
      prisma.caseDispute.count.mockResolvedValue(1);
      prisma.consultation.count.mockResolvedValue(1);
      expect(await service.blockers(userId, 'client')).toEqual([
        'active_cases',
        'open_disputes',
        'upcoming_consultations',
      ]);
      expect(prisma.bid.count).not.toHaveBeenCalled();
      expect(prisma.case.count.mock.calls[0][0].where.status.in).toEqual([
        'open',
        'in_progress',
        'pending_completion',
        'disputed',
      ]);
    });

    it('attorney: accepted bids count as cases, active ones as bids', async () => {
      const { service, prisma } = build();
      prisma.bid.count.mockImplementation(({ where }: BidCountArgs) =>
        Promise.resolve(where.status === 'accepted' ? 1 : 2),
      );
      expect(await service.blockers(userId, 'attorney')).toEqual([
        'active_cases',
        'active_bids',
      ]);
      expect(prisma.case.count).not.toHaveBeenCalled();
    });

    it('attorney: team and firm', async () => {
      const { service, prisma } = build();
      prisma.assistantMembership.count.mockResolvedValue(1);
      prisma.firmMember.count.mockResolvedValue(1);
      expect(await service.blockers(userId, 'attorney')).toEqual([
        'assistants',
        'firm',
      ]);
    });

    it.each([
      [
        {
          status: 'active',
          stripe_subscription_id: 'x',
          cancel_at_period_end: false,
        },
        true,
      ],
      [
        {
          status: 'past_due',
          stripe_subscription_id: 'x',
          cancel_at_period_end: false,
        },
        true,
      ],
      // Cancelled: runs to the end of the period, does not renew.
      [
        {
          status: 'active',
          stripe_subscription_id: 'x',
          cancel_at_period_end: true,
        },
        false,
      ],
      // Payments off: a trial row with no Stripe subscription.
      [
        {
          status: 'trialing',
          stripe_subscription_id: null,
          cancel_at_period_end: false,
        },
        false,
      ],
      [
        {
          status: 'canceled',
          stripe_subscription_id: 'x',
          cancel_at_period_end: false,
        },
        false,
      ],
    ])('paid subscription %j → %s', async (row, blocks) => {
      const a = build();
      a.prisma.subscription.findUnique.mockResolvedValue(row);
      expect(await a.service.blockers(userId, 'attorney')).toEqual(
        blocks ? ['paid_subscription'] : [],
      );
      const c = build({ role: 'client' });
      c.prisma.clientSubscription.findUnique.mockResolvedValue(row);
      expect(await c.service.blockers(userId, 'client')).toEqual(
        blocks ? ['paid_subscription'] : [],
      );
    });

    it('a blocker refuses the switch with the list', async () => {
      const { service, prisma } = build();
      prisma.assistantMembership.count.mockResolvedValue(1);
      await expect(
        service.switchTo(userId, 'client', meta),
      ).rejects.toMatchObject({
        status: 409,
        response: {
          code: ErrorCode.ROLE_SWITCH_BLOCKED,
          details: { blockers: ['assistants'] },
        },
      });
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('daily limit', () => {
    it('refuses with the time left and counts only real switches', async () => {
      const { service, prisma } = build({ limit: 1 });
      const anHourAgo = new Date(Date.now() - 3_600_000);
      prisma.authEvent.findMany.mockResolvedValue([{ created_at: anHourAgo }]);
      const err = await service
        .switchTo(userId, 'client', meta)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      const http = err as HttpException;
      expect(http.getStatus()).toBe(429);
      const body = http.getResponse() as {
        code: string;
        details: { retryAfterSeconds: number };
      };
      expect(body.code).toBe(ErrorCode.RATE_LIMITED);
      expect(body.details.retryAfterSeconds).toBeGreaterThan(22 * 3600);
      expect(prisma.authEvent.findMany.mock.calls[0][0].where.event_type).toBe(
        AUTH_EVENT_TYPES.ROLE_SWITCHED,
      );
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('a limit below 1 counts as 1', async () => {
      const { service, prisma } = build({ limit: 0 });
      await service.preview(userId);
      expect(prisma.authEvent.findMany.mock.calls[0][0].take).toBe(1);
    });
  });

  describe('onboarding after the switch', () => {
    it('unfinished new profile: reopens at the profile step', async () => {
      const { service, prisma, me } = build();
      me.missing = ['state'];
      await service.switchTo(userId, 'client', meta);
      expect(prisma.onboardingState.upsert).toHaveBeenCalledWith({
        where: { user_id: userId },
        create: { user_id: userId, current_step: 'profile' },
        update: { current_step: 'profile', completed_at: null },
      });
    });

    it('a pending consent alone does not reopen it (the guard handles it)', async () => {
      const { service, prisma, me } = build();
      me.missing = ['consents'];
      await service.switchTo(userId, 'client', meta);
      expect(prisma.onboardingState.upsert).not.toHaveBeenCalled();
    });

    it('finished profile with open onboarding: marks it finished', async () => {
      const { service, prisma, me } = build();
      me.onboarding.completedAt = null;
      await service.switchTo(userId, 'client', meta);
      expect(prisma.onboardingState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { completed_at: expect.any(Date) },
        }),
      );
    });
  });

  describe('role screen during the new profile’s onboarding', () => {
    const open = (role: string) => ({
      role,
      status: 'active',
      deleted_at: null,
      onboarding_state: { completed_at: null },
    });

    it('never switched: the normal picker applies', async () => {
      const { service, prisma } = build();
      prisma.user.findUnique.mockResolvedValue(open('attorney'));
      expect(await service.pickDuringOnboarding(userId, 'client', meta)).toBe(
        false,
      );
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('switched before: goes back, logged apart, nothing deleted', async () => {
      const { service, prisma, events, revocation } = build();
      prisma.user.findUnique.mockResolvedValue(open('attorney'));
      prisma.authEvent.findFirst.mockResolvedValue({ id: 'e1' });
      expect(await service.pickDuringOnboarding(userId, 'client', meta)).toBe(
        true,
      );
      expect(prisma.user.updateMany).toHaveBeenCalledTimes(1);
      expect(events.record.mock.calls[0][0].eventType).toBe(
        AUTH_EVENT_TYPES.ROLE_SWITCH_REVERTED,
      );
      expect(revocation.revokeOtherChainsForUser).not.toHaveBeenCalled();
    });

    it('finished onboarding, same role or assistant: not this path', async () => {
      const { service, prisma } = build();
      expect(await service.pickDuringOnboarding(userId, 'client', meta)).toBe(
        false,
      );
      prisma.user.findUnique.mockResolvedValue(open('attorney'));
      expect(await service.pickDuringOnboarding(userId, 'attorney', meta)).toBe(
        false,
      );
      expect(
        await service.pickDuringOnboarding(userId, 'assistant', meta),
      ).toBe(false);
    });
  });
});
