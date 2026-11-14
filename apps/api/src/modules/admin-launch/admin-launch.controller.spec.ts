import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PAGERDUTY_URL } from '../../common/secrets/provider-registry';
import {
  ADMIN_ROLES_KEY,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
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
  const summary = fakeSummary();
  const c = new AdminLaunchController(
    checks as never,
    paging as never,
    budgets as never,
    audit as never,
    auth as never,
    summary.service as never,
  );
  return { c, budgets, audit, auth, paging, checks, summary };
}

/** AdminSummaryService over a Map: board = stored copy or one compute. */
function fakeSummary() {
  const store = new Map<string, unknown>();
  const service = {
    board: jest.fn(async (key: string, compute: () => Promise<unknown>) => {
      if (!store.has(key)) store.set(key, await compute());
      return store.get(key);
    }),
    put: jest.fn((key: string, data: unknown) => {
      store.set(key, data);
      return Promise.resolve();
    }),
    refresh: jest.fn(async (key: string, compute: () => Promise<unknown>) => {
      const data = await compute();
      store.set(key, data);
      return { data, computedAt: new Date().toISOString() };
    }),
  };
  return { service, store };
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

describe('AdminLaunchController: one owner, no second admin (owner 2026-11-08)', () => {
  it('only the super admin (owner) reaches the budget buttons at all', () => {
    expect(Reflect.getMetadata(ADMIN_ROLES_KEY, AdminLaunchController)).toEqual(
      ['super_admin'],
    );
  });

  it('the owner alone deletes «LawBid Monthly» with one 2FA code: no request, no second approval', async () => {
    const { c, budgets, audit, auth } = make();
    await c.deleteAwsBudget(admin, { name: 'LawBid Monthly' });
    expect(auth.assertStepUp).toHaveBeenCalledTimes(1);
    expect(auth.assertStepUp).toHaveBeenCalledWith('s1');
    expect(budgets.remove).toHaveBeenCalledTimes(1);
    const rows = audit.record.mock.calls.map(
      (x: [{ action: string; adminId: string }]) => x[0],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'ops.budget_delete' });
  });

  it('without a fresh 2FA code nothing is deleted', async () => {
    const { c, budgets, audit } = make(false);
    await expect(
      c.deleteAwsBudget(admin, { name: 'LawBid Monthly' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(budgets.remove).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('AdminLaunchController PagerDuty and drill', () => {
  it('sync and the test alarm need 2FA and are audited; no hourly cap on tests (owner 12.11)', async () => {
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

describe('AdminLaunchController boards through the shared copy (perf batch 2, row 125)', () => {
  const req = { headers: {} } as never;
  const res = () =>
    ({ setHeader: jest.fn(), status: jest.fn() }) as unknown as never;

  it('a second open answers from the shared copy without re-checking', async () => {
    const { c, checks, summary } = make();
    await c.launchReport(req, res());
    await c.launchReport(req, res());
    expect(checks.report).toHaveBeenCalledTimes(1);
    // the board's own refresh is a full re-check, not the 5-minute copy
    expect(checks.report).toHaveBeenCalledWith(expect.any(Date), true);
    expect(summary.service.board).toHaveBeenCalledWith(
      'launch:report',
      expect.any(Function),
      5 * 60_000,
      expect.any(Function),
    );
  });

  it('a tick, the drill and «Проверить сейчас» store their fresh answer at once', async () => {
    const { c, checks, summary } = make();
    checks.report.mockResolvedValue({ items: [{ id: 'x', ticked: true }] });
    (checks as unknown as { setTick: jest.Mock }).setTick = jest.fn();
    await c.tickLaunchItem(admin, { id: 'x' }, { done: true });
    expect(summary.store.get('launch:report')).toEqual({
      items: [{ id: 'x', ticked: true }],
    });
    checks.report.mockResolvedValue({ items: [{ id: 'y' }] });
    await c.refreshLaunch();
    expect(summary.store.get('launch:report')).toEqual({
      items: [{ id: 'y' }],
    });
    await c.recordRestoreDrill(admin, { note: 'n' });
    expect(summary.service.put).toHaveBeenCalledTimes(3);
  });

  it('a budget change re-checks the board in the background', async () => {
    const { c, checks, summary } = make();
    await c.setAwsBudgetLimit(admin, {
      name: 'lawbid-prod-monthly',
      limitUsd: 300,
    });
    expect(checks.invalidate).toHaveBeenCalled();
    expect(summary.service.refresh).toHaveBeenCalledWith(
      'launch:report',
      expect.any(Function),
    );
  });

  it('PagerDuty: one SNS read for many opens; sync and test replace the copy', async () => {
    const { c, paging, summary } = make();
    paging.status.mockResolvedValue({ state: 'none' });
    await c.getPagingStatus();
    await c.getPagingStatus();
    expect(paging.status).toHaveBeenCalledTimes(1);
    expect(paging.status).toHaveBeenCalledWith(true);
    paging.sync.mockResolvedValue({ state: 'pending' });
    await c.syncPaging(admin);
    expect(summary.store.get('launch:pagerduty')).toEqual({ state: 'pending' });
    paging.status.mockResolvedValue({ state: 'confirmed' });
    await c.testPaging(admin);
    expect(summary.store.get('launch:pagerduty')).toEqual({
      state: 'confirmed',
    });
  });
});
