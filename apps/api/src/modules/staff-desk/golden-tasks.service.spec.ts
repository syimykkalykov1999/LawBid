import { GoldenTasksService } from './golden-tasks.service';

type Sw = Record<string, boolean>;

function make(switches: Sw, row: Record<string, unknown> | null = null) {
  const prisma = {
    staffReviewSample: {
      findFirst: jest.fn().mockResolvedValue(row),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    staffQualitySignal: { create: jest.fn().mockResolvedValue({}) },
  };
  const staff = { get: jest.fn().mockResolvedValue({ switches, numbers: {} }) };
  const svc = new GoldenTasksService(prisma as never, staff as never);
  return { svc, prisma };
}

const ON = { 'staff.rating_enabled': true, 'staff.golden_enabled': true };

describe('GoldenTasksService', () => {
  it('serves nothing while the rating or the golden switch is off (no query at all)', async () => {
    for (const sw of [
      {},
      { 'staff.rating_enabled': true },
      { 'staff.golden_enabled': true },
    ]) {
      const { svc, prisma } = make(sw as Sw, { item_id: 'x' });
      expect(await svc.pick('a1', 'support_ticket')).toBeNull();
      expect(prisma.staffReviewSample.findFirst).not.toHaveBeenCalled();
    }
  });

  it('picks the oldest pending golden task of this person in this queue', async () => {
    const { svc, prisma } = make(ON, { item_id: 'item-9' });
    expect(await svc.pick('a1', 'verification')).toBe('item-9');
    expect(prisma.staffReviewSample.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          decided_by: 'a1',
          decision_kind: 'golden_verification',
          is_golden: true,
          status: 'pending',
        },
        orderBy: { created_at: 'asc' },
      }),
    );
  });

  it('a matching answer is a pass, a different one a fail (a quality signal, nothing else)', async () => {
    const row = {
      id: 's1',
      decision_kind: 'golden_verification',
      golden_answer: { outcome: 'approve' },
    };
    const pass = make(ON, row);
    await pass.svc.resolve('a1', 'verification', 'item-9', 'approve');
    expect(pass.prisma.staffReviewSample.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'done', verdict: 'same' }),
      }),
    );
    expect(pass.prisma.staffQualitySignal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        admin_id: 'a1',
        kind: 'golden_pass',
        item_id: 'item-9',
      }),
    });
    const fail = make(ON, row);
    await fail.svc.resolve('a1', 'verification', 'item-9', 'reject');
    expect(fail.prisma.staffQualitySignal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: 'golden_fail' }),
    });
  });

  it('an ordinary item (no golden row) or a lost race changes nothing', async () => {
    const none = make(ON, null);
    await none.svc.resolve('a1', 'verification', 'item-9', 'approve');
    expect(none.prisma.staffQualitySignal.create).not.toHaveBeenCalled();
    const raced = make(ON, {
      id: 's1',
      decision_kind: 'golden_verification',
      golden_answer: { outcome: 'approve' },
    });
    raced.prisma.staffReviewSample.updateMany.mockResolvedValue({ count: 0 });
    await raced.svc.resolve('a1', 'verification', 'item-9', 'approve');
    expect(raced.prisma.staffQualitySignal.create).not.toHaveBeenCalled();
  });
});
