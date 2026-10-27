import type { PrismaService } from '../../prisma/prisma.service';
import { StaffReviewReadService } from './staff-review-read.service';
import type { ReviewAccess } from './staff-review-access.service';

const OWNER: ReviewAccess = { level: 'owner', workspace: null, kinds: null };
const HEAD: ReviewAccess = { level: 'head', workspace: 'mass', kinds: null };

/** Answers each raw query in call order; counts them. */
function make(...answers: unknown[][]) {
  const queue = [...answers];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const raw = jest.fn((_s: TemplateStringsArray, ..._v: unknown[]) =>
    Promise.resolve(queue.shift() ?? []),
  );
  const prisma = { $queryRaw: raw };
  return {
    raw,
    svc: new StaffReviewReadService(prisma as unknown as PrismaService),
  };
}

const D = new Date('2026-10-26T00:00:00Z');

describe('StaffReviewReadService.stats', () => {
  it('per workspace: re-checked, overturn rate, returned rate, golden, queue; calibration per kind — in three queries', async () => {
    const { svc, raw } = make(
      [
        {
          workspace: 'mass',
          snapshot_date: D,
          decided: 1000,
          reopened: 30,
          complaints: 20,
          sampled: 60,
          sample_diff: 9,
          golden_total: 20,
          golden_fail: 3,
        },
        {
          workspace: 'finance',
          snapshot_date: D,
          decided: 0,
          reopened: 0,
          complaints: 0,
          sampled: 0,
          sample_diff: 0,
          golden_total: 0,
          golden_fail: 0,
        },
      ],
      [
        { workspace: 'mass', n: 7 },
        { workspace: 'owner', n: 1 },
      ],
      [
        { kind: 'report', pairs: 10, agree: 9 },
        { kind: 'verification', pairs: 3, agree: 1 },
      ],
    );
    const out = await svc.stats(OWNER);
    expect(raw).toHaveBeenCalledTimes(3);
    expect(out.snapshotDate).toBe('2026-10-26');
    expect(out.workspaces).toEqual([
      {
        workspace: 'mass',
        decisions: 1000,
        sampled: 60,
        overturned: 9,
        overturnRate: 15,
        returnedRate: 5,
        goldenTotal: 20,
        goldenFailed: 3,
        pending: 7,
      },
      expect.objectContaining({
        workspace: 'finance',
        overturnRate: null,
        returnedRate: null,
        pending: 0,
      }),
      // a queue with no snapshot yet still shows
      expect.objectContaining({ workspace: 'owner', pending: 1, sampled: 0 }),
    ]);
    expect(out.calibration).toEqual([
      { decisionKind: 'report', pairs: 10, agreementPct: 90 },
      { decisionKind: 'verification', pairs: 3, agreementPct: 33 },
    ]);
  });

  it('nothing yet: empty, still three queries at most', async () => {
    const { svc, raw } = make();
    const out = await svc.stats(HEAD);
    expect(out).toEqual({
      snapshotDate: null,
      workspaces: [],
      calibration: [],
    });
    expect(raw.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('a head asks for their workspace only', async () => {
    const { svc, raw } = make();
    await svc.stats(HEAD);
    for (const call of raw.mock.calls) {
      expect(
        call
          .slice(1)
          .some(
            (v) =>
              v === 'mass' ||
              (v as { values?: unknown[] })?.values?.includes('mass'),
          ),
      ).toBe(true);
    }
  });
});

describe('StaffReviewReadService.team', () => {
  it('returned rate per worker from the latest snapshot, one query', async () => {
    const { svc, raw } = make([
      {
        admin_id: 'a1',
        snapshot_date: D,
        first_name: 'Ann',
        last_name: 'Lee',
        decided: 200,
        reopened: 8,
        complaints: 2,
        sampled: 10,
        sample_diff: 1,
        golden_total: 4,
        golden_fail: 1,
      },
      {
        admin_id: 'a2',
        snapshot_date: D,
        first_name: null,
        last_name: null,
        decided: 0,
        reopened: 0,
        complaints: 0,
        sampled: 0,
        sample_diff: 0,
        golden_total: 0,
        golden_fail: 0,
      },
    ]);
    const out = await svc.team(HEAD);
    expect(raw).toHaveBeenCalledTimes(1);
    expect(out.snapshotDate).toBe('2026-10-26');
    expect(out.items).toEqual([
      {
        adminId: 'a1',
        name: 'Ann Lee',
        decisions: 200,
        returnedRate: 5,
        sampled: 10,
        overturned: 1,
        goldenTotal: 4,
        goldenFailed: 1,
      },
      expect.objectContaining({
        adminId: 'a2',
        name: 'Admin',
        returnedRate: null,
      }),
    ]);
  });
});

describe('StaffReviewReadService.golden', () => {
  it('pending, passed and failed, with the worker named (owner and heads only)', async () => {
    const { svc, raw } = make([
      {
        id: 'g1',
        decision_kind: 'golden_report',
        status: 'pending',
        verdict: null,
        created_at: D,
        done_at: null,
        decided_by: 'w1',
        first_name: 'Ann',
        last_name: null,
      },
      {
        id: 'g2',
        decision_kind: 'golden_report',
        status: 'done',
        verdict: 'same',
        created_at: D,
        done_at: D,
        decided_by: 'w1',
        first_name: 'Ann',
        last_name: null,
      },
      {
        id: 'g3',
        decision_kind: 'golden_report',
        status: 'done',
        verdict: 'different',
        created_at: D,
        done_at: D,
        decided_by: 'w2',
        first_name: null,
        last_name: null,
      },
    ]);
    const out = await svc.golden(OWNER);
    expect(raw).toHaveBeenCalledTimes(1);
    expect(out.items.map((i) => [i.id, i.state, i.worker.name])).toEqual([
      ['g1', 'pending', 'Ann'],
      ['g2', 'passed', 'Ann'],
      ['g3', 'failed', 'Admin'],
    ]);
  });
});
