import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { BadgesService } from '../../modules/notifications/badges.service';
import { NotificationsRetentionJob } from './notifications-retention.job';

/** One DELETE batch's answer: rows gone and the owners of unread ones. */
const batch = (n: number, users: string[] = []) => [{ n: BigInt(n), users }];

function build(values: Record<string, number>) {
  const exec = jest.fn().mockResolvedValue(batch(0));
  const prisma = { $queryRaw: exec } as unknown as PrismaService;
  const settings = {
    number: jest.fn((key: string) => Promise.resolve(values[key] ?? 0)),
  } as unknown as AppSettingsService;
  const invalidated: string[][] = [];
  const badges = {
    invalidateNotificationsMany: (ids: string[]) => {
      invalidated.push(ids);
      return Promise.resolve();
    },
  } as unknown as BadgesService;
  return {
    job: new NotificationsRetentionJob(prisma, settings, badges),
    exec,
    invalidated,
  };
}

const pace = {
  'notifications.retention_days': 180,
  'storage.retention_batch_rows': 3,
  'storage.retention_pause_ms': 0,
};

describe('NotificationsRetentionJob (DB scale batch B)', () => {
  it('stops at storage.retention_max_rows_per_table', async () => {
    const { job, exec } = build({
      ...pace,
      'storage.retention_max_rows_per_table': 9,
    });
    exec.mockResolvedValue(batch(3));
    expect(await job.run()).toEqual({ deleted: 9 });
    expect(exec).toHaveBeenCalledTimes(3);
  });

  it('0 = no cap: deletes until a short batch', async () => {
    const { job, exec } = build({
      ...pace,
      'storage.retention_max_rows_per_table': 0,
    });
    for (let i = 0; i < 7; i++) exec.mockResolvedValueOnce(batch(3));
    exec.mockResolvedValueOnce(batch(2));
    expect(await job.run()).toEqual({ deleted: 23 });
    expect(exec).toHaveBeenCalledTimes(8);
  });

  it('the batch size is the LIMIT of every DELETE', async () => {
    const { job, exec } = build({
      ...pace,
      'storage.retention_batch_rows': 41,
      'storage.retention_max_rows_per_table': 100,
    });
    await job.run();
    const first = exec.mock.calls[0] as unknown[];
    expect(first.slice(1)).toContain(41);
  });

  // Verify batch 8 (17.11), NO7: deleting old UNREAD rows left the cached
  // badge number (Redis) counting them until its daily TTL.
  it('drops the cached badge count of people whose unread rows were deleted', async () => {
    const { job, exec, invalidated } = build({
      ...pace,
      'storage.retention_max_rows_per_table': 0,
    });
    exec
      .mockResolvedValueOnce(batch(3, ['u1', 'u2']))
      .mockResolvedValueOnce(batch(1, ['u2']));
    expect(await job.run()).toEqual({ deleted: 4 });
    expect(invalidated.flat().sort()).toEqual(['u1', 'u2', 'u2']);
  });

  it('read rows only: no badge work', async () => {
    const { job, exec, invalidated } = build(pace);
    exec.mockResolvedValueOnce(batch(2, []));
    await job.run();
    expect(invalidated.flat()).toEqual([]);
  });
});
