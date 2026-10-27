import type { PrismaService } from '../../prisma/prisma.service';
import { StaffCountersService } from './staff-counters.service';
import {
  SAMPLE_QUEUE_KEY,
  StaffRecorderService,
} from './staff-recorder.service';
import {
  FakeStaffRedis,
  RATING_ON,
  settingsOf,
} from './staff-rating.test-support';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';

/** A database that fails the test if anything touches it. */
const noDb = new Proxy(
  {},
  {
    get: (_t, prop) => {
      if (prop === 'then') return undefined;
      throw new Error(`DB touched: ${String(prop)}`);
    },
  },
) as unknown as PrismaService;

function make(stored: Record<string, unknown>, prisma: PrismaService = noDb) {
  const redis = new FakeStaffRedis();
  const counters = new StaffCountersService(prisma, redis.asRedis());
  const rec = new StaffRecorderService(
    settingsOf(stored),
    counters,
    prisma,
    redis.asRedis(),
  );
  return { redis, rec };
}

const event = (o: object = {}) => ({
  adminId: ADMIN,
  itemKind: 'verification',
  itemId: ITEM,
  outcome: 'approve',
  ...o,
});

describe('StaffRecorderService', () => {
  it('switch off (the default): no Redis command, no query', async () => {
    const { redis, rec } = make({});
    await rec.record(event());
    await rec.signal(ADMIN, 'reopened', 'support_ticket', ITEM);
    await rec.signalForModerationAction(ITEM, 'overturned', 'report', ITEM);
    expect(redis.commands).toBe(0);
    expect(redis.hashes.size).toBe(0);
  });

  it('on: a decision is counted in Redis with no database query', async () => {
    const { redis, rec } = make({ 'staff.rating_enabled': true });
    await rec.record(event({ handleMs: 42_000 }));
    const key = [...redis.hashes.keys()].find((k) =>
      k.startsWith('staff:ctr:'),
    )!;
    expect(key).toContain(ADMIN);
    const h = redis.hashes.get(key)!;
    expect(h.get('d')).toBe(1);
    expect(h.get('h')).toBe(42_000);
    expect(h.get('n')).toBe(1);
    expect(h.get('o_approve')).toBe(1);
    expect(h.get('b3')).toBe(1); // 30-60 s
    // set NX + one pipeline: two round trips, whatever the decision
    expect(redis.commands).toBe(2);
  });

  it('the same item reported twice counts once; a late handling time is added', async () => {
    const { redis, rec } = make({ 'staff.rating_enabled': true });
    await rec.record(event());
    await rec.record(event());
    await rec.record(event({ handleMs: 10_000 }));
    await rec.record(event({ handleMs: 99_000 }));
    const h = [...redis.hashes.values()][0];
    expect(h.get('d')).toBe(1);
    expect(h.get('n')).toBe(1);
    expect(h.get('h')).toBe(10_000);
  });

  it('ignores a malformed admin id and swallows Redis errors', async () => {
    const { redis, rec } = make({ 'staff.rating_enabled': true });
    await rec.record(event({ adminId: 'not-a-uuid' }));
    expect(redis.commands).toBe(0);
    redis.set = () => Promise.reject(new Error('redis down'));
    await expect(rec.record(event())).resolves.toBeUndefined();
  });

  it('sampling off: nothing is queued; on: a pick lands in the queue', async () => {
    const off = make({ 'staff.rating_enabled': true });
    jest.spyOn(Math, 'random').mockReturnValue(0);
    await off.rec.record(event());
    expect(off.redis.lists.size).toBe(0);

    const on = make({ ...RATING_ON });
    await on.rec.record(event());
    const queued = on.redis.lists.get(SAMPLE_QUEUE_KEY)!;
    expect(queued).toHaveLength(1);
    expect(JSON.parse(queued[0])).toMatchObject({
      a: ADMIN,
      k: 'verification',
      i: ITEM,
      o: 'approve',
    });
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    await on.rec.record(
      event({ itemId: '33333333-3333-4333-8333-333333333333' }),
    );
    expect(on.redis.lists.get(SAMPLE_QUEUE_KEY)).toHaveLength(1);
    jest.restoreAllMocks();
  });

  it('a signal is one row; failures never reach the caller', async () => {
    const create = jest.fn(() => Promise.resolve({}));
    const prisma = {
      staffQualitySignal: { create },
    } as unknown as PrismaService;
    const { rec } = make({ 'staff.rating_enabled': true }, prisma);
    await rec.signal(ADMIN, 'reopened', 'support_ticket', ITEM);
    expect(create).toHaveBeenCalledWith({
      data: {
        admin_id: ADMIN,
        kind: 'reopened',
        item_kind: 'support_ticket',
        item_id: ITEM,
      },
    });
    create.mockRejectedValueOnce(new Error('db down'));
    await expect(
      rec.signal(ADMIN, 'complaint', 'report', ITEM),
    ).resolves.toBeUndefined();
  });

  it('a moderation-action signal looks the moderator up (rating on only)', async () => {
    const findUnique = jest.fn(() => Promise.resolve({ admin_id: ADMIN }));
    const create = jest.fn(() => Promise.resolve({}));
    const prisma = {
      moderationAction: { findUnique },
      staffQualitySignal: { create },
    } as unknown as PrismaService;
    const { rec } = make({ 'staff.rating_enabled': true }, prisma);
    await rec.signalForModerationAction(ITEM, 'overturned', 'report', ITEM);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ admin_id: ADMIN, kind: 'overturned' }),
    });
  });
});
