import { ForbiddenException } from '@nestjs/common';
import { AdminsController } from '../admin/admins.controller';
import { AdminBillingController } from '../admin-billing/admin-billing.controller';
import { AdminPlansController } from '../admin-billing/admin-plans.controller';
import { AdminPricingController } from '../admin-billing/admin-pricing.controller';
import { SubscriptionAdminController } from '../admin-billing/subscription-admin.controller';
import { AdminCaseManagementController } from '../admin-cases/admin-case-management.controller';
import { AdminContentController } from '../admin-content/admin-content.controller';
import { AdminDataRequestsController } from '../admin-data-requests/admin-data-requests.controller';
import { AdminEconomyController } from '../admin-economy/admin-economy.controller';
import { AdminPayrollController } from '../admin-payroll/admin-payroll.controller';
import { AdminSanctionsController } from '../admin-sanctions/admin-sanctions.controller';
import { AdminUsersController } from '../admin-users/admin-users.controller';
import { AdminTrustController } from '../attorney-trust/admin-trust.controller';
import { AdminSubscriptionsController } from '../billing/admin-subscriptions.controller';
import { AdminBidPacksController } from '../bid-packs/bid-packs.controller';
import { AdminCasePaymentsController } from '../case-payments/admin-case-payments.controller';
import { AdminClientBadgeController } from '../client-badge/client-badge.controller';
import { AdminClientFraudController } from '../client-fraud/admin-client-fraud.controller';
import { AdminPartnersController } from '../partners/admin-partners.controller';
import { AdminPromotionsController } from '../promotions/admin-promotions.controller';
import { AdminReferralsController } from '../referrals/admin-referrals.controller';
import { AdminRewardsController } from '../rewards/admin-rewards.controller';
import { AdminStarsController } from '../stars/stars.controller';
import type { AdminActor } from './admin-auth.decorators';

/**
 * Round 4 admin check (25.11, В4 + С2–С7 + Н1–Н2): money, mass and identity
 * actions that went through without the fresh 2FA code the ordinary refund
 * asks for. Each now refuses without a step-up and never reaches its
 * service; with the code it does. The owner's own actions are never capped:
 * the code is the only guard.
 */
const actor = {
  id: 'a1',
  adminRole: 'super_admin',
  sessionId: 's1',
  justification: 'Asked by the government in writing',
  ip: null,
  countries: null,
} as unknown as AdminActor;

type Case = {
  name: string;
  run: (auth: unknown, svc: Record<string, jest.Mock>) => Promise<unknown>;
  method: string;
};

const svcMock = () =>
  new Proxy({} as Record<string, jest.Mock>, {
    get: (t, k: string) => (t[k] ??= jest.fn().mockResolvedValue({})),
  });
const none = {} as never;

const CASES: Case[] = [
  {
    name: 'POST /admin/subscriptions/:userId/cancel (with a refund)',
    method: 'cancel',
    run: (auth, svc) =>
      new SubscriptionAdminController(
        svc as never,
        auth as never,
      ).cancelAdminSubscription(
        actor,
        { userId: 'u1' },
        { when: 'now', refund: 'full', reason: 'Asked for it' },
        'k-1',
      ),
  },
  {
    name: 'PUT /admin/billing/prices/:kind',
    method: 'set',
    run: (auth, svc) =>
      new AdminPricingController(svc as never, auth as never).setPlanPrice(
        actor,
        { kind: 'monthly' } as never,
        { amountCents: 100 },
      ),
  },
  {
    name: 'POST /admin/billing/prices/:kind/move-subscribers',
    method: 'moveSubscribers',
    run: (auth, svc) =>
      new AdminPricingController(
        svc as never,
        auth as never,
      ).movePlanSubscribers(actor, { kind: 'monthly' } as never, {
        reason: 'New price',
      }),
  },
  {
    name: 'POST /admin/billing/plans (with a price)',
    method: 'create',
    run: (auth, svc) =>
      new AdminPlansController(svc as never, auth as never).adminCreatePlan(
        actor,
        { code: 'x', amountCents: 100 } as never,
      ),
  },
  {
    name: 'PUT /admin/billing/plans/:id (price)',
    method: 'update',
    run: (auth, svc) =>
      new AdminPlansController(svc as never, auth as never).adminUpdatePlan(
        actor,
        { id: 'p1' },
        { amountCents: 100 },
      ),
  },
  {
    name: 'POST /admin/billing/plans/:id/apply-to-subscribers',
    method: 'applyToSubscribers',
    run: (auth, svc) =>
      new AdminPlansController(
        svc as never,
        auth as never,
      ).adminApplyPlanToSubscribers(
        actor,
        { id: 'p1' },
        {
          reason: 'New terms',
        },
      ),
  },
  {
    name: 'PUT /admin/billing/bid-packs',
    method: 'savePacks',
    run: (auth, svc) =>
      new AdminBidPacksController(svc as never, auth as never).saveBidPacks(
        actor,
        { packs: [] },
      ),
  },
  {
    name: 'PUT /admin/stars/settings',
    method: 'saveSettings',
    run: (auth, svc) =>
      new AdminStarsController(
        svc as never,
        auth as never,
      ).saveAdminStarsSettings(actor, {} as never),
  },
  {
    name: 'PUT /admin/case-payments/settings (platform fee)',
    method: 'updateSettings',
    run: (auth, svc) =>
      new AdminCasePaymentsController(
        svc as never,
        auth as never,
      ).updateCasePaymentSettings(actor, {} as never),
  },
  {
    name: 'POST /admin/billing/contract-grants',
    method: 'create',
    run: (auth, svc) =>
      new AdminBillingController(
        none,
        svc as never,
        none,
        none,
        auth as never,
        none,
        none,
        none,
      ).createContractGrant(actor, {} as never),
  },
  {
    name: 'POST /admin/billing/contract-grants/:id/extend',
    method: 'extend',
    run: (auth, svc) =>
      new AdminBillingController(
        none,
        svc as never,
        none,
        none,
        auth as never,
        none,
        none,
        none,
      ).extendContractGrant(
        actor,
        { id: 'g1' },
        {
          months: 3,
          reason: 'Blogger deal',
        },
      ),
  },
  {
    name: 'POST /admin/billing/promo-codes',
    method: 'create',
    run: (auth, svc) =>
      new AdminBillingController(
        none,
        none,
        svc as never,
        none,
        auth as never,
        none,
        none,
        none,
      ).createPromoCode(actor, {} as never),
  },
  {
    name: 'PATCH /admin/billing/promo-codes/:id',
    method: 'update',
    run: (auth, svc) =>
      new AdminBillingController(
        none,
        none,
        svc as never,
        none,
        auth as never,
        none,
        none,
        none,
      ).updatePromoCode(actor, { id: 'c1' }, {}),
  },
  {
    name: 'POST /admin/referrals/:id/reward',
    method: 'reward',
    run: (auth, svc) =>
      new AdminReferralsController(
        svc as never,
        auth as never,
      ).rewardAdminReferral(actor, { id: 'r1' }, { reason: 'Qualified' }),
  },
  {
    name: 'POST /admin/promotions/grant',
    method: 'grant',
    run: (auth, svc) =>
      new AdminPromotionsController(
        svc as never,
        auth as never,
      ).grantAdminPromotion(actor, {
        caseId: 'c1',
        days: 3,
        reason: 'Apology',
      }),
  },
  {
    name: 'POST /admin/partners/:id/adjustments',
    method: 'adjust',
    run: (auth, svc) =>
      new AdminPartnersController(
        svc as never,
        auth as never,
      ).adjustAdminPartner(actor, { id: 'p1' }, {} as never),
  },
  {
    name: 'POST /admin/client-badges/:id/approve (free)',
    method: 'approve',
    run: (auth, svc) =>
      new AdminClientBadgeController(
        svc as never,
        auth as never,
      ).approveAdminClientBadge(actor, { id: 'b1' }, { free: true }),
  },
  {
    name: 'POST /admin/client-badges/bulk-approve',
    method: 'bulkApprove',
    run: (auth, svc) =>
      new AdminClientBadgeController(
        svc as never,
        auth as never,
      ).bulkApproveAdminClientBadges(actor, { ids: ['b1'] }),
  },
  {
    name: 'POST /admin/client-badges/bulk-reject',
    method: 'bulkReject',
    run: (auth, svc) =>
      new AdminClientBadgeController(
        svc as never,
        auth as never,
      ).bulkRejectAdminClientBadges(actor, {
        ids: ['b1'],
        reason: 'Fake documents',
      }),
  },
  {
    name: 'POST /admin/rewards/awards (the department bonus)',
    method: 'give',
    run: (auth, svc) =>
      new AdminRewardsController(svc as never, auth as never).createRewardAward(
        actor,
        { period: '2026-10', department: 'support' } as never,
      ),
  },
  {
    name: 'PUT /admin/rewards/settings (department bonus)',
    method: 'updateSettings',
    run: (auth, svc) =>
      new AdminRewardsController(
        svc as never,
        auth as never,
      ).updateRewardsSettings(actor, {
        departments: [{ department: 'support', bonusCents: 100 }],
      } as never),
  },
  {
    name: 'POST /admin/payroll/employees',
    method: 'create',
    run: (auth, svc) =>
      new AdminPayrollController(
        svc as never,
        auth as never,
      ).createPayrollEmployee(actor, { name: 'X', amountCents: 1 }),
  },
  {
    name: 'PATCH /admin/payroll/employees/:id (salary)',
    method: 'update',
    run: (auth, svc) =>
      new AdminPayrollController(
        svc as never,
        auth as never,
      ).updatePayrollEmployee(
        actor,
        { id: 'e1' },
        {
          amountCents: 2,
        },
      ),
  },
  {
    name: 'POST /admin/trust/bulk',
    method: 'bulk',
    run: (auth, svc) =>
      new AdminTrustController(svc as never, auth as never).bulkTrust(
        actor,
        {} as never,
      ),
  },
  {
    name: 'POST /admin/fraud/users/:userId/ban (every linked account)',
    method: 'ban',
    run: (auth, svc) =>
      new AdminClientFraudController(svc as never, auth as never).banFraud(
        actor,
        { userId: 'u1' },
        { includeLinked: true } as never,
      ),
  },
  {
    name: 'POST /admin/data-requests/:id/package',
    method: 'preparePackage',
    run: (auth, svc) =>
      new AdminDataRequestsController(
        svc as never,
        auth as never,
      ).prepareDataPackage(actor, { id: 'd1' }, {} as never),
  },
  {
    name: 'POST /admin/users/:id/restore',
    method: 'restore',
    run: (auth, svc) =>
      new AdminUsersController(svc as never, auth as never, none).restoreUser(
        actor,
        { id: 'u1' },
      ),
  },
  {
    name: 'POST /admin/sanctions/bans/:id/lift',
    method: 'lift',
    run: (auth, svc) =>
      new AdminSanctionsController(svc as never, auth as never).liftBan(
        actor,
        { id: 'b1' },
        { reason: 'Appeal won' },
      ),
  },
  {
    name: 'POST /admin/admins (create by hand)',
    method: 'create',
    run: (auth, svc) =>
      new AdminsController(svc as never, auth as never).createAdmin(actor, {
        email: 'new@example.test',
        role: 'support',
      } as never),
  },
  {
    name: 'POST /admin/broadcasts',
    method: 'broadcast',
    run: (auth, svc) =>
      new AdminContentController(
        svc as never,
        none,
        none,
        none,
        none,
        auth as never,
      ).sendAdminBroadcast(actor, {
        title: 'Hi',
        body: 'News',
        audience: 'all',
      } as never),
  },
];

const refusing = () => ({
  assertStepUp: jest
    .fn()
    .mockRejectedValue(
      new ForbiddenException({ code: 'ADMIN_STEP_UP_REQUIRED' }),
    ),
});

describe('round 4: step-up on money / mass / identity actions', () => {
  it.each(CASES)('$name refuses without a fresh step-up', async (c) => {
    const svc = svcMock();
    const auth = refusing();
    await expect(c.run(auth, svc)).rejects.toMatchObject({
      response: { code: 'ADMIN_STEP_UP_REQUIRED' },
    });
    expect(auth.assertStepUp).toHaveBeenCalledWith('s1');
    expect(svc[c.method]).not.toHaveBeenCalled();
  });

  it.each(CASES)('$name runs after a step-up', async (c) => {
    const svc = svcMock();
    const auth = { assertStepUp: jest.fn().mockResolvedValue(undefined) };
    await c.run(auth, svc);
    expect(svc[c.method]).toHaveBeenCalled();
  });

  it('a cancel with a refund needs the retry key too', async () => {
    const svc = svcMock();
    const auth = { assertStepUp: jest.fn().mockResolvedValue(undefined) };
    await expect(
      new SubscriptionAdminController(
        svc as never,
        auth as never,
      ).cancelAdminSubscription(
        actor,
        { userId: 'u1' },
        { when: 'now', refund: 'prorated', reason: 'Asked for it' },
        undefined,
      ),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REQUIRED' } });
    expect(svc.cancel).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a cancel without a refund',
      (auth: unknown, svc: Record<string, jest.Mock>) =>
        new SubscriptionAdminController(
          svc as never,
          auth as never,
        ).cancelAdminSubscription(
          actor,
          { userId: 'u1' },
          { when: 'period_end', reason: 'Asked for it' },
        ),
      'cancel',
    ],
    [
      'a plan text edit',
      (auth: unknown, svc: Record<string, jest.Mock>) =>
        new AdminPlansController(svc as never, auth as never).adminUpdatePlan(
          actor,
          { id: 'p1' },
          { sort: 2 },
        ),
      'update',
    ],
    [
      'a paid badge approval',
      (auth: unknown, svc: Record<string, jest.Mock>) =>
        new AdminClientBadgeController(
          svc as never,
          auth as never,
        ).approveAdminClientBadge(actor, { id: 'b1' }, {}),
      'approve',
    ],
    [
      'a ban of one account (switch off in one click)',
      (auth: unknown, svc: Record<string, jest.Mock>) =>
        new AdminClientFraudController(svc as never, auth as never).banFraud(
          actor,
          { userId: 'u1' },
          {} as never,
        ),
      'ban',
    ],
    [
      'a prize without a bonus',
      (auth: unknown, svc: Record<string, jest.Mock>) =>
        new AdminRewardsController(
          svc as never,
          auth as never,
        ).createRewardAward(actor, { prize: 'Cup', bonusCents: 0 } as never),
      'give',
    ],
  ])('%s still needs no code', async (_name, run, method) => {
    const svc = svcMock();
    const auth = refusing();
    await run(auth, svc);
    expect(auth.assertStepUp).not.toHaveBeenCalled();
    expect(svc[method]).toHaveBeenCalled();
  });

  it('POST /admin/subscriptions/:userId/extend refuses before touching the subscription', async () => {
    const prisma = { subscription: { findUnique: jest.fn() } };
    const auth = refusing();
    await expect(
      new AdminSubscriptionsController(
        prisma as never,
        none,
        none,
        none,
        none,
        none,
        auth as never,
      ).extendSubscription(
        actor,
        { userId: 'u1' },
        {
          days: 7,
          reason: 'Compensation',
        },
      ),
    ).rejects.toMatchObject({ response: { code: 'ADMIN_STEP_UP_REQUIRED' } });
    expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
  });

  it('POST /admin/cases/bulk refuses before resolving any case', async () => {
    const cases = svcMock();
    const auth = refusing();
    await expect(
      new AdminCaseManagementController(
        cases as never,
        none,
        auth as never,
      ).bulkAdminCases(actor, { ids: ['c1'], action: 'hide' } as never),
    ).rejects.toMatchObject({ response: { code: 'ADMIN_STEP_UP_REQUIRED' } });
    expect(Object.keys(cases)).toEqual([]);
  });

  it('PATCH /admin/economy/settings: the guard switch writes nothing without a code', async () => {
    const writer = { write: jest.fn() };
    const auth = refusing();
    await expect(
      new AdminEconomyController(
        none,
        none,
        writer as never,
        none,
        none,
        auth as never,
      ).updateEconomySettings(actor, { guardEnabled: false }),
    ).rejects.toMatchObject({ response: { code: 'ADMIN_STEP_UP_REQUIRED' } });
    expect(writer.write).not.toHaveBeenCalled();
  });
});
