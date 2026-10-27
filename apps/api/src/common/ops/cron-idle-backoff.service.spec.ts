/* eslint-disable @typescript-eslint/require-await -- async mocks mirror the real signatures */
import { CronIdleBackoffService } from './cron-idle-backoff.service';

function make(mode = 'auto', afterRuns = 3, everyMin = 5) {
  const store = new Map<string, string>();
  const redis = {
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    set: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    }),
    del: jest.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
  };
  const values: Record<string, unknown> = {
    'ops.cron_idle_backoff': mode,
    'ops.cron_idle_after_runs': afterRuns,
    'ops.cron_idle_every_min': everyMin,
  };
  const settings = {
    string: jest.fn(async (k: string) => values[k] as string),
    number: jest.fn(async (k: string) => values[k] as number),
  };
  return {
    svc: new CronIdleBackoffService(redis as never, settings as never),
    store,
  };
}

const JOB = 'legal.exports';

describe('CronIdleBackoffService (S20-6)', () => {
  it('runs every minute until N empty runs, then skips, and wakes on demand', async () => {
    const { svc } = make('auto', 3);
    for (let i = 0; i < 3; i += 1) {
      expect(await svc.shouldSkip(JOB)).toBe(false);
      await svc.record(JOB, { built: null, expired: 0 });
    }
    expect(await svc.shouldSkip(JOB)).toBe(true);
    await svc.wake(JOB);
    expect(await svc.shouldSkip(JOB)).toBe(false);
  });

  it('work resets the count: back to every minute', async () => {
    const { svc } = make('auto', 2);
    await svc.record(JOB, {});
    await svc.record(JOB, {});
    expect(await svc.shouldSkip(JOB)).toBe(true);
    await svc.record(JOB, { built: 'abc', expired: 0 });
    expect(await svc.shouldSkip(JOB)).toBe(false);
  });

  it('a failed run clears the state (retries at the normal pace)', async () => {
    const { svc, store } = make('auto', 1);
    await svc.record(JOB, {});
    expect(store.size).toBe(1);
    await svc.record(JOB, null, true);
    expect(store.size).toBe(0);
  });

  it('off: never skips', async () => {
    const { svc } = make('off', 1);
    await svc.record(JOB, {});
    await svc.record(JOB, {});
    expect(await svc.shouldSkip(JOB)).toBe(false);
  });

  it('jobs that must stay on time are never touched', async () => {
    const { svc, store } = make('on', 1);
    for (const name of [
      'calls.sweep',
      'chat.redeliver',
      'outbox.sweep',
      'ops.guard',
      'tasks.reminders',
    ]) {
      await svc.record(name, {});
      expect(await svc.shouldSkip(name)).toBe(false);
    }
    expect(store.size).toBe(0);
  });

  it('a Redis failure means "run as usual"', async () => {
    const { svc } = make('auto', 1);
    (svc as unknown as { redis: { get: jest.Mock } }).redis.get = jest
      .fn()
      .mockRejectedValue(new Error('down'));
    expect(await svc.shouldSkip(JOB)).toBe(false);
  });
});
