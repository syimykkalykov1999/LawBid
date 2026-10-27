import { BadRequestException, NotFoundException } from '@nestjs/common';
import type Redis from 'ioredis';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditLogService } from '../admin-access/audit-log.service';
import { StaffSamplingService } from '../staff-rating/staff-sampling.service';
import { settingsOf } from '../staff-rating/staff-rating.test-support';
import type { LeaseService } from '../work-lease/lease.service';
import { leaseSourceFor } from '../work-lease/lease-queue-sources';
import type { ReviewAccess } from './staff-review-access.service';
import { StaffReviewService } from './staff-review.service';

const uid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const WORKER = uid(1);
const REV_A = uid(2);
const REV_B = uid(3);
const ITEM = uid(10);
const SAMPLE = uid(20);

const ON = {
  'staff.lease_enabled': true,
  'staff.rating_enabled': true,
  'staff.sampling_enabled': true,
  'staff.golden_enabled': true,
};
const HEAD: ReviewAccess = { level: 'head', workspace: 'mass', kinds: null };
const OWNER: ReviewAccess = { level: 'owner', workspace: null, kinds: null };
const actor = (id: string) =>
  ({ id, adminRole: 'support', ip: '1.1.1.1' }) as never;

interface Row {
  id: string;
  decision_kind: string;
  item_id: string;
  decided_by: string;
  reviewer_id: string | null;
  status: string;
  verdict: string | null;
  is_golden: boolean;
  golden_answer: unknown;
  stage: string | null;
  done_at: Date | null;
}

const sample = (over: Partial<Row> = {}): Row => ({
  id: SAMPLE,
  decision_kind: 'verification',
  item_id: ITEM,
  decided_by: WORKER,
  reviewer_id: null,
  status: 'pending',
  verdict: null,
  is_golden: false,
  golden_answer: { outcome: 'approve' },
  stage: 'sample',
  done_at: null,
  ...over,
});

function make(
  stored: Record<string, unknown> = ON,
  rows: Row[] = [sample()],
  opts: { holder?: string | null; skipOk?: boolean } = {},
) {
  const db = {
    rows,
    signals: [] as Array<Record<string, unknown>>,
    created: [] as Row[],
  };
  const holder = opts.holder === undefined ? REV_A : opts.holder;
  const prisma = {
    staffReviewSample: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(db.rows.find((r) => r.id === where.id) ?? null),
      ),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string; status: string; reviewer_id?: null };
          data: Partial<Row>;
        }) => {
          const r = db.rows.find(
            (x) => x.id === where.id && x.status === where.status,
          );
          if (!r) return Promise.resolve({ count: 0 });
          Object.assign(r, data);
          return Promise.resolve({ count: 1 });
        },
      ),
      createMany: jest.fn(({ data }: { data: Array<Partial<Row>> }) => {
        for (const d of data) {
          db.created.push(sample({ ...d, id: uid(100 + db.created.length) }));
        }
        return Promise.resolve({ count: data.length });
      }),
      create: jest.fn(({ data }: { data: Partial<Row> }) => {
        const r = sample({ ...data, id: uid(200) });
        db.created.push(r);
        return Promise.resolve({ id: r.id });
      }),
    },
    staffQualitySignal: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        db.signals.push(data);
        return Promise.resolve({});
      }),
    },
    workLease: {
      findFirst: jest.fn(() =>
        Promise.resolve(holder ? { id: 'lease' } : null),
      ),
    },
    workLeaseEvent: {
      findFirst: jest.fn(() =>
        Promise.resolve({
          created_at: new Date('2026-10-27T10:00:00Z'),
          held_ms: 42_000,
        }),
      ),
    },
    user: {
      findUnique: jest.fn(() =>
        Promise.resolve({ first_name: 'Ann', last_name: 'Lee' }),
      ),
    },
    verificationRequest: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          status: 'approved',
          submitted_at: null,
          reviewed_at: null,
          rejection_code: null,
          rejection_reason: null,
          admin_note: 'ok',
        }),
      ),
    },
    adminProfile: {
      findUnique: jest.fn(() => Promise.resolve({ workspace: 'mass' })),
      findMany: jest.fn(() =>
        Promise.resolve([{ user_id: WORKER }, { user_id: REV_B }]),
      ),
    },
    staffMemberState: { findMany: jest.fn(() => Promise.resolve([])) },
  };
  const leases = {
    next: jest.fn(),
    mine: jest.fn(() => Promise.resolve([])),
    skip: jest.fn(() =>
      Promise.resolve({ ok: opts.skipOk ?? true, limited: false }),
    ),
    release: jest.fn(() => Promise.resolve(true)),
    done: jest.fn(() => Promise.resolve()),
  };
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const signals = {
    signal: jest.fn(() => Promise.resolve()),
    signalForModerationAction: jest.fn(() => Promise.resolve()),
  };
  const settings = settingsOf(stored);
  const sampling = new StaffSamplingService(
    prisma as unknown as PrismaService,
    settings,
    {} as Redis,
  );
  const svc = new StaffReviewService(
    prisma as unknown as PrismaService,
    settings,
    leases as unknown as LeaseService,
    sampling,
    audit as unknown as AuditLogService,
    signals,
  );
  return { svc, db, prisma, leases, audit, signals };
}

describe('StaffReviewService: the queue', () => {
  it('plugs the re-check samples into the lease engine as `review_sample`', () => {
    make();
    expect(leaseSourceFor('review_sample')).toMatchObject({
      kind: 'review_sample',
      switch: 'staff.sampling_enabled',
    });
  });

  it('«Следующий» leases one sample and shows it read-only; a head never sees who decided', async () => {
    const { svc, leases } = make();
    leases.next.mockResolvedValue({
      status: 'leased',
      lease: {
        kind: 'review_sample',
        itemId: SAMPLE,
        leasedUntil: new Date(Date.now() + 60_000),
      },
    });
    const out = await svc.next(actor(REV_A), HEAD);
    expect(leases.next).toHaveBeenCalledWith('review_sample', {
      adminId: REV_A,
      countries: null,
    });
    expect(out.status).toBe('leased');
    expect(out.sample).toMatchObject({
      id: SAMPLE,
      decisionKind: 'verification',
      outcome: 'approve',
      handleSec: 42,
      worker: null,
    });
    expect(out.sample?.facts).toEqual([
      { key: 'status', value: 'approved' },
      { key: 'adminNote', value: 'ok' },
    ]);
    expect(JSON.stringify(out)).not.toContain(WORKER);
  });

  it('the owner sees who decided', async () => {
    const { svc, leases } = make();
    leases.next.mockResolvedValue({
      status: 'leased',
      lease: { kind: 'review_sample', itemId: SAMPLE, leasedUntil: new Date() },
    });
    const out = await svc.next(actor(REV_A), OWNER);
    expect(out.sample?.worker).toEqual({ adminId: WORKER, name: 'Ann Lee' });
  });

  it('holding a sample already: the same sample comes back; busy with other work: none', async () => {
    const { svc, leases } = make();
    leases.next.mockResolvedValueOnce({
      status: 'busy',
      held: [
        { kind: 'review_sample', itemId: SAMPLE, leasedUntil: new Date() },
      ],
    });
    expect((await svc.next(actor(REV_A), HEAD)).sample?.id).toBe(SAMPLE);
    leases.next.mockResolvedValueOnce({
      status: 'busy',
      held: [{ kind: 'verification', itemId: ITEM, leasedUntil: new Date() }],
    });
    expect(await svc.next(actor(REV_A), HEAD)).toEqual({
      status: 'busy',
      sample: null,
    });
  });

  it('the lease engine off: nothing is leased', async () => {
    const { svc, leases } = make({ ...ON, 'staff.lease_enabled': false });
    expect(await svc.next(actor(REV_A), HEAD)).toEqual({
      status: 'off',
      sample: null,
    });
    expect(leases.next).not.toHaveBeenCalled();
  });

  it('empty / off / away pass through', async () => {
    const { svc, leases } = make();
    for (const status of ['empty', 'off', 'away', 'offline'] as const) {
      leases.next.mockResolvedValueOnce({ status });
      expect(await svc.next(actor(REV_A), HEAD)).toEqual({
        status,
        sample: null,
      });
    }
  });
});

describe('StaffReviewService: the verdict feeds the rating', () => {
  it('confirmed: sample done «same», no signal, lease closed, audit row', async () => {
    const { svc, db, leases, audit, signals } = make();
    const r = await svc.verdict(actor(REV_A), SAMPLE, { verdict: 'confirmed' });
    expect(r).toEqual({ ok: true, result: 'done' });
    expect(db.rows[0]).toMatchObject({
      status: 'done',
      verdict: 'same',
      reviewer_id: REV_A,
    });
    expect(db.signals).toEqual([]);
    expect(signals.signal).not.toHaveBeenCalled();
    expect(leases.done).toHaveBeenCalledWith('review_sample', SAMPLE, REV_A);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: REV_A,
        action: 'staff.review_verdict',
        targetId: SAMPLE,
        after: expect.objectContaining({
          verdict: 'confirmed',
          stored: 'same',
        }),
      }),
    );
  });

  it('overturned: a sample_diff signal against the worker (rating, pay), none against the reviewer', async () => {
    const { svc, db, signals } = make();
    await svc.verdict(actor(REV_A), SAMPLE, {
      verdict: 'overturned',
      reasons: ['wrong_outcome', 'wrong_outcome'],
    });
    expect(db.rows[0]).toMatchObject({ status: 'done', verdict: 'different' });
    expect(db.signals).toEqual([
      expect.objectContaining({
        admin_id: WORKER,
        kind: 'sample_diff',
        item_id: ITEM,
      }),
    ]);
    expect(signals.signal).not.toHaveBeenCalled();
  });

  it('a harmful mistake is «worse» and also counts toward the red «overturned» flag', async () => {
    const { svc, db, signals } = make();
    await svc.verdict(actor(REV_A), SAMPLE, {
      verdict: 'overturned',
      reasons: ['harmful'],
    });
    expect(db.rows[0].verdict).toBe('worse');
    expect(signals.signal).toHaveBeenCalledWith(
      WORKER,
      'overturned',
      'verification',
      ITEM,
    );
  });

  it('overturning needs a reason', async () => {
    const { svc, db } = make();
    await expect(
      svc.verdict(actor(REV_A), SAMPLE, { verdict: 'overturned' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.rows[0].status).toBe('pending');
  });

  it('unclear: no mark for anybody, the sample goes to another reviewer', async () => {
    const { svc, db, leases, audit } = make();
    const r = await svc.verdict(actor(REV_A), SAMPLE, { verdict: 'unclear' });
    expect(r).toEqual({ ok: true, result: 'returned' });
    expect(db.rows[0]).toMatchObject({ status: 'pending', verdict: null });
    expect(db.signals).toEqual([]);
    expect(leases.skip).toHaveBeenCalledWith(
      'review_sample',
      SAMPLE,
      REV_A,
      'unclear',
    );
    expect(leases.done).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalled();
  });

  it('unclear over the skip limit still lets go of the sample', async () => {
    const { svc, leases } = make(ON, [sample()], { skipOk: false });
    await svc.verdict(actor(REV_A), SAMPLE, { verdict: 'unclear' });
    expect(leases.release).toHaveBeenCalledWith('review_sample', SAMPLE, REV_A);
  });

  it('whoever does not hold the lease cannot give a verdict', async () => {
    const { svc, db } = make(ON, [sample()], { holder: null });
    await expect(
      svc.verdict(actor(REV_B), SAMPLE, { verdict: 'confirmed' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.rows[0].status).toBe('pending');
  });

  it('a sample that is already done, golden or missing is gone', async () => {
    for (const rows of [
      [sample({ status: 'done', verdict: 'same' })],
      [sample({ is_golden: true })],
      [],
    ]) {
      const { svc } = make(ON, rows);
      await expect(
        svc.verdict(actor(REV_A), SAMPLE, { verdict: 'confirmed' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it('nobody re-checks their own decision', async () => {
    const { svc, db } = make();
    await expect(
      svc.verdict(actor(WORKER), SAMPLE, { verdict: 'confirmed' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.rows[0].status).toBe('pending');
  });
});

describe('StaffReviewService: calibration copies (reviewer against reviewer)', () => {
  const dice = (v: number) => jest.spyOn(Math, 'random').mockReturnValue(v);
  afterEach(() => jest.restoreAllMocks());

  it('peer check off: no copy is queued', async () => {
    dice(0);
    const { svc, db } = make();
    await svc.verdict(actor(REV_A), SAMPLE, { verdict: 'confirmed' });
    expect(db.created).toEqual([]);
  });

  it('peer check on: a small share of verdicts is queued once more for a second reviewer', async () => {
    dice(0.001);
    const { svc, db } = make({ ...ON, 'staff.peer_check_enabled': true });
    await svc.verdict(actor(REV_A), SAMPLE, {
      verdict: 'overturned',
      reasons: ['too_hasty'],
    });
    expect(db.created).toHaveLength(1);
    expect(db.created[0]).toMatchObject({
      decision_kind: 'cal_verification',
      item_id: ITEM,
      // the reviewer is the one being checked — never the worker
      decided_by: REV_A,
      stage: 'peer',
      golden_answer: {
        outcome: 'approve',
        origReviewer: REV_A,
        origVerdict: 'different',
        origSample: SAMPLE,
      },
    });
  });

  it('outside the percent no copy is queued', async () => {
    dice(0.9);
    const { svc, db } = make({ ...ON, 'staff.peer_check_enabled': true });
    await svc.verdict(actor(REV_A), SAMPLE, { verdict: 'confirmed' });
    expect(db.created).toEqual([]);
  });

  it("the second reviewer's verdict is stored apart: no signal, not counted as a worker check, no further copy", async () => {
    dice(0);
    const peer = sample({
      id: uid(30),
      decision_kind: 'cal_verification',
      decided_by: REV_A,
      stage: 'peer',
      golden_answer: {
        outcome: 'approve',
        origReviewer: REV_A,
        origVerdict: 'same',
      },
    });
    const { svc, db, signals } = make(
      { ...ON, 'staff.peer_check_enabled': true },
      [peer],
    );
    await svc.verdict(actor(REV_B), uid(30), {
      verdict: 'overturned',
      reasons: ['harmful'],
    });
    expect(db.rows[0]).toMatchObject({
      status: 'peer_done',
      verdict: 'worse',
      reviewer_id: REV_B,
    });
    expect(db.signals).toEqual([]);
    expect(signals.signal).not.toHaveBeenCalled();
    expect(db.created).toEqual([]);
  });

  it('a peer copy does not reveal who decided, not even to the owner', async () => {
    const peer = sample({
      id: uid(30),
      decision_kind: 'cal_verification',
      decided_by: REV_A,
      stage: 'peer',
    });
    const { svc, leases } = make(ON, [peer]);
    leases.next.mockResolvedValue({
      status: 'leased',
      lease: {
        kind: 'review_sample',
        itemId: uid(30),
        leasedUntil: new Date(),
      },
    });
    const out = await svc.next(actor(REV_B), OWNER);
    expect(out.sample).toMatchObject({
      decisionKind: 'verification',
      worker: null,
    });
  });
});

describe('StaffReviewService: golden tasks by hand', () => {
  const confirmed = () =>
    sample({ status: 'done', verdict: 'same', reviewer_id: REV_A });

  it('off: not found', async () => {
    const { svc } = make({ ...ON, 'staff.golden_enabled': false }, [
      confirmed(),
    ]);
    await expect(
      svc.markGolden(actor(REV_A), HEAD, { sampleId: SAMPLE }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('only a confirmed decision can become golden', async () => {
    for (const row of [
      sample(),
      sample({ status: 'done', verdict: 'different' }),
      sample({ status: 'done', verdict: 'same', is_golden: true }),
      sample({
        status: 'done',
        verdict: 'same',
        decision_kind: 'cal_verification',
      }),
    ]) {
      const { svc } = make(ON, [row]);
      await expect(
        svc.markGolden(actor(REV_A), HEAD, { sampleId: SAMPLE }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('creates a golden task for a worker of the workspace (never the one who decided) and audits it', async () => {
    const { svc, db, audit } = make(ON, [confirmed()]);
    const r = await svc.markGolden(
      actor(REV_A),
      HEAD,
      { sampleId: SAMPLE },
      () => 0,
    );
    expect(r.ok).toBe(true);
    expect(db.created[0]).toMatchObject({
      decision_kind: 'golden_verification',
      item_id: ITEM,
      decided_by: REV_B,
      is_golden: true,
      stage: 'golden',
      golden_answer: { outcome: 'approve' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'staff.golden_marked' }),
    );
  });

  it('a head cannot reach a decision of another workspace', async () => {
    const { svc, prisma } = make(ON, [confirmed()]);
    prisma.adminProfile.findUnique.mockResolvedValue({ workspace: 'finance' });
    await expect(
      svc.markGolden(actor(REV_A), HEAD, { sampleId: SAMPLE }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a named worker who cannot take this kind of task is refused', async () => {
    const { svc, prisma } = make(ON, [confirmed()]);
    prisma.adminProfile.findMany.mockResolvedValue([]);
    await expect(
      svc.markGolden(actor(REV_A), OWNER, {
        sampleId: SAMPLE,
        workerId: REV_B,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
