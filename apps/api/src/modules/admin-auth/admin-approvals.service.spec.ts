import { ForbiddenException } from '@nestjs/common';
import type { AdminActor } from './admin-auth.decorators';
import {
  AdminApprovalsService,
  APPROVAL_TTL_HOURS,
  payloadHash,
} from './admin-approvals.service';

/**
 * Owner 2026-10-22 (system audit #2, item 11): maker-checker for bulk
 * payouts and refunds at or above billing.dual_approval_min_cents.
 */
type Row = {
  id: string;
  kind: string;
  payload: unknown;
  payload_hash: string;
  amount_cents: number;
  summary: string;
  status: string;
  requested_by: string;
  approved_by: string | null;
  rejected_by: string | null;
  decision_note: string | null;
  result: unknown;
  error: string | null;
  created_at: Date;
  decided_at: Date | null;
  executed_at: Date | null;
};

const LIMIT = 50_000;

const admin = (
  id: string,
  role: AdminActor['adminRole'] = 'super_admin',
  permissions: AdminActor['permissions'] = {},
): AdminActor => ({
  id,
  adminRole: role,
  sessionId: `sess-${id}`,
  justification: null,
  permissions,
  ip: '9.9.9.9',
});

function build() {
  const rows: Row[] = [];
  let seq = 0;
  const who = (id: string | null) => (id ? { id, email: `${id}@x.io` } : null);
  const withPeople = (r: Row) => ({
    ...r,
    requester: who(r.requested_by),
    approver: who(r.approved_by),
    rejecter: who(r.rejected_by),
  });
  const matches = (r: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      const cur = (r as Record<string, unknown>)[k];
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        const o = v as Record<string, unknown>;
        if ('not' in o) return cur !== o.not;
        if ('gt' in o) return (cur as Date) > (o.gt as Date);
        return true;
      }
      return cur === v;
    });
  const prisma = {
    adminApproval: {
      findFirst: jest.fn(({ where }) =>
        Promise.resolve(rows.find((r) => matches(r, where)) ?? null),
      ),
      findMany: jest.fn(({ where }) =>
        Promise.resolve(rows.filter((r) => matches(r, where)).map(withPeople)),
      ),
      findUnique: jest.fn(({ where }) => {
        const r = rows.find((x) => x.id === where.id);
        return Promise.resolve(r ? withPeople(r) : null);
      }),
      create: jest.fn(({ data }) => {
        const r: Row = {
          id: `ap-${++seq}`,
          status: 'pending',
          approved_by: null,
          rejected_by: null,
          decision_note: null,
          result: null,
          error: null,
          created_at: new Date(),
          decided_at: null,
          executed_at: null,
          ...data,
        };
        rows.push(r);
        return Promise.resolve({ id: r.id });
      }),
      updateMany: jest.fn(({ where, data }) => {
        const hit = rows.filter((r) => matches(r, where));
        for (const r of hit) Object.assign(r, data);
        return Promise.resolve({ count: hit.length });
      }),
      update: jest.fn(({ where, data }) => {
        Object.assign(
          rows.find((r) => r.id === where.id)!,
          data,
        );
        return Promise.resolve({});
      }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        role: 'admin',
        status: 'active',
        deleted_at: null,
        admin_profile: {
          admin_role: 'finance',
          permissions: { money: 'manage' },
        },
      }),
    },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const stepped = new Set<string>();
  const auth = {
    assertStepUp: jest.fn((sessionId: string) =>
      stepped.has(sessionId)
        ? Promise.resolve()
        : Promise.reject(
            new ForbiddenException({ code: 'ADMIN_STEP_UP_REQUIRED' }),
          ),
    ),
  };
  // admin.dual_control is on here: this file tests the maker-checker flow;
  // the «off» default has its own describe at the bottom.
  const settings = {
    number: jest.fn().mockResolvedValue(LIMIT),
    boolean: jest.fn().mockResolvedValue(true),
  };
  const svc = new AdminApprovalsService(
    prisma as never,
    audit as never,
    auth as never,
    settings as never,
  );
  const execute = jest.fn().mockResolvedValue({ refundId: 'r1' });
  svc.register({
    kind: 'billing_refund',
    label: 'Возврат',
    route: {
      path: '/api/v1/admin/billing/refunds',
      method: 'POST',
      roles: ['super_admin', 'finance'],
    },
    execute,
  });
  const actions = () =>
    audit.record.mock.calls.map((c: [{ action: string }]) => c[0].action);
  return { svc, rows, audit, actions, execute, stepped, settings };
}

const maker = admin('maker', 'finance', { money: 'manage' });
const checker = admin('checker');
const refund = (amountCents: number) => ({
  kind: 'billing_refund' as const,
  payload: { paymentId: 'p1', amountCents, reason: 'Customer asked twice' },
  amountCents,
  summary: 'refund',
});

/** Asks for a refund and returns the pending request id. */
async function ask(svc: AdminApprovalsService, amountCents = LIMIT) {
  try {
    await svc.gate(maker, refund(amountCents));
  } catch (e) {
    return (e as { response: { details: { approvalId: string } } }).response
      .details.approvalId;
  }
  throw new Error('expected a pending approval');
}

describe('maker-checker: the limit', () => {
  it('below the limit the action runs at once (no request stored)', async () => {
    const { svc, rows } = build();
    await expect(svc.gate(maker, refund(LIMIT - 1))).resolves.toBeUndefined();
    expect(rows).toHaveLength(0);
  });

  it('exactly at the limit it waits for a second admin (409, nothing runs)', async () => {
    const { svc, rows, actions, execute } = build();
    await expect(svc.gate(maker, refund(LIMIT))).rejects.toMatchObject({
      status: 409,
      response: {
        code: 'ADMIN_APPROVAL_PENDING',
        details: { approvalId: 'ap-1', limitCents: LIMIT },
      },
    });
    expect(rows[0]).toMatchObject({
      status: 'pending',
      requested_by: 'maker',
      amount_cents: LIMIT,
    });
    expect(execute).not.toHaveBeenCalled();
    expect(actions()).toEqual(['admin.approval_requested']);
  });

  it('limit 0 sends every one for approval', async () => {
    const { svc, settings } = build();
    settings.number.mockResolvedValue(0);
    await expect(svc.gate(maker, refund(1))).rejects.toMatchObject({
      response: { code: 'ADMIN_APPROVAL_PENDING' },
    });
  });

  it('asking twice for the same thing is one request', async () => {
    const { svc, rows } = build();
    const a = await ask(svc);
    const b = await ask(svc);
    expect(b).toBe(a);
    expect(rows).toHaveLength(1);
  });

  it('the payload hash ignores key order', () => {
    expect(payloadHash('k', { a: 1, b: [1, { c: 2, d: 3 }] })).toBe(
      payloadHash('k', { b: [1, { d: 3, c: 2 }], a: 1 }),
    );
  });
});

describe('maker-checker: the second admin', () => {
  it('the requester cannot approve their own request', async () => {
    const { svc, rows, execute, stepped } = build();
    const id = await ask(svc);
    stepped.add(maker.sessionId);
    await expect(svc.approve(maker, id)).rejects.toMatchObject({
      response: { code: 'ADMIN_APPROVAL_SELF' },
    });
    expect(rows[0].status).toBe('pending');
    expect(execute).not.toHaveBeenCalled();
  });

  it('approving needs a fresh step-up', async () => {
    const { svc, rows, execute } = build();
    const id = await ask(svc);
    await expect(svc.approve(checker, id)).rejects.toMatchObject({
      response: { code: 'ADMIN_STEP_UP_REQUIRED' },
    });
    expect(rows[0].status).toBe('pending');
    expect(execute).not.toHaveBeenCalled();
  });

  it('an admin who could not run the action cannot approve it', async () => {
    const { svc, stepped, execute } = build();
    const id = await ask(svc);
    const support = admin('sup', 'support', { users: 'manage' });
    stepped.add(support.sessionId);
    await expect(svc.approve(support, id)).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(await svc.list(support)).toHaveLength(0);
  });

  it('another admin approves: it runs once, as the requester; both steps are audited', async () => {
    const { svc, rows, execute, stepped, actions } = build();
    const id = await ask(svc);
    stepped.add(checker.sessionId);
    const view = await svc.approve(checker, id);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0]).toMatchObject({
      id: 'maker',
      adminRole: 'finance',
    });
    expect(execute.mock.calls[0][1]).toEqual(refund(LIMIT).payload);
    expect(view).toMatchObject({
      status: 'approved',
      approvedBy: { id: 'checker' },
      requestedBy: { id: 'maker' },
    });
    expect(rows[0].result).toEqual({ refundId: 'r1' });
    expect(actions()).toEqual([
      'admin.approval_requested',
      'admin.approval_approved',
      'admin.approval_executed',
    ]);
  });

  it('a second approval (double click, another admin) never runs it again', async () => {
    const { svc, execute, stepped } = build();
    const id = await ask(svc);
    const other = admin('other');
    stepped.add(checker.sessionId);
    stepped.add(other.sessionId);
    const results = await Promise.allSettled([
      svc.approve(checker, id),
      svc.approve(other, id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { response: { code: 'ADMIN_APPROVAL_NOT_PENDING' } },
    });
    await expect(svc.approve(checker, id)).rejects.toMatchObject({
      response: { code: 'ADMIN_APPROVAL_NOT_PENDING' },
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('a failing action is stored as failed and audited, not retried', async () => {
    const { svc, rows, execute, stepped, actions } = build();
    execute.mockRejectedValueOnce(new Error('Stripe said no'));
    const id = await ask(svc);
    stepped.add(checker.sessionId);
    const view = await svc.approve(checker, id);
    expect(view.status).toBe('failed');
    expect(rows[0].error).toBe('Stripe said no');
    expect(actions()).toContain('admin.approval_failed');
    await expect(svc.approve(checker, id)).rejects.toMatchObject({
      response: { code: 'ADMIN_APPROVAL_NOT_PENDING' },
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('a rejected request never runs', async () => {
    const { svc, execute, stepped, actions } = build();
    const id = await ask(svc);
    const view = await svc.reject(checker, id, 'Not agreed');
    expect(view).toMatchObject({
      status: 'rejected',
      rejectedBy: { id: 'checker' },
      decisionNote: 'Not agreed',
    });
    stepped.add(checker.sessionId);
    await expect(svc.approve(checker, id)).rejects.toMatchObject({
      response: { code: 'ADMIN_APPROVAL_NOT_PENDING' },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(actions()).toEqual([
      'admin.approval_requested',
      'admin.approval_rejected',
    ]);
  });

  it(`a request older than ${APPROVAL_TTL_HOURS} hours expires instead of running`, async () => {
    const { svc, rows, execute, stepped } = build();
    const id = await ask(svc);
    rows[0].created_at = new Date(
      Date.now() - (APPROVAL_TTL_HOURS * 3600 + 60) * 1000,
    );
    stepped.add(checker.sessionId);
    await expect(svc.approve(checker, id)).rejects.toMatchObject({
      response: { code: 'ADMIN_APPROVAL_NOT_PENDING' },
    });
    expect(rows[0].status).toBe('expired');
    expect(execute).not.toHaveBeenCalled();
  });

  it('the badge counts what this admin could approve, never their own', async () => {
    const { svc } = build();
    await ask(svc);
    expect(await svc.pendingCount(checker)).toBe(1);
    expect(await svc.pendingCount(maker)).toBe(0);
    const [mine] = await svc.list(maker);
    expect(mine).toMatchObject({ mine: true, canDecide: false });
    const [theirs] = await svc.list(checker);
    expect(theirs).toMatchObject({ mine: false, canDecide: true });
  });
});

describe('admin.dual_control off (the owner works alone)', () => {
  it('runs everything at once: nothing stored, one audit row, even at and above the limit', async () => {
    const { svc, rows, actions, settings } = build();
    settings.boolean.mockResolvedValue(false);
    await expect(svc.gate(maker, refund(LIMIT * 10))).resolves.toBeUndefined();
    await expect(
      svc.gate(maker, {
        kind: 'aws_budget_limit',
        payload: { name: 'b', limitUsd: 100 },
        amountCents: 0,
        always: true,
        summary: 'budget',
      }),
    ).resolves.toBeUndefined();
    expect(rows).toHaveLength(0);
    expect(actions()).toEqual([
      'admin.approval_skipped',
      'admin.approval_skipped',
    ]);
  });

  it('with the rule on, an «always» kind waits even for $0', async () => {
    const { svc, rows } = build();
    await expect(
      svc.gate(maker, {
        kind: 'aws_budget_delete',
        payload: { name: 'old' },
        amountCents: 0,
        always: true,
        summary: 'delete',
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(rows).toHaveLength(1);
  });
});
