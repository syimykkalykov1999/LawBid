import { ConflictException, NotFoundException } from '@nestjs/common';
import type { CaseStatus, Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import {
  AUTO_CLOSE_AFTER_MS,
  CASE_ACTIONS,
  CaseStateMachine,
  planCaseTransition,
  type CaseAction,
} from './case-state-machine';

const STATUSES: CaseStatus[] = [
  'open',
  'in_progress',
  'pending_completion',
  'disputed',
  'closed',
  'archived',
];

// docs/04_CASES_BIDS.md §10.1, written out independently of the machine's
// table: [from, action, to, journal event].
const ALLOWED: [CaseStatus, CaseAction, CaseStatus, string][] = [
  ['open', 'accept_bid', 'in_progress', 'bid_accepted'],
  ['open', 'client_close', 'closed', 'closed'],
  ['open', 'auto_archive', 'archived', 'archived'],
  ['archived', 'client_restore', 'open', 'restored'],
  [
    'in_progress',
    'client_complete',
    'pending_completion',
    'completion_requested',
  ],
  ['pending_completion', 'attorney_confirm', 'closed', 'completion_confirmed'],
  ['pending_completion', 'auto_close', 'closed', 'auto_closed'],
  ['pending_completion', 'attorney_dispute', 'disputed', 'disputed'],
  ['disputed', 'admin_resolve_close', 'closed', 'dispute_resolved'],
  ['disputed', 'admin_resolve_reopen', 'in_progress', 'dispute_resolved'],
  // In-place (§3.5, §10.2): edit / keep-alive only while open; delete only
  // from open or archived.
  ['open', 'client_edit', 'open', 'updated'],
  ['open', 'client_keep_alive', 'open', 'updated'],
  ['open', 'system_stale_prompt', 'open', 'updated'],
  ['open', 'client_delete', 'open', 'deleted'],
  ['archived', 'client_delete', 'archived', 'deleted'],
];

const now = new Date('2026-09-27T12:00:00.000Z');
const ctx = { now, acceptedBidId: 'bid-1' };

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof ConflictException) {
      return (e.getResponse() as { code: string }).code;
    }
    throw e;
  }
  return undefined;
}

describe('CaseStateMachine (docs/04 §10.1)', () => {
  const pairs = STATUSES.flatMap((s) =>
    CASE_ACTIONS.map((a) => [s, a] as const),
  );

  it('covers every status × action pair (6 × 14)', () => {
    expect(CASE_ACTIONS).toHaveLength(14);
    expect(pairs).toHaveLength(84);
  });

  it.each(pairs)('%s + %s', (from, action) => {
    const row = ALLOWED.find(([f, a]) => f === from && a === action);
    if (row) {
      const plan = planCaseTransition(from, action, ctx);
      expect(plan.from).toBe(from);
      expect(plan.to).toBe(row[2]);
      expect(plan.event).toBe(row[3]);
      if (row[2] !== from) expect(plan.data.status).toBe(row[2]);
      else expect(plan.data.status).toBeUndefined();
    } else {
      expect(codeOf(() => planCaseTransition(from, action, ctx))).toBe(
        ErrorCode.CASE_INVALID_STATE,
      );
    }
  });

  it('the status graph is exactly the §10.1 table', () => {
    const edges = new Set<string>();
    for (const [from, action] of pairs) {
      try {
        const p = planCaseTransition(from, action, ctx);
        if (p.to !== from) edges.add(`${from}->${p.to}`);
      } catch {
        // forbidden
      }
    }
    expect([...edges].sort()).toEqual(
      [
        'open->in_progress',
        'open->closed',
        'open->archived',
        'archived->open',
        'in_progress->pending_completion',
        'pending_completion->closed',
        'pending_completion->disputed',
        'disputed->closed',
        'disputed->in_progress',
      ].sort(),
    );
    // closed is terminal (§3.5 "Открыть заново нельзя").
    for (const action of CASE_ACTIONS) {
      expect(codeOf(() => planCaseTransition('closed', action, ctx))).toBe(
        ErrorCode.CASE_INVALID_STATE,
      );
    }
  });

  it('writes the §10.1 columns', () => {
    expect(planCaseTransition('open', 'accept_bid', ctx).data).toEqual({
      status: 'in_progress',
      accepted_bid_id: 'bid-1',
      last_activity_at: now,
    });
    expect(
      planCaseTransition('in_progress', 'client_complete', ctx).data,
    ).toEqual({
      status: 'pending_completion',
      client_completed_at: now,
      auto_close_at: new Date(now.getTime() + AUTO_CLOSE_AFTER_MS),
      last_activity_at: now,
    });
    expect(AUTO_CLOSE_AFTER_MS).toBe(7 * 24 * 3600 * 1000);
    expect(planCaseTransition('archived', 'client_restore', ctx).data).toEqual({
      status: 'open',
      archived_at: null,
      last_activity_at: now,
      stale_prompt_sent_at: null,
    });
    expect(
      planCaseTransition('pending_completion', 'attorney_confirm', ctx).data,
    ).toEqual({
      status: 'closed',
      attorney_confirmed_at: now,
      closed_at: now,
    });
    expect(
      planCaseTransition('pending_completion', 'auto_close', ctx).data,
    ).toEqual({
      status: 'closed',
      closed_at: now,
    });
    expect(
      planCaseTransition('disputed', 'admin_resolve_close', ctx).data,
    ).toEqual({
      status: 'closed',
      closed_at: now,
    });
    expect(planCaseTransition('open', 'auto_archive', ctx).data).toEqual({
      status: 'archived',
      archived_at: now,
    });
    expect(planCaseTransition('archived', 'client_delete', ctx).data).toEqual({
      deleted_at: now,
    });
  });

  it('accept_bid without a bid id is a programming error', () => {
    expect(() => planCaseTransition('open', 'accept_bid', { now })).toThrow(
      /acceptedBidId/,
    );
  });

  describe('apply (guarded write in the caller transaction)', () => {
    function fakeTx(status: CaseStatus | null, count = 1) {
      const tx = {
        case: {
          findUnique: jest.fn().mockResolvedValue(status ? { status } : null),
          updateMany: jest.fn().mockResolvedValue({ count }),
          findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'c1', status }),
        },
      };
      return { tx, client: tx as unknown as Prisma.TransactionClient };
    }
    const machine = new CaseStateMachine();

    it('compare-and-sets on the status it planned from', async () => {
      const { tx, client } = fakeTx('in_progress');
      const { plan } = await machine.apply(client, {
        caseId: 'c1',
        action: 'client_complete',
        now,
      });
      expect(plan.to).toBe('pending_completion');
      expect(tx.case.updateMany).toHaveBeenCalledWith({
        where: { id: 'c1', status: 'in_progress', deleted_at: null },
        data: expect.objectContaining({
          status: 'pending_completion',
        }) as unknown,
      });
    });

    it('merges extra columns but never lets them override the transition', async () => {
      const { tx, client } = fakeTx('open');
      await machine.apply(client, {
        caseId: 'c1',
        action: 'client_edit',
        now,
        extra: { title: 'New title' },
      });
      expect(tx.case.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { title: 'New title', last_activity_at: now },
        }),
      );
    });

    it('missing (or soft-deleted) case → CASE_NOT_FOUND', async () => {
      const { client } = fakeTx(null);
      await expect(
        machine.apply(client, { caseId: 'c1', action: 'client_close' }),
      ).rejects.toMatchObject({
        constructor: NotFoundException,
        response: { code: ErrorCode.CASE_NOT_FOUND },
      });
    });

    it('forbidden transition → CASE_INVALID_STATE, nothing written', async () => {
      const { tx, client } = fakeTx('closed');
      await expect(
        machine.apply(client, { caseId: 'c1', action: 'client_complete' }),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.CASE_INVALID_STATE },
      });
      expect(tx.case.updateMany).not.toHaveBeenCalled();
    });

    it('lost race (row changed after the read) → CASE_INVALID_STATE', async () => {
      const { client } = fakeTx('open', 0);
      await expect(
        machine.apply(client, { caseId: 'c1', action: 'client_close' }),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.CASE_INVALID_STATE },
      });
    });
  });
});
