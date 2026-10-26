import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { NotificationsRetentionJob } from '../../jobs/handlers/notifications-retention.job';
import { SessionsCleanupJob } from '../../jobs/handlers/sessions-cleanup.job';
import { TaskArchivePurgeJob } from '../../jobs/handlers/tasks-planner.jobs';
import { ClientFraudService } from '../../modules/client-fraud/client-fraud.service';
import { LegalQaSweepJob } from '../../modules/legal-qa/legal-qa-sweep.job';
import { ExportsCleanupService } from '../../modules/privacy/exports-cleanup.service';
import { JournalRetentionService } from '../../modules/privacy/journal-retention.service';
import { DataRetentionService } from '../../modules/storage/data-retention.service';
import type { AppSettingsService } from '../app-settings/app-settings.service';
import { heldSql, heldTargets } from '../privacy/legal-hold';

/**
 * Owner 2026-10-28 (legal requests): a hold must stop EVERY automatic job
 * that destroys user-linked rows. One test per job below: with a person
 * (or case) under an active hold, the job's delete statement / filter must
 * carry that id as an exclusion. (legal.retention and privacy.anonymize
 * have their own specs; chat.disappearing only soft-deletes; see
 * docs/runbooks/LEGAL_REQUESTS.md for the full list.)
 */
const HELD = '11111111-1111-4111-8111-111111111111';
const CASE = '22222222-2222-4222-8222-222222222222';

const logger = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as PinoLogger;

/** True if [needle] appears anywhere in the arguments (Sql objects included).
 * `exact` compares whole values (ids, target types); otherwise substring
 * (the SQL text of the shared hold check mentions `legal_holds`). */
function mentions(
  value: unknown,
  needle = HELD,
  exact = true,
  depth = 0,
): boolean {
  if (depth > 6 || value === null || value === undefined) return false;
  if (typeof value === 'string')
    return exact ? value === needle : value.includes(needle);
  if (Array.isArray(value))
    return value.some((v) => mentions(v, needle, exact, depth + 1));
  if (typeof value === 'object') {
    if (value instanceof Date) return false;
    return Object.values(value).some((v) =>
      mentions(v, needle, exact, depth + 1),
    );
  }
  return false;
}

function prismaWith(extra: Record<string, unknown>) {
  const legalHold = {
    findMany: jest.fn(({ where }: any) =>
      Promise.resolve(
        (where.AND?.[1]?.target_type ?? where.target_type) === 'user'
          ? [{ target_id: HELD }]
          : (where.AND?.[1]?.target_type ?? where.target_type) === 'case'
            ? [{ target_id: CASE }]
            : [],
      ),
    ),
  };
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return { legalHold, ...extra } as any;
}

const settings = (values: Record<string, number | boolean>) =>
  ({
    number: jest.fn((k: string) => Promise.resolve(values[k] ?? 0)),
    boolean: jest.fn((k: string) => Promise.resolve(values[k] ?? true)),
  }) as unknown as AppSettingsService;

/** The statement carries the shared SQL hold check. */
const heldInSql = (call: unknown) => mentions(call, 'legal_holds', false);

describe('shared legal hold helper (common/privacy/legal-hold)', () => {
  it('reads only active holds of one kind', async () => {
    const prisma = prismaWith({});
    const now = new Date('2026-10-28T00:00:00Z');
    expect(await heldTargets(prisma, 'user', now)).toEqual([HELD]);
    const and = prisma.legalHold.findMany.mock.calls[0][0].where.AND;
    expect(and[0].released_at).toBeNull();
    expect(and[0].OR).toEqual([
      { expires_at: null },
      { expires_at: { gt: now } },
    ]);
  });
  it('builds an EXISTS check on active holds for set-based SQL', () => {
    const q = heldSql('user', Prisma.sql`x`);
    expect(q.sql).toContain('legal_holds');
    expect(q.sql).toContain('released_at IS NULL');
  });
});

describe('every deletion job respects a legal hold', () => {
  it('sessions.cleanup', async () => {
    const $queryRaw = jest
      .fn()
      .mockResolvedValue([
        { doomed_ids: null, last_id: null, scanned: 0n, deleted: 0n },
      ]);
    const job = new SessionsCleanupJob(prismaWith({ $queryRaw }), logger);
    await job.run();
    expect(heldInSql($queryRaw.mock.calls[0])).toBe(true);
  });

  it('notifications.retention', async () => {
    const $executeRaw = jest.fn().mockResolvedValue(0);
    const job = new NotificationsRetentionJob(
      prismaWith({ $executeRaw }),
      settings({ 'notifications.retention_days': 180 }),
    );
    await job.run();
    expect(heldInSql($executeRaw.mock.calls[0])).toBe(true);
  });

  it('journal.retention (held case and held people)', async () => {
    const $executeRaw = jest.fn().mockResolvedValue(0);
    const prisma = prismaWith({ $executeRaw });
    const svc = new JournalRetentionService(
      prisma,
      { get: () => undefined } as unknown as ConfigService,
      logger,
    );
    await svc.run();
    expect(heldInSql($executeRaw.mock.calls[0])).toBe(true);
    expect(mentions($executeRaw.mock.calls[0], 'case')).toBe(true);
    expect(mentions($executeRaw.mock.calls[0], 'user')).toBe(true);
  });

  it('exports.cleanup (the person’s own data-export files)', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = prismaWith({
      $executeRaw: jest.fn().mockResolvedValue(0),
      dataExportJob: {
        findMany,
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    });
    const svc = new ExportsCleanupService(
      prisma,
      { configured: false } as never,
      logger,
    );
    await svc.run();
    expect(findMany.mock.calls[0][0].where.user_id).toEqual({ notIn: [HELD] });
  });

  it('storage.retention (login events, activity, views)', async () => {
    const $executeRaw = jest.fn().mockResolvedValue(0);
    const prisma = prismaWith({
      $executeRaw,
      storageSnapshot: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      appEventDay: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    });
    const svc = new DataRetentionService(
      prisma,
      {
        number: jest.fn().mockResolvedValue(30),
        boolean: jest.fn().mockResolvedValue(true),
      } as unknown as AppSettingsService,
      { get: () => undefined } as unknown as ConfigService,
      logger,
    );
    await svc.run();
    // auth_events (16 shards), assistant_activity, post_views,
    // post_view_events, user_activity_days: every statement excludes HELD.
    expect($executeRaw.mock.calls.length).toBeGreaterThanOrEqual(20);
    for (const call of $executeRaw.mock.calls) {
      expect(heldInSql(call)).toBe(true);
    }
  });

  it('tasks.archive-purge', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = prismaWith({
      attorneyTask: { findMany, updateMany: jest.fn() },
    });
    const job = new TaskArchivePurgeJob(
      prisma,
      settings({ 'tasks.archive_retention_days': 30 }),
      { notify: jest.fn() } as never,
      {} as never,
      logger,
    );
    await job.run().catch(() => undefined);
    const purgeCall = findMany.mock.calls.find(
      (c) => c[0]?.where?.keep_forever === false && !c[0].where.OR,
    );
    expect(purgeCall?.[0].where.attorney_id).toEqual({ notIn: [HELD] });
  });

  it('legal-qa.sweep purge', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = prismaWith({
      legalQuestion: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany,
      },
    });
    await new LegalQaSweepJob(prisma).run();
    expect(deleteMany.mock.calls[0][0].where.author_id).toEqual({
      notIn: [HELD],
    });
  });

  it('fraud.sweep purge of identity hashes', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = prismaWith({
      user: { findMany: jest.fn().mockResolvedValue([]) },
      identityFingerprint: { deleteMany },
    });
    const svc = Object.create(
      ClientFraudService.prototype,
    ) as ClientFraudService;
    Object.assign(svc, { prisma });
    await svc.purge({
      fingerprintRetentionDays: 90,
      blockedRetentionDays: 365,
    } as never);
    for (const call of deleteMany.mock.calls) {
      expect(mentions(call[0])).toBe(true);
    }
  });
});
