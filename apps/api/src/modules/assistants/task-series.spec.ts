import type { PrismaService } from '../../prisma/prisma.service';
import {
  createNextOccurrence,
  remindedAtFor,
  type SeriesTask,
} from './task-series';

const NOW = new Date('2026-10-20T12:00:00Z');

function series(over: Partial<SeriesTask> = {}): SeriesTask {
  return {
    id: 't1',
    attorney_id: 'u1',
    created_by_membership_id: null,
    assignee_membership_id: null,
    kind: 'call',
    title: 'Stand-up',
    notes: null,
    due_at: new Date('2026-10-19T13:00:00Z'), // 09:00 EDT yesterday
    case_id: null,
    conversation_id: null,
    case_task_id: null,
    file_ids: [],
    status: 'open',
    priority: 'normal',
    repeat: 'daily',
    repeat_until: null,
    repeated_at: null,
    remind_before_min: 15,
    remind_at: null,
    reminded_at: null,
    outcome_note: null,
    rescheduled_to: null,
    done_at: null,
    archived_at: null,
    keep_forever: false,
    purge_notice_days: null,
    created_at: new Date(),
    updated_at: new Date(),
    steps: [],
    places: [],
    people: [],
    ...over,
  } as unknown as SeriesTask;
}

function db(claimed = true) {
  const create = jest.fn().mockResolvedValue({});
  const updateMany = jest.fn().mockResolvedValue({ count: claimed ? 1 : 0 });
  return {
    create,
    updateMany,
    prisma: {
      attorneyTask: { create, updateMany },
    } as unknown as PrismaService,
  };
}

interface Created {
  due_at: Date;
  remind_at: Date;
  reminded_at: Date | null;
}
const created = (create: jest.Mock): Created =>
  (create.mock.calls[0] as [{ data: Created }])[0].data;

describe('remindedAtFor', () => {
  it('a future reminder is pending, a passed one is not sent late', () => {
    expect(remindedAtFor(new Date(NOW.getTime() + 60_000), NOW)).toBeNull();
    expect(remindedAtFor(null, NOW)).toBeNull();
    expect(remindedAtFor(new Date(NOW.getTime() - 3_600_000), NOW)).toEqual(
      NOW,
    );
  });
});

describe('createNextOccurrence', () => {
  it('continues a daily series at the same local hour, after now', async () => {
    const { prisma, create } = db();
    expect(
      await createNextOccurrence(prisma, series(), 'America/New_York', NOW),
    ).toBe(true);
    const data = created(create);
    // 09:00 EDT today (13:00Z) already passed at 12:00Z? No — 13:00Z is ahead.
    expect(data.due_at.toISOString()).toBe('2026-10-20T13:00:00.000Z');
    expect(data.remind_at.toISOString()).toBe('2026-10-20T12:45:00.000Z');
    expect(data.reminded_at).toBeNull();
  });

  it('an overdue series skips the past occurrences', async () => {
    const { prisma, create } = db();
    await createNextOccurrence(
      prisma,
      series({ due_at: new Date('2026-10-10T13:00:00Z') }),
      'America/New_York',
      NOW,
    );
    expect(created(create).due_at.toISOString()).toBe(
      '2026-10-20T13:00:00.000Z',
    );
  });

  it('is created once: a lost claim creates nothing', async () => {
    const { prisma, create } = db(false);
    expect(await createNextOccurrence(prisma, series(), 'UTC', NOW)).toBe(
      false,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('stops after repeat_until', async () => {
    const { prisma, create } = db();
    const r = await createNextOccurrence(
      prisma,
      series({ repeat_until: new Date('2026-10-19T23:59:00Z') }),
      'UTC',
      NOW,
    );
    expect(r).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('releases the claim when the create fails, so the next run retries', async () => {
    const { prisma, create, updateMany } = db();
    create.mockRejectedValueOnce(new Error('db down'));
    await expect(
      createNextOccurrence(prisma, series(), 'UTC', NOW),
    ).rejects.toThrow('db down');
    expect(updateMany.mock.calls.at(-1)?.[0].data).toEqual({
      repeated_at: null,
    });
  });
});
