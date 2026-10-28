import type { PinoLogger } from 'nestjs-pino';
import { CaseRebroadcastJob } from './case-rebroadcast.job';

/** Algo audit 2026-10-27 (CASES M-3): zero-offer cases get one more round. */
describe('CaseRebroadcastJob', () => {
  const HOUR = 3_600_000;
  const now = new Date('2026-10-28T12:00:00Z');

  function build(
    settings: Record<string, number | boolean> = {},
    rows: Record<number, string[]> = { 24: ['c1', 'c2'], 72: ['c3'] },
  ) {
    const claimed = new Set<string>();
    const redis = {
      // withJobLock: SET NX PX + eval for renew/release.
      set: jest.fn((key: string) => {
        if (claimed.has(key)) return Promise.resolve(null);
        claimed.add(key);
        return Promise.resolve('OK');
      }),
      // RELEASE / RENEW of the job lock: the release frees the key.
      eval: jest.fn((_script: string, _n: number, key: string) => {
        claimed.delete(key);
        return Promise.resolve(1);
      }),
      pexpire: jest.fn(() => Promise.resolve(1)),
    };
    const sql: { newest: Date; oldest: Date }[] = [];
    const prisma = {
      $queryRaw: jest.fn((q: { values: unknown[] }) => {
        const [oldest, newest] = q.values as [Date, Date];
        sql.push({ oldest, newest });
        const h = Math.round((now.getTime() - newest.getTime()) / HOUR);
        return Promise.resolve((rows[h] ?? []).map((id) => ({ id })));
      }),
    };
    const alerts = { rebroadcast: jest.fn(() => Promise.resolve(3)) };
    const s = {
      boolean: jest.fn((k: string) =>
        Promise.resolve((settings[k] as boolean | undefined) ?? true),
      ),
      number: jest.fn((k: string) =>
        Promise.resolve(
          (settings[k] as number | undefined) ??
            (k.endsWith('first_hours') ? 24 : 72),
        ),
      ),
    };
    const logger = {
      setContext: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
    } as unknown as PinoLogger;
    const job = new CaseRebroadcastJob(
      prisma as never,
      alerts as never,
      logger,
      redis as never,
      s as never,
    );
    return { job, alerts, sql, redis };
  }

  it('re-broadcasts the zero-offer cases that crossed 24 h and 72 h, in a two-hour window', async () => {
    const { job, alerts, sql } = build();
    expect(await job.run(now)).toEqual({ ran: true, queued: 3 });
    expect(alerts.rebroadcast).toHaveBeenCalledWith('c1', '24h');
    expect(alerts.rebroadcast).toHaveBeenCalledWith('c2', '24h');
    expect(alerts.rebroadcast).toHaveBeenCalledWith('c3', '72h');
    expect(sql[0].newest.getTime()).toBe(now.getTime() - 24 * HOUR);
    expect(sql[0].oldest.getTime()).toBe(now.getTime() - 26 * HOUR);
  });

  it('a case seen by the next hourly run is not queued twice', async () => {
    const { job, alerts } = build();
    await job.run(now);
    alerts.rebroadcast.mockClear();
    // The lock is free again (released), only the per-case claims hold.
    expect(await job.run(new Date(now.getTime()))).toEqual({
      ran: true,
      queued: 0,
    });
    expect(alerts.rebroadcast).not.toHaveBeenCalled();
  });

  it('a stage at 0 is off; the switch off does nothing', async () => {
    const one = build({ 'case_alerts.rebroadcast_second_hours': 0 });
    expect((await one.job.run(now)).queued).toBe(2);
    const off = build({ 'case_alerts.rebroadcast_enabled': false });
    expect(await off.job.run(now)).toEqual({ ran: false, queued: 0 });
    expect(off.alerts.rebroadcast).not.toHaveBeenCalled();
  });

  it('one failing case never stops the others', async () => {
    const { job, alerts } = build();
    alerts.rebroadcast.mockRejectedValueOnce(new Error('db blip'));
    expect((await job.run(now)).queued).toBe(2);
  });
});
