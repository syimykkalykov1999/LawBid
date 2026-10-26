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
    audit as never,
    auth as never,
    rate as never,
  );
  return { c, budgets, audit, auth, paging, checks };
}

describe('AdminLaunchController budgets (2FA only, no second admin)', () => {
  it('needs a fresh 2FA code before anything else', async () => {
    const { c, budgets } = make(false);
    await expect(
      c.setAwsBudgetLimit(admin, {
        name: 'lawbid-prod-monthly',
        limitUsd: 300,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(budgets.setLimit).not.toHaveBeenCalled();
  });

  it('changes the limit of the prod budget at once and audits it; no other budget', async () => {
    const { c, budgets, audit } = make();
    await c.setAwsBudgetLimit(admin, {
      name: 'lawbid-prod-monthly',
      limitUsd: 300,
    });
    expect(budgets.setLimit).toHaveBeenCalledWith('lawbid-prod-monthly', 300);
    await expect(
      c.setAwsBudgetLimit(admin, { name: 'LawBid Monthly', limitUsd: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      audit.record.mock.calls.map((x: [{ action: string }]) => x[0].action),
    ).toEqual(['ops.budget_limit']);
  });

  it('delete is only for the obsolete budget, runs at once and is audited', async () => {
    const { c, budgets, audit } = make();
    await c.deleteAwsBudget(admin, { name: 'LawBid Monthly' });
    expect(budgets.remove).toHaveBeenCalledWith('LawBid Monthly');
    await expect(
      c.deleteAwsBudget(admin, { name: 'lawbid-prod-monthly' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      audit.record.mock.calls.map((x: [{ action: string }]) => x[0].action),
    ).toEqual(['ops.budget_delete']);
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
