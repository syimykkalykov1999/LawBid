/* eslint-disable @typescript-eslint/no-unsafe-call */
import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { DataRetentionService } from './data-retention.service';

const DAY = 24 * 3600 * 1000;
/** The shipped pace (pause 0 so tests do not sleep). */
const PACE: Record<string, number> = {
  'storage.retention_max_rows_per_table': 1_000_000,
  'storage.retention_batch_rows': 5000,
  'storage.retention_pause_ms': 0,
};

function build(
  days: Record<string, number>,
  auto = true,
  flags: Record<string, boolean> = {},
) {
  const exec = jest.fn().mockResolvedValue(0);
  const rowQuery = jest.fn().mockResolvedValue([{ n: 0 }]);
  const unsafe = jest.fn().mockResolvedValue([{ name: null }]);
  // Month drops are Prisma.sql objects; the row deletes tagged templates.
  const query = jest.fn((q: unknown, ...rest: unknown[]) => {
    if (q && typeof q === 'object' && !Array.isArray(q) && 'sql' in q) {
      const p = q as unknown as { sql: string; values: unknown[] };
      return unsafe(p.sql, ...p.values) as Promise<unknown>;
    }
    return rowQuery(q, ...rest) as Promise<unknown>;
  });
  const holds = jest.fn().mockResolvedValue([]);
  const prisma = {
    $executeRaw: exec,
    $queryRaw: query,
    legalHold: { findMany: holds },
    storageSnapshot: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    appEventDay: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  } as unknown as PrismaService;
  const settings = {
    boolean: jest.fn((key: string) =>
      Promise.resolve(
        key === 'storage.auto_retention' ? auto : (flags[key] ?? false),
      ),
    ),
    number: jest.fn((key: string) =>
      Promise.resolve(days[key] ?? PACE[key] ?? 0),
    ),
  } as unknown as AppSettingsService;
  const config = { get: jest.fn() } as unknown as ConfigService;
  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  } as unknown as PinoLogger;
  return {
    svc: new DataRetentionService(prisma, settings, config, logger),
    exec,
    query: rowQuery,
    unsafe,
    holds,
  };
}

function sqlOf(call: unknown[]): string {
  return (call[0] as TemplateStringsArray).join('?');
}

describe('DataRetentionService (scale audit 2026-10-23)', () => {
  it('does nothing while auto retention is off', async () => {
    const { svc, exec } = build({}, false);
    expect(await svc.run()).toBeNull();
    expect(exec).not.toHaveBeenCalled();
  });

  it('trims post_view_events and user_activity_days past their days', async () => {
    const { svc, exec, query } = build({
      'storage.retention_post_view_events_days': 730,
      'storage.retention_user_activity_days': 400,
    });
    query.mockResolvedValueOnce([{ n: 7 }]);
    exec.mockResolvedValueOnce(5);
    const now = new Date('2026-10-23T00:00:00Z');
    const res = await svc.run(now);
    expect(res).toMatchObject({ postViewEvents: 7, userActivityDays: 5 });

    const views = query.mock.calls.find((c) =>
      sqlOf(c).includes('DELETE FROM post_view_events'),
    )!;
    // DB scale batch C: the removed views go to the post's stored base.
    expect(sqlOf(views)).toContain('view_count_base = p.view_count_base + v.n');
    const cutViews = new Date(now.getTime() - 730 * DAY);
    expect(
      (views.slice(1) as unknown[]).some(
        (v) => v instanceof Date && +v === +cutViews,
      ),
    ).toBe(true);
    expect(
      exec.mock.calls.some((c) =>
        sqlOf(c).includes('DELETE FROM user_activity_days'),
      ),
    ).toBe(true);
  });

  it('0 days keeps the table forever (no statement)', async () => {
    const { svc, exec, query, unsafe } = build(
      {
        'storage.retention_post_view_events_days': 0,
        'storage.retention_user_activity_days': 0,
      },
      true,
      { 'storage.retention_partition_drop_enabled': true },
    );
    const res = await svc.run();
    expect(res).toMatchObject({ postViewEvents: 0, userActivityDays: 0 });
    expect(exec).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(unsafe).not.toHaveBeenCalled();
  });

  it('S5-3: trims done outbox rows (7 d) and inbox keys (30 d), never pending/dead', async () => {
    const { svc, exec } = build({
      'storage.retention_outbox_done_days': 7,
      'storage.retention_inbox_days': 30,
    });
    const now = new Date('2026-10-25T00:00:00Z');
    exec.mockResolvedValueOnce(11).mockResolvedValueOnce(4);
    const res = await svc.run(now);
    expect(res).toMatchObject({
      crossFamilyOutboxDone: 11,
      crossFamilyInbox: 4,
    });
    const outbox = exec.mock.calls.find((c) =>
      sqlOf(c).includes('FROM cross_family_outbox'),
    )!;
    expect(sqlOf(outbox)).toContain("status = 'done'");
    const cut = new Date(now.getTime() - 7 * DAY);
    expect(
      (outbox.slice(1) as unknown[]).some(
        (v) => v instanceof Date && +v === +cut,
      ),
    ).toBe(true);
    const inbox = exec.mock.calls.find((c) =>
      sqlOf(c).includes('FROM cross_family_inbox'),
    )!;
    const cutIn = new Date(now.getTime() - 30 * DAY);
    expect(
      (inbox.slice(1) as unknown[]).some(
        (v) => v instanceof Date && +v === +cutIn,
      ),
    ).toBe(true);
  });

  it('S5-3: 0 days keeps outbox and inbox (no statement)', async () => {
    const { svc, exec } = build({
      'storage.retention_outbox_done_days': 0,
      'storage.retention_inbox_days': 0,
    });
    await svc.run();
    expect(exec).not.toHaveBeenCalled();
  });

  describe('DB scale batch B: the run cap is an admin setting', () => {
    const pace = {
      'storage.retention_user_activity_days': 400,
      'storage.retention_batch_rows': 2,
      'storage.retention_pause_ms': 0,
    };

    it('stops a table at storage.retention_max_rows_per_table', async () => {
      const { svc, exec } = build({
        ...pace,
        'storage.retention_max_rows_per_table': 6,
      });
      exec.mockResolvedValue(2); // every DELETE finds a full batch
      const res = await svc.run();
      expect(res?.userActivityDays).toBe(6);
      expect(exec).toHaveBeenCalledTimes(3);
    });

    it('0 = no cap: the run goes until a short batch', async () => {
      const { svc, exec } = build({
        ...pace,
        'storage.retention_max_rows_per_table': 0,
      });
      for (let i = 0; i < 9; i++) exec.mockResolvedValueOnce(2);
      exec.mockResolvedValueOnce(1);
      const res = await svc.run();
      expect(res?.userActivityDays).toBe(19);
      expect(exec).toHaveBeenCalledTimes(10);
    });

    it('the batch size is the LIMIT of every DELETE', async () => {
      const { svc, exec } = build({
        ...pace,
        'storage.retention_batch_rows': 37,
        'storage.retention_max_rows_per_table': 100,
      });
      await svc.run();
      const call = exec.mock.calls.find((c) =>
        sqlOf(c).includes('DELETE FROM user_activity_days'),
      )!;
      expect(call.slice(1)).toContain(37);
    });
  });

  describe('DB scale batch B: whole expired months', () => {
    const days = {
      'storage.retention_post_view_events_days': 730,
      'storage.retention_auth_events_days': 730,
      'storage.retention_partition_lock_timeout_ms': 4000,
    };
    const on = { 'storage.retention_partition_drop_enabled': true };

    it('drops months until the function says none, with the held persons', async () => {
      const { svc, unsafe, holds } = build(days, true, on);
      holds.mockResolvedValue([{ target_id: 'u-held' }]);
      unsafe.mockImplementation((sql: string) =>
        Promise.resolve(
          sql.includes('post_view_events') && unsafe.mock.calls.length < 3
            ? [{ name: `post_view_events_p2024_0${unsafe.mock.calls.length}` }]
            : [{ name: null }],
        ),
      );
      const now = new Date('2026-11-14T00:00:00Z');
      const res = await svc.run(now);
      expect(res).toMatchObject({ authEventMonths: 0 });
      const pve = unsafe.mock.calls.filter((c) =>
        String(c[0]).includes('lawbid_drop_expired_post_view_events_month'),
      );
      expect(res?.postViewEventMonths).toBe(pve.length - 1);
      const [, cut, held, lock] = pve[0] as [string, Date, string[], number];
      expect(+cut).toBe(+now - 730 * DAY);
      expect(held).toEqual(['u-held']);
      expect(lock).toBe(4000);
      expect(
        unsafe.mock.calls.some((c) =>
          String(c[0]).includes('lawbid_drop_expired_auth_events_month'),
        ),
      ).toBe(true);
    });

    it('switch off: row by row only, as before', async () => {
      const { svc, unsafe, holds } = build(days, true, {
        'storage.retention_partition_drop_enabled': false,
      });
      await svc.run();
      expect(unsafe).not.toHaveBeenCalled();
      expect(holds).not.toHaveBeenCalled();
    });

    it('a failed drop (lock timeout) is logged and the row delete still runs', async () => {
      const { svc, unsafe, query } = build(days, true, on);
      unsafe.mockRejectedValue(
        new Error('canceling statement due to lock timeout'),
      );
      query.mockResolvedValueOnce([{ n: 3 }]);
      const res = await svc.run();
      expect(res).toMatchObject({ postViewEventMonths: 0, postViewEvents: 3 });
    });
  });

  it('DB scale batch C: trims counter flush keys past their days', async () => {
    const { svc, exec } = build({ 'storage.retention_counter_flush_days': 7 });
    exec.mockResolvedValueOnce(12);
    const now = new Date('2026-11-14T00:00:00Z');
    const res = await svc.run(now);
    expect(res?.counterFlushBatches).toBe(12);
    const call = exec.mock.calls.find((c) =>
      sqlOf(c).includes('DELETE FROM counter_flush_batches'),
    )!;
    expect(
      (call.slice(1) as unknown[]).some(
        (v) => v instanceof Date && +v === +now - 7 * DAY,
      ),
    ).toBe(true);
  });
});
