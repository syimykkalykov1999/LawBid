/* eslint-disable @typescript-eslint/no-unsafe-call */
import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { DataRetentionService } from './data-retention.service';

const DAY = 24 * 3600 * 1000;

function build(days: Record<string, number>, auto = true) {
  const exec = jest.fn().mockResolvedValue(0);
  const prisma = {
    $executeRaw: exec,
    storageSnapshot: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    appEventDay: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  } as unknown as PrismaService;
  const settings = {
    boolean: jest.fn().mockResolvedValue(auto),
    number: jest.fn((key: string) => Promise.resolve(days[key] ?? 0)),
  } as unknown as AppSettingsService;
  const config = { get: jest.fn() } as unknown as ConfigService;
  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
  } as unknown as PinoLogger;
  return {
    svc: new DataRetentionService(prisma, settings, config, logger),
    exec,
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
    const { svc, exec } = build({
      'storage.retention_post_view_events_days': 730,
      'storage.retention_user_activity_days': 400,
    });
    exec.mockResolvedValueOnce(7).mockResolvedValueOnce(5);
    const now = new Date('2026-10-23T00:00:00Z');
    const res = await svc.run(now);
    expect(res).toMatchObject({ postViewEvents: 7, userActivityDays: 5 });

    const views = exec.mock.calls.find((c) =>
      sqlOf(c).includes('DELETE FROM post_view_events'),
    )!;
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
    const { svc, exec } = build({
      'storage.retention_post_view_events_days': 0,
      'storage.retention_user_activity_days': 0,
    });
    const res = await svc.run();
    expect(res).toMatchObject({ postViewEvents: 0, userActivityDays: 0 });
    expect(exec).not.toHaveBeenCalled();
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
});
