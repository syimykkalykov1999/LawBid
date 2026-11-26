import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';
import type { PrismaService } from '../../prisma/prisma.service';
import { CRON_JOBS, CRON_SCHEDULES } from '../jobs.constants';
import { PushTokensStaleJob } from './push-tokens-stale.job';

/** One DELETE batch's answer. */
const batch = (n: number) => [{ n: BigInt(n) }];

function build(values: Record<string, number>, answers: number[] = [0]) {
  const exec = jest.fn();
  for (const n of answers) exec.mockResolvedValueOnce(batch(n));
  exec.mockResolvedValue(batch(0));
  const prisma = { $queryRaw: exec } as unknown as PrismaService;
  const settings = {
    number: jest.fn((key: string) => Promise.resolve(values[key] ?? 0)),
  } as unknown as AppSettingsService;
  return { job: new PushTokensStaleJob(prisma, settings), exec };
}

const pace = {
  'storage.retention_batch_rows': 3,
  'storage.retention_pause_ms': 0,
};

/** The `before` date passed into the tagged SQL of call [i]. */
function cutoff(exec: jest.Mock, i = 0): Date {
  const values = (exec.mock.calls[i] as unknown[]).slice(1);
  const d = values.find((v) => v instanceof Date);
  if (!(d instanceof Date)) throw new Error('no date bound');
  return d;
}

describe('PushTokensStaleJob (G10, Firebase token freshness)', () => {
  const now = new Date('2026-11-25T12:00:00Z');

  it('runs nightly and defaults to 270 days (Firebase: FCM drops Android tokens after 270 days)', () => {
    expect(
      CRON_SCHEDULES.some((s) => s.name === CRON_JOBS.pushTokensStale),
    ).toBe(true);
    expect(APP_SETTINGS['push.token_stale_days']).toBe(270);
  });

  it('deletes tokens not seen for push.token_stale_days, oldest first', async () => {
    const { job, exec } = build({ ...pace, 'push.token_stale_days': 270 }, [1]);
    const out = await job.run(now);
    expect(out.deleted).toBe(1);
    expect(cutoff(exec).toISOString()).toBe('2026-02-28T12:00:00.000Z');
    const sql = (exec.mock.calls[0][0] as string[]).join('?');
    expect(sql).toContain('DELETE FROM push_tokens');
    expect(sql).toContain('last_seen_at <');
    expect(sql).toContain('ORDER BY last_seen_at');
  });

  it('keeps deleting in batches of storage.retention_batch_rows until a short batch', async () => {
    const { job, exec } = build(
      { ...pace, 'push.token_stale_days': 30 },
      [3, 3, 2],
    );
    expect((await job.run(now)).deleted).toBe(8);
    expect(exec).toHaveBeenCalledTimes(3);
  });

  it('0 = never: no query at all', async () => {
    const { job, exec } = build({ ...pace, 'push.token_stale_days': 0 });
    expect(await job.run(now)).toEqual({ deleted: 0 });
    expect(exec).not.toHaveBeenCalled();
  });
});
