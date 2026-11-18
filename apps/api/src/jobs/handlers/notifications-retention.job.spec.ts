import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { NotificationsRetentionJob } from './notifications-retention.job';

function build(values: Record<string, number>) {
  const exec = jest.fn().mockResolvedValue(0);
  const prisma = { $executeRaw: exec } as unknown as PrismaService;
  const settings = {
    number: jest.fn((key: string) => Promise.resolve(values[key] ?? 0)),
  } as unknown as AppSettingsService;
  return { job: new NotificationsRetentionJob(prisma, settings), exec };
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
    exec.mockResolvedValue(3);
    expect(await job.run()).toEqual({ deleted: 9 });
    expect(exec).toHaveBeenCalledTimes(3);
  });

  it('0 = no cap: deletes until a short batch', async () => {
    const { job, exec } = build({
      ...pace,
      'storage.retention_max_rows_per_table': 0,
    });
    for (let i = 0; i < 7; i++) exec.mockResolvedValueOnce(3);
    exec.mockResolvedValueOnce(2);
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
});
