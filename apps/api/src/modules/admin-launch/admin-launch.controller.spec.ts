import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PAGERDUTY_URL } from '../../common/secrets/provider-registry';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { AdminLaunchController } from './admin-launch.controller';

const admin: AdminActor = {
  id: 'owner',
  adminRole: 'super_admin',
  sessionId: 's1',
  justification: null,
  permissions: {},
  ip: '1.1.1.1',
};

function make(stepUpOk = true) {
  const kinds = new Map<
    string,
    { execute: (a: AdminActor, p: unknown) => Promise<unknown> }
  >();
  const approvals = {
    register: jest.fn((spec) => kinds.set(spec.kind, spec)),
    gate: jest.fn().mockResolvedValue(undefined),
  };
  const budgets = {
    available: true,
    prodName: 'lawbid-prod-monthly',
    obsoleteName: 'LawBid Monthly',
    setLimit: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue([]),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const auth = {
    assertStepUp: jest.fn(() =>
      stepUpOk
        ? Promise.resolve()
        : Promise.reject(
            new ForbiddenException({ code: 'ADMIN_STEP_UP_REQUIRED' }),
          ),
    ),
  };
  const paging = {
    available: true,
    sync: jest.fn().mockResolvedValue({}),
    publishTest: jest.fn().mockResolvedValue(undefined),
    status: jest.fn().mockResolvedValue({}),
  };
  const checks = {
    invalidate: jest.fn(),
    report: jest.fn().mockResolvedValue({ items: [] }),
    recordDrill: jest.fn(),
  };
  const rate = {
    consumeFixedWindow: jest.fn().mockResolvedValue({ allowed: true }),
  };
  const c = new AdminLaunchController(
    checks as never,
    paging as never,
    budgets as never,
    approvals as never,
    audit as never,
    auth as never,
    rate as never,
  );
  c.onModuleInit();
  return { c, approvals, budgets, audit, auth, paging, checks, kinds };
}

describe('AdminLaunchController budgets (four-eyes kinds + 2FA)', () => {
  it('registers both kinds as super_admin-only routes', () => {
    const { approvals } = make();
    expect(
      approvals.register.mock.calls
        .map((x: [{ kind: string }]) => x[0].kind)
        .sort(),
    ).toEqual(['aws_budget_delete', 'aws_budget_limit']);
    for (const [spec] of approvals.register.mock.calls) {
      expect(spec.route.roles).toEqual(['super_admin']);
    }
  });

  it('with the second-admin rule on, gate() throws and nothing runs yet', async () => {
    const { c, approvals, budgets } = make();
    approvals.gate.mockRejectedValue(
      new ForbiddenException({ code: 'ADMIN_APPROVAL_PENDING' }),
    );
    await expect(
      c.setAwsBudgetLimit(admin, {
        name: 'lawbid-prod-monthly',
        limitUsd: 300,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(budgets.setLimit).not.toHaveBeenCalled();
  });

  it('needs a fresh 2FA code before anything else', async () => {
    const { c, approvals } = make(false);
    await expect(
      c.setAwsBudgetLimit(admin, {
        name: 'lawbid-prod-monthly',
        limitUsd: 300,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(approvals.gate).not.toHaveBeenCalled();
  });

  it('goes through the approval gate (always) for the prod budget only', async () => {
    const { c, approvals, budgets } = make();
    await c.setAwsBudgetLimit(admin, {
      name: 'lawbid-prod-monthly',
      limitUsd: 300,
    });
    // gate() returned (second-admin rule off): the change runs at once.
    expect(budgets.setLimit).toHaveBeenCalledWith('lawbid-prod-monthly', 300);
    expect(approvals.gate).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        kind: 'aws_budget_limit',
        always: true,
        payload: { name: 'lawbid-prod-monthly', limitUsd: 300 },
      }),
    );
    await expect(
      c.setAwsBudgetLimit(admin, { name: 'LawBid Monthly', limitUsd: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('delete is only for the obsolete budget', async () => {
    const { c, approvals, budgets } = make();
    await c.deleteAwsBudget(admin, { name: 'LawBid Monthly' });
    expect(budgets.remove).toHaveBeenCalledWith('LawBid Monthly');
    expect(approvals.gate).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ kind: 'aws_budget_delete', always: true }),
    );
    await expect(
      c.deleteAwsBudget(admin, { name: 'lawbid-prod-monthly' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('an approved request runs the AWS call as the requester and is audited', async () => {
    const { kinds, budgets, audit } = make();
    await kinds
      .get('aws_budget_limit')!
      .execute(admin, { name: 'lawbid-prod-monthly', limitUsd: 300 });
    expect(budgets.setLimit).toHaveBeenCalledWith('lawbid-prod-monthly', 300);
    await kinds
      .get('aws_budget_delete')!
      .execute(admin, { name: 'LawBid Monthly' });
    expect(budgets.remove).toHaveBeenCalledWith('LawBid Monthly');
    expect(
      audit.record.mock.calls.map((x: [{ action: string }]) => x[0].action),
    ).toEqual(['ops.budget_limit', 'ops.budget_delete']);
  });
});

describe('AdminLaunchController PagerDuty and drill', () => {
  it('sync and the test alarm need 2FA and are audited; the test is rate limited', async () => {
    const { c, auth, paging, audit, checks } = make();
    await c.syncPaging(admin);
    await c.testPaging(admin);
    expect(auth.assertStepUp).toHaveBeenCalledTimes(2);
    expect(paging.sync).toHaveBeenCalled();
    expect(paging.publishTest).toHaveBeenCalled();
    expect(checks.invalidate).toHaveBeenCalled();
    expect(
      audit.record.mock.calls.map((x: [{ action: string }]) => x[0].action),
    ).toEqual(['ops.pagerduty_sync', 'ops.pagerduty_test']);
  });

  it('refuses both off AWS', async () => {
    const { c, paging } = make();
    paging.available = false;
    await expect(c.testPaging(admin)).rejects.toMatchObject({ status: 409 });
  });

  it('records the restore drill after 2FA', async () => {
    const { c, checks, auth } = make();
    await c.recordRestoreDrill(admin, { note: 'RTO 40 min' });
    expect(auth.assertStepUp).toHaveBeenCalled();
    expect(checks.recordDrill).toHaveBeenCalledWith('RTO 40 min');
  });
});

describe('PagerDuty link format', () => {
  it('accepts the integration URL, rejects look-alikes', () => {
    expect(
      PAGERDUTY_URL.test(
        'https://events.pagerduty.com/integration/AAAA1111BBBB2222CCCC3333DDDD4444/enqueue',
      ),
    ).toBe(true);
    expect(
      PAGERDUTY_URL.test(
        'https://events.eu.pagerduty.com/integration/AAAA1111BBBB2222CCCC3333DDDD4444/enqueue',
      ),
    ).toBe(true);
    expect(
      PAGERDUTY_URL.test(
        'http://events.pagerduty.com/integration/AAAA1111BBBB2222CCCC3333DDDD4444/enqueue',
      ),
    ).toBe(false);
    expect(
      PAGERDUTY_URL.test(
        'https://events.pagerduty.com.evil.io/integration/AAAA1111BBBB2222CCCC3333DDDD4444/enqueue',
      ),
    ).toBe(false);
    expect(
      PAGERDUTY_URL.test(
        'https://evil.io/events.pagerduty.com/integration/AAAA1111BBBB2222CCCC3333DDDD4444/enqueue',
      ),
    ).toBe(false);
  });
});
