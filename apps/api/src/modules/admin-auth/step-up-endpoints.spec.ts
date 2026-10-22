import { ForbiddenException } from '@nestjs/common';
import { AdminsController } from '../admin/admins.controller';
import { AdminBillingController } from '../admin-billing/admin-billing.controller';
import { AdminIntegrationsController } from '../admin-integrations/admin-integrations.controller';
import { AdminPayrollController } from '../admin-payroll/admin-payroll.controller';
import { AdminUsersController } from '../admin-users/admin-users.controller';
import { AdminCasePaymentsController } from '../case-payments/admin-case-payments.controller';
import { AdminPartnersController } from '../partners/admin-partners.controller';
import { AdminStarsController } from '../stars/stars.controller';
import type { AdminActor } from './admin-auth.decorators';

/**
 * Owner 2026-10-22 (system audit #2, item 2): every money / identity
 * action asks for a fresh authenticator code (assertStepUp, 5 minutes per
 * session). Without it the action never reaches its service; with it, it
 * does.
 */
const actor = {
  id: 'a1',
  adminRole: 'super_admin',
  sessionId: 's1',
  justification: null,
  ip: null,
} as AdminActor;

type Case = {
  name: string;
  run: (auth: unknown, svc: Record<string, jest.Mock>) => Promise<unknown>;
  method: string;
};

/** Below the second-admin limit: the gate lets the action run. */
const GATE = { gate: jest.fn().mockResolvedValue(undefined) };

const svcMock = () =>
  new Proxy({} as Record<string, jest.Mock>, {
    get: (t, k: string) => (t[k] ??= jest.fn().mockResolvedValue({})),
  });

const CASES: Case[] = [
  {
    name: 'POST /admin/payroll/payouts/bulk',
    method: 'payBulk',
    run: (auth, svc) =>
      new AdminPayrollController(
        svc as never,
        auth as never,
        GATE as never,
      ).payPayrollBulk(actor, {
        employeeIds: ['e1'],
        period: '2026-10',
      }),
  },
  {
    name: 'POST /admin/payroll/employees/:id/stripe-link',
    method: 'stripeLink',
    run: (auth, svc) =>
      new AdminPayrollController(
        svc as never,
        auth as never,
        GATE as never,
      ).payrollStripeLink(actor, { id: 'e1' }),
  },
  {
    name: 'POST /admin/billing/refunds',
    method: 'refund',
    run: (auth, svc) =>
      new AdminBillingController(
        {} as never,
        {} as never,
        {} as never,
        svc as never,
        auth as never,
        GATE as never,
      ).createRefund(actor, {
        paymentId: 'p1',
        amountCents: 100,
        reason: 'Customer asked twice',
      }),
  },
  {
    name: 'POST /admin/case-payments/:id/refund',
    method: 'refund',
    run: (auth, svc) =>
      new AdminCasePaymentsController(
        svc as never,
        auth as never,
      ).refundAdminCasePayment(actor, { id: 'c1' }, {} as never),
  },
  {
    name: 'POST /admin/users/:id/phone',
    method: 'changePhone',
    run: (auth, svc) =>
      new AdminUsersController(svc as never, auth as never).changeUserPhone(
        actor,
        { id: 'u1' },
        { phone: '+15555550100', reason: 'On request' },
      ),
  },
  {
    name: 'POST /admin/users/:id/password/reset',
    method: 'resetPassword',
    run: (auth, svc) =>
      new AdminUsersController(svc as never, auth as never).resetUserPassword(
        actor,
        { id: 'u1' },
      ),
  },
  {
    name: 'POST /admin/users/bulk',
    method: 'bulk',
    run: (auth, svc) =>
      new AdminUsersController(svc as never, auth as never).bulk(
        actor,
        {} as never,
      ),
  },
  {
    name: 'POST /admin/admins/:id/reset-2fa',
    method: 'resetTotp',
    run: (auth, svc) =>
      new AdminsController(svc as never, auth as never).resetAdminTotp(actor, {
        id: 'other',
      }),
  },
  {
    name: 'POST /admin/integrations/:provider/versions (keys)',
    method: 'createVersion',
    run: (auth, svc) =>
      new AdminIntegrationsController(
        svc as never,
        { record: jest.fn() } as never,
        auth as never,
        {
          consumeFixedWindow: jest.fn().mockResolvedValue({ allowed: true }),
        } as never,
      ).createIntegrationVersion(actor, { provider: 'stripe' }, { values: {} }),
  },
  // Owner 2026-10-22 («лечи всё»): the rest of money / identity.
  {
    name: 'PATCH /admin/admins/:id/role',
    method: 'setRole',
    run: (auth, svc) =>
      new AdminsController(svc as never, auth as never).setAdminRole(
        actor,
        { id: 'other' },
        { role: 'support' } as never,
      ),
  },
  {
    name: 'PATCH /admin/admins/:id/permissions',
    method: 'setPermissions',
    run: (auth, svc) =>
      new AdminsController(svc as never, auth as never).setAdminPermissions(
        actor,
        { id: 'other' },
        { permissions: {} },
      ),
  },
  {
    name: 'POST /admin/stars/grant',
    method: 'grant',
    run: (auth, svc) =>
      new AdminStarsController(svc as never, auth as never).grantStars(actor, {
        userId: 'u1',
        delta: 10,
        reason: 'Compensation',
      } as never),
  },
  {
    name: 'POST /admin/payroll/employees/:id/accruals (bonus)',
    method: 'addAccrual',
    run: (auth, svc) =>
      new AdminPayrollController(
        svc as never,
        auth as never,
        GATE as never,
      ).addPayrollAccrual(actor, { id: 'e1' }, {
        kind: 'bonus',
        amountCents: 100,
        period: '2026-10',
        note: 'Good month',
      } as never),
  },
  {
    name: 'POST /admin/partners/:id/pay',
    method: 'pay',
    run: (auth, svc) =>
      new AdminPartnersController(
        svc as never,
        auth as never,
        GATE as never,
      ).payAdminPartner(actor, { id: 'p1' }, { reason: '' }),
  },
  {
    name: 'POST /admin/partners/commissions/:id/pay',
    method: 'markPaid',
    run: (auth, svc) =>
      new AdminPartnersController(
        svc as never,
        auth as never,
        GATE as never,
      ).payAdminPartnerCommission(actor, { id: 'c1' }, { reason: '' }),
  },
];

describe('step-up on money / identity endpoints (audit #2, item 2)', () => {
  it.each(CASES)('$name refuses without a fresh step-up', async (c) => {
    const svc = svcMock();
    const auth = {
      assertStepUp: jest
        .fn()
        .mockRejectedValue(
          new ForbiddenException({ code: 'ADMIN_STEP_UP_REQUIRED' }),
        ),
    };
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

  it('a super admin cannot reset their own authenticator from the panel', async () => {
    const svc = svcMock();
    const auth = { assertStepUp: jest.fn().mockResolvedValue(undefined) };
    await expect(
      new AdminsController(svc as never, auth as never).resetAdminTotp(actor, {
        id: actor.id,
      }),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    expect(svc.resetTotp).not.toHaveBeenCalled();
  });
});

describe('maker-checker on bonuses and partner payouts (owner 2026-10-22)', () => {
  const stepped = { assertStepUp: jest.fn().mockResolvedValue(undefined) };
  const pending = () => ({
    gate: jest.fn().mockRejectedValue(
      Object.assign(new Error('pending'), {
        response: { code: 'ADMIN_APPROVAL_PENDING' },
      }),
    ),
  });

  it('a payroll bonus goes through the gate with its amount; nothing is added while it waits', async () => {
    const svc = svcMock();
    const approvals = pending();
    await expect(
      new AdminPayrollController(
        svc as never,
        stepped as never,
        approvals as never,
      ).addPayrollAccrual(actor, { id: 'e1' }, {
        kind: 'bonus',
        amountCents: 75_000,
        period: '2026-10',
        note: 'Good month',
      } as never),
    ).rejects.toMatchObject({ response: { code: 'ADMIN_APPROVAL_PENDING' } });
    expect(approvals.gate).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        kind: 'payroll_bonus',
        amountCents: 75_000,
        payload: expect.objectContaining({ employeeId: 'e1' }),
      }),
    );
    expect(svc.addAccrual).not.toHaveBeenCalled();
  });

  it('a deduction moves no money out: no second admin needed', async () => {
    const svc = svcMock();
    const approvals = pending();
    await new AdminPayrollController(
      svc as never,
      stepped as never,
      approvals as never,
    ).addPayrollAccrual(actor, { id: 'e1' }, {
      kind: 'adjustment',
      amountCents: -90_000,
      period: '2026-10',
      note: 'Advance taken back',
    } as never);
    expect(approvals.gate).not.toHaveBeenCalled();
    expect(svc.addAccrual).toHaveBeenCalled();
  });

  it('a partner payout is gated by everything approved for it', async () => {
    const svc = svcMock();
    svc.payableCents.mockResolvedValue(120_000);
    const approvals = pending();
    await expect(
      new AdminPartnersController(
        svc as never,
        stepped as never,
        approvals as never,
      ).payAdminPartner(actor, { id: 'p1' }, { reason: '', period: '2026-10' }),
    ).rejects.toMatchObject({ response: { code: 'ADMIN_APPROVAL_PENDING' } });
    expect(svc.payableCents).toHaveBeenCalledWith('p1', '2026-10');
    expect(approvals.gate).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        kind: 'partner_payout',
        amountCents: 120_000,
      }),
    );
    expect(svc.pay).not.toHaveBeenCalled();
  });

  it('one commission marked paid is gated by its amount', async () => {
    const svc = svcMock();
    svc.commissionCents.mockResolvedValue(55_000);
    const approvals = pending();
    await expect(
      new AdminPartnersController(
        svc as never,
        stepped as never,
        approvals as never,
      ).payAdminPartnerCommission(actor, { id: 'c1' }, { reason: '' }),
    ).rejects.toMatchObject({ response: { code: 'ADMIN_APPROVAL_PENDING' } });
    expect(approvals.gate).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        kind: 'partner_commission_paid',
        amountCents: 55_000,
      }),
    );
    expect(svc.markPaid).not.toHaveBeenCalled();
  });

  it('approved partner and bonus requests run through the right service call', async () => {
    const register = jest.fn();
    const svc = svcMock();
    new AdminPartnersController(
      svc as never,
      stepped as never,
      {
        register,
      } as never,
    ).onModuleInit();
    new AdminPayrollController(
      svc as never,
      stepped as never,
      {
        register,
      } as never,
    ).onModuleInit();
    const spec = (kind: string) =>
      (
        register.mock.calls as [
          {
            kind: string;
            execute: (a: unknown, p: unknown) => Promise<unknown>;
          },
        ][]
      )
        .map((c) => c[0])
        .find((x) => x.kind === kind)!;
    const dto = { reason: '' };
    await spec('partner_payout').execute(actor, { id: 'p1', dto });
    expect(svc.pay).toHaveBeenCalledWith(actor, 'p1', dto);
    await spec('partner_commission_paid').execute(actor, { id: 'c1', dto });
    expect(svc.markPaid).toHaveBeenCalledWith(actor, 'c1', dto);
    const accrual = { kind: 'bonus', amountCents: 1 };
    await spec('payroll_bonus').execute(actor, { employeeId: 'e1', accrual });
    expect(svc.addAccrual).toHaveBeenCalledWith(actor, 'e1', accrual);
  });
});
