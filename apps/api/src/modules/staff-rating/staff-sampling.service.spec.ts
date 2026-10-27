import type { PrismaService } from '../../prisma/prisma.service';
import { StaffSamplingService } from './staff-sampling.service';
import { SAMPLE_QUEUE_KEY, type SamplePick } from './staff-recorder.service';
import {
  FakeStaffRedis,
  RATING_ON,
  settingsOf,
} from './staff-rating.test-support';

const NOW = new Date('2026-10-27T01:10:00Z');
const OLD = '11111111-1111-4111-8111-111111111111';
const NEW = '22222222-2222-4222-8222-222222222222';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const pick = (a: string, u: number, n: number): string =>
  JSON.stringify({
    a,
    k: 'verification',
    i: id(n),
    u,
    o: 'approve',
  } satisfies SamplePick);

function make(stored: Record<string, unknown> = RATING_ON) {
  const redis = new FakeStaffRedis();
  const createMany = jest.fn((a: { data: unknown[] }) =>
    Promise.resolve({ count: a.data.length }),
  );
  const prisma = {
    staffMemberState: { findMany: jest.fn(() => Promise.resolve([])) },
    adminProfile: {
      findMany: jest.fn(() =>
        Promise.resolve([
          { user_id: OLD, created_at: new Date('2026-01-01T00:00:00Z') },
          { user_id: NEW, created_at: new Date('2026-10-20T00:00:00Z') },
        ]),
      ),
    },
    staffReviewSample: {
      createMany,
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    staffQualitySignal: { create: jest.fn(() => Promise.resolve({})) },
  };
  const svc = new StaffSamplingService(
    prisma as unknown as PrismaService,
    settingsOf(stored),
    redis.asRedis(),
  );
  return { redis, prisma, createMany, svc };
}

describe('StaffSamplingService.drainQueue (5% / 20% for a newcomer)', () => {
  it('off: touches nothing', async () => {
    const { svc, redis, createMany } = make({});
    redis.lists.set(SAMPLE_QUEUE_KEY, [pick(OLD, 0.01, 1)]);
    expect(await svc.drainQueue(NOW)).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
    expect(redis.lists.get(SAMPLE_QUEUE_KEY)).toHaveLength(1);
  });

  it("keeps a pick when the dice is under the person's percent", async () => {
    const { svc, redis, createMany } = make();
    redis.lists.set(SAMPLE_QUEUE_KEY, [
      pick(OLD, 0.04, 1), // 4% < 5%: kept
      pick(OLD, 0.1, 2), //  10% >= 5%: dropped
      pick(NEW, 0.1, 3), //  newcomer (7 days in): 10% < 20%: kept
      pick(NEW, 0.25, 4), // 25% >= 20%: dropped
    ]);
    expect(await svc.drainQueue(NOW)).toBe(2);
    const data = (
      createMany.mock.calls[0] as unknown as [
        { data: Array<{ item_id: string; stage: string; decided_by: string }> },
      ]
    )[0].data;
    expect(data.map((d) => [d.item_id, d.stage, d.decided_by])).toEqual([
      [id(1), 'sample', OLD],
      [id(3), 'newcomer', NEW],
    ]);
    expect(redis.lists.get(SAMPLE_QUEUE_KEY)).toHaveLength(0);
  });

  it('survives a broken queue entry', async () => {
    const { svc, redis } = make();
    redis.lists.set(SAMPLE_QUEUE_KEY, ['not json', pick(OLD, 0.01, 1)]);
    expect(await svc.drainQueue(NOW)).toBe(1);
  });
});

describe('StaffSamplingService.issueGolden (2%)', () => {
  const people = new Map([[OLD, { decided: 100, role: 'verifier' as const }]]);

  it('off (switch golden): nothing', async () => {
    const { svc, createMany } = make({ 'staff.rating_enabled': true });
    expect(await svc.issueGolden(people)).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('about 2 tasks per 100 decisions, from confirmed decisions of others', async () => {
    const { svc, prisma, createMany } = make();
    prisma.staffReviewSample.findMany.mockResolvedValue([
      { item_id: id(7), decided_by: NEW, golden_answer: { outcome: 'reject' } },
      {
        item_id: id(8),
        decided_by: OLD,
        golden_answer: { outcome: 'approve' },
      }, // own: never
    ]);
    const n = await svc.issueGolden(people, () => 0.5);
    expect(n).toBe(2);
    const data = (
      createMany.mock.calls[0] as unknown as [
        { data: Array<Record<string, unknown>> },
      ]
    )[0].data;
    expect(data).toHaveLength(2);
    expect(
      data.every(
        (d) =>
          d.item_id === id(7) && d.is_golden === true && d.decided_by === OLD,
      ),
    ).toBe(true);
    expect(data[0]).toMatchObject({
      decision_kind: 'golden_verification',
      stage: 'golden',
      golden_answer: { outcome: 'reject' },
    });
  });

  it('finance and the owner get no golden tasks (no queue kinds)', async () => {
    const { svc, createMany } = make();
    await svc.issueGolden(
      new Map([[OLD, { decided: 500, role: 'finance' as const }]]),
    );
    expect(createMany).not.toHaveBeenCalled();
  });
});

describe('verdicts', () => {
  const REVIEWER = '33333333-3333-4333-8333-333333333333';

  it('a differing re-check is a sample_diff signal against the decider', async () => {
    const { svc, prisma } = make();
    prisma.staffReviewSample.findUnique.mockResolvedValue({
      id: 's1',
      status: 'pending',
      is_golden: false,
      decided_by: OLD,
      decision_kind: 'verification',
      item_id: id(1),
    });
    prisma.staffReviewSample.updateMany.mockResolvedValue({ count: 1 });
    expect(await svc.completeSample('s1', REVIEWER, 'different')).toBe(true);
    expect(prisma.staffQualitySignal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ admin_id: OLD, kind: 'sample_diff' }),
    });
  });

  it('«same» writes no signal; one cannot check their own decision; done rows are final', async () => {
    const { svc, prisma } = make();
    const row = {
      id: 's1',
      status: 'pending',
      is_golden: false,
      decided_by: OLD,
      decision_kind: 'verification',
      item_id: id(1),
    };
    prisma.staffReviewSample.findUnique.mockResolvedValue(row);
    prisma.staffReviewSample.updateMany.mockResolvedValue({ count: 1 });
    expect(await svc.completeSample('s1', REVIEWER, 'same')).toBe(true);
    expect(prisma.staffQualitySignal.create).not.toHaveBeenCalled();
    expect(await svc.completeSample('s1', OLD, 'different')).toBe(false);
    prisma.staffReviewSample.findUnique.mockResolvedValue({
      ...row,
      status: 'done',
    });
    expect(await svc.completeSample('s1', REVIEWER, 'different')).toBe(false);
  });

  it('a golden task compares with the known answer', async () => {
    const { svc, prisma } = make();
    const row = {
      id: 'g1',
      status: 'pending',
      is_golden: true,
      decided_by: OLD,
      decision_kind: 'golden_verification',
      item_id: id(1),
      golden_answer: { outcome: 'reject' },
    };
    prisma.staffReviewSample.findUnique.mockResolvedValue(row);
    prisma.staffReviewSample.updateMany.mockResolvedValue({ count: 1 });
    expect(await svc.resolveGolden('g1', 'approve')).toBe(false);
    expect(prisma.staffQualitySignal.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ kind: 'golden_fail' }),
    });
    expect(await svc.resolveGolden('g1', 'reject')).toBe(true);
    expect(prisma.staffQualitySignal.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ kind: 'golden_pass' }),
    });
  });
});
