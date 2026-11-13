import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';
import {
  configSchema,
  validateConfigValue,
} from '../admin-config/config-schema';
import { STEP_UP_CONFIG_KEYS } from '../admin-config/admin-config.controller';
import { AI_FEEDBACK_KEEP } from './ai-attachments.logic';
import { AiRetentionService } from './ai-retention.service';

/**
 * Owner 2026-11-12 (row 49, final): nothing the AI makes piles up. 15 days by
 * default for records and images, 0 = keep forever, the learning examples and
 * undecided items always stay, «Очистить сейчас» = older / all.
 */
const NOW = new Date('2026-11-12T12:00:00Z');
const DAY = 86_400_000;

type Sql = { strings: readonly string[]; values: unknown[] };
const sqlText = (q: Sql) => q.strings.join('?');

function kit(days: { records?: number; images?: number } = {}) {
  const queries: Sql[] = [];
  const executes: Sql[] = [];
  const rows = {
    expired: [] as { id: string; file_id: string }[],
    stillUsed: [] as { file_id: string }[],
    unattached: [] as { id: string }[],
  };
  const prisma = {
    $queryRaw: jest.fn((strings: readonly string[], ...values: unknown[]) => {
      queries.push({ strings, values });
      return Promise.resolve([{ n: 0 }]);
    }),
    $executeRaw: jest.fn((strings: readonly string[], ...values: unknown[]) => {
      executes.push({ strings, values });
      return Promise.resolve(0);
    }),
    file: {
      findMany: jest.fn(() => {
        const r = rows.unattached;
        rows.unattached = [];
        return Promise.resolve(r);
      }),
    },
    aiAttachment: {
      updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
      findMany: jest.fn((a: { where: Record<string, unknown> }) => {
        if ('file_id' in a.where) return Promise.resolve(rows.stillUsed);
        const r = rows.expired;
        rows.expired = [];
        return Promise.resolve(r);
      }),
      deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
  };
  const settings = {
    number: jest.fn((k: string) =>
      Promise.resolve(
        k === 'ai.retention_records_days'
          ? (days.records ?? 15)
          : (days.images ?? 15),
      ),
    ),
  };
  const release = {
    release: jest.fn(() => Promise.resolve({ released: 0, removedObjects: 0 })),
  };
  const svc = new AiRetentionService(
    prisma as never,
    settings as never,
    release as never,
  );
  return { svc, prisma, queries, executes, rows, release };
}

describe('AI retention', () => {
  it('defaults: 15 days for records and for images; the owner may set 0-36500 (0 = forever) with 2FA', () => {
    expect(APP_SETTINGS['ai.retention_records_days']).toBe(15);
    expect(APP_SETTINGS['ai.retention_images_days']).toBe(15);
    const schema = configSchema();
    for (const k of ['ai.retention_records_days', 'ai.retention_images_days']) {
      expect(validateConfigValue(schema[k], 0)).toBeNull();
      expect(validateConfigValue(schema[k], 365)).toBeNull();
      expect(validateConfigValue(schema[k], 36500)).toBeNull();
      expect(validateConfigValue(schema[k], 36501)).not.toBeNull();
      expect(validateConfigValue(schema[k], -1)).not.toBeNull();
      expect(STEP_UP_CONFIG_KEYS.has(k)).toBe(true);
    }
  });

  it('model settings (row 55): only known ids, every change behind 2FA', () => {
    const schema = configSchema();
    const m = schema['ai.assistant_model'];
    expect(validateConfigValue(m, 'claude-opus-5-5')).toBeNull();
    expect(validateConfigValue(m, 'claude-haiku-5-5')).toBeNull();
    expect(
      validateConfigValue(m, 'claude-opus-5-5 --dangerously'),
    ).not.toBeNull();
    expect(validateConfigValue(m, '$(curl x)')).not.toBeNull();
    for (const k of [
      'ai.assistant_model',
      'staff.ai.model_tier1',
      'staff.ai.model_tier2',
    ]) {
      expect(STEP_UP_CONFIG_KEYS.has(k)).toBe(true);
    }
  });

  it('nightly: finished items of finished runs older than the days go in batches; examples and undecided items stay', async () => {
    const t = kit({ records: 15 });
    await t.svc.run(NOW);
    const items = sqlText(t.queries[0]);
    // Only finished runs with no batch in flight.
    expect(items).toContain('r.status = ANY(');
    expect(t.queries[0].values).toContainEqual(['done', 'failed', 'canceled']);
    expect(items).toContain('r.batch_id IS NULL');
    // Only finished items: never pending / sent / proposed.
    expect(t.queries[0].values).toContainEqual([
      'approved',
      'rejected',
      'failed',
      'skipped',
    ]);
    for (const v of t.queries[0].values) {
      if (Array.isArray(v)) {
        expect(v).not.toContain('pending');
        expect(v).not.toContain('sent');
        expect(v).not.toContain('proposed');
      }
    }
    // The owner's newest learning examples per role are kept.
    expect(items).toContain('ROW_NUMBER() OVER');
    expect(items).toContain('PARTITION BY r.role_id');
    expect(t.queries[0].values).toContain(AI_FEEDBACK_KEEP);
    expect(items).toContain('NOT IN (SELECT id FROM kept)');
    // Small batches.
    expect(t.queries[0].values).toContain(500);
    // The cutoff is 15 days back.
    expect(t.queries[0].values).toContainEqual(
      new Date(NOW.getTime() - 15 * DAY),
    );
    // Their correction pictures close with them.
    expect(items).toContain('UPDATE ai_attachments SET closed_at');
    // Empty finished runs go; roles are never touched.
    const runs = sqlText(t.executes[0]);
    expect(runs).toContain('DELETE FROM ai_runs');
    expect(runs).toContain('NOT EXISTS (SELECT 1 FROM ai_run_items');
    expect([...items, ...runs].join('')).not.toContain('ai_roles');
  });

  it('0 days = keep forever: no record and no image is removed', async () => {
    const t = kit({ records: 0, images: 0 });
    t.rows.expired = [{ id: 'a1', file_id: 'f1' }];
    await t.svc.run(NOW);
    expect(t.queries).toHaveLength(0);
    expect(t.executes).toHaveLength(0);
    expect(t.prisma.aiAttachment.deleteMany).not.toHaveBeenCalled();
  });

  it('images closed longer than the days go with their DB row; a picture still used elsewhere stays', async () => {
    const t = kit({ images: 15 });
    t.rows.expired = [
      { id: 'a1', file_id: 'f1' },
      { id: 'a2', file_id: 'f2' },
    ];
    t.rows.stillUsed = [{ file_id: 'f2' }];
    const r = await t.svc.run(NOW);
    expect(t.prisma.aiAttachment.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['a1', 'a2'] } },
    });
    expect(t.release.release).toHaveBeenCalledWith(['f1'], 'expired', NOW);
    expect(r.images).toBe(2);
    const findExpired = t.prisma.aiAttachment.findMany.mock.calls.find(
      (c) => !('file_id' in (c[0] as { where: object }).where),
    )![0] as { where: { closed_at: { lte: Date } } };
    expect(findExpired.where.closed_at.lte).toEqual(
      new Date(NOW.getTime() - 15 * DAY),
    );
  });

  it('uploads never attached go after a day (released as orphans)', async () => {
    const t = kit();
    t.rows.unattached = [{ id: 'u1' }];
    const r = await t.svc.run(NOW);
    expect(t.release.release).toHaveBeenCalledWith(['u1'], 'orphan', NOW);
    expect(r.unattached).toBe(1);
  });

  it('«Очистить сейчас — всё»: every finished record and closed image NOW (the cutoff is now)', async () => {
    const t = kit({ records: 15, images: 15 });
    t.rows.expired = [{ id: 'a1', file_id: 'f1' }];
    await t.svc.purgeNow('all', 'worker', NOW);
    expect(t.queries[0].values).toContainEqual(NOW);
    const findExpired = t.prisma.aiAttachment.findMany.mock.calls[0][0] as {
      where: { kind: { in: string[] }; closed_at: { lte: Date } };
    };
    expect(findExpired.where.closed_at.lte).toEqual(NOW);
    expect(findExpired.where.kind.in).toEqual(['role', 'note']);
  });

  it('«Очистить сейчас — старше N дней» uses the chosen days; the technician page touches only its images', async () => {
    const t = kit({ records: 3, images: 4 });
    await t.svc.purgeNow('older', 'technician', NOW);
    // No AI employee records from the technician page.
    expect(t.queries).toHaveLength(0);
    const findExpired = t.prisma.aiAttachment.findMany.mock.calls[0][0] as {
      where: { kind: { in: string[] }; closed_at: { lte: Date } };
    };
    expect(findExpired.where.kind.in).toEqual(['task']);
    expect(findExpired.where.closed_at.lte).toEqual(
      new Date(NOW.getTime() - 4 * DAY),
    );
  });
});
