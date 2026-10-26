import type { PinoLogger } from 'nestjs-pino';
import type { NotificationsService } from '../../modules/notifications/notifications.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { TaskRemindersJob } from './tasks-planner.jobs';

/** Owner 2026-10-20: a reminder is never lost — a failed send is released
 * for the next run, a late one goes out once as "missed", and a repeating
 * task whose time came sets up the next one on its own. */
describe('TaskRemindersJob', () => {
  const NOW = new Date('2026-10-20T12:00:00Z');
  const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

  function build(
    rows: unknown[],
    emit: jest.Mock = jest.fn(),
    keys = new Set<string>(),
  ) {
    const claims: Record<string, unknown>[] = [];
    const updateMany = jest.fn((args: Record<string, unknown>) => {
      claims.push(args);
      return Promise.resolve({ count: 1 });
    });
    const findMany = jest
      .fn()
      .mockResolvedValueOnce(rows) // due reminders
      .mockResolvedValue([]); // repeating series
    const prisma = {
      attorneyTask: { findMany, updateMany },
    } as unknown as PrismaService;
    const redis = {
      set: jest.fn((key: string) => {
        if (keys.has(key)) return Promise.resolve(null);
        keys.add(key);
        return Promise.resolve('OK');
      }),
      del: jest.fn((key: string) => {
        keys.delete(key);
        return Promise.resolve(1);
      }),
    };
    const logger = {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    } as unknown as PinoLogger;
    const job = new TaskRemindersJob(
      prisma,
      { emit } as unknown as NotificationsService,
      logger,
      redis as never,
    );
    return { job, claims, emit, redis };
  }

  const task = (over: Record<string, unknown> = {}) => ({
    id: 't1',
    attorney_id: 'owner',
    kind: 'meeting',
    due_at: new Date('2026-10-20T14:30:00Z'),
    remind_at: hoursAgo(0.1),
    assignee: { assistant_user_id: 'asst', status: 'active' },
    ...over,
  });

  it('sends to the owner and the assistant with the time in the payload', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);
    const { job } = build([task()], emit);
    const r = await job.run(NOW);
    expect(r).toMatchObject({ sent: 1, missed: 0 });
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[0][0]).toMatchObject({
      type: 'task_reminder',
      recipientId: 'owner',
      payload: {
        taskId: 't1',
        kind: 'meeting',
        dueAt: '2026-10-20T14:30:00.000Z',
        remindAt: hoursAgo(0.1).toISOString(),
      },
    });
    expect(emit.mock.calls[0][0].payload.missed).toBeUndefined();
  });

  it('a reminder older than the grace window goes out once as missed', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);
    const { job } = build([task({ remind_at: hoursAgo(9) })], emit);
    const r = await job.run(NOW);
    expect(r).toMatchObject({ sent: 0, missed: 1 });
    expect(emit.mock.calls[0][0].payload).toMatchObject({ missed: true });
  });

  it('releases the claim when sending fails, and retries only who is missing', async () => {
    const emit = jest
      .fn()
      .mockResolvedValueOnce(undefined) // owner ok
      .mockRejectedValueOnce(new Error('queue down')); // assistant fails
    const keys = new Set<string>();
    const { job, claims } = build([task()], emit, keys);
    const r = await job.run(NOW);
    expect(r.sent).toBe(0);
    // claimed (reminded_at = now), then rolled back to null
    const data = claims.map(
      (c) => (c as { data: Record<string, unknown> }).data,
    );
    expect(data[0]).toEqual({ reminded_at: NOW });
    expect(data[1]).toEqual({ reminded_at: null });

    // Next run: the owner's claim still holds → only the assistant is sent.
    // (A fresh job over the same Redis.)
    emit.mockClear().mockResolvedValue(undefined);
    const again = build([task()], emit, keys);
    expect((await again.job.run(NOW)).sent).toBe(1);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toMatchObject({ recipientId: 'asst' });
  });

  it('does not send twice to the same person (redis claim)', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);
    const { job, redis } = build([task({ assignee: null })], emit);
    await job.run(NOW);
    expect(redis.set).toHaveBeenCalledWith(
      `reminder:task:t1:${hoursAgo(0.1).getTime()}:owner`,
      '1',
      'EX',
      expect.any(Number),
      'NX',
    );
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
