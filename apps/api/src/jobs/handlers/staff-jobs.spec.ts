import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import { STAFF_SWITCH_KEYS } from '../../modules/staff-core/staff-settings.defaults';
import { CRON_JOBS } from '../jobs.constants';
import {
  STAFF_RETENTION_BATCH,
  StaffRetentionJob,
} from './staff-retention.job';

/** Real StaffSettingsService over a stored-config object. */
const settings = (stored: Record<string, unknown> = {}) =>
  new StaffSettingsService({
    all: () => Promise.resolve(stored),
  } as unknown as AppSettingsService);

/** A database that fails the test if anything touches it. */
const noDb = new Proxy(
  {},
  {
    get: (_t, prop) => {
      if (prop === 'then') return undefined;
      throw new Error(`DB touched: ${String(prop)}`);
    },
  },
) as unknown as PrismaService;

/**
 * Conflict-proof (owner rule 2026-10-27, «параллельные волны без
 * конфликтов»): there is NO hand list of stub jobs here. A handler file is a
 * stub exactly when its `run()` returns the shared `STAFF_JOB_STUB`
 * constant; the task that builds the job replaces that line and the job
 * leaves the "stub" group by itself, with no edit to this spec. Every
 * `CRON_JOBS.staff*` entry is checked from the code: it has a handler file,
 * a `case` in the cron processor and a provider in some module.
 */
const HANDLER_DIR = __dirname;
const SRC = join(__dirname, '..', '..');

const handlerFile = (cronName: string) =>
  `${cronName.replace(/\./g, '-')}.job.ts`;
const read = (f: string) => readFileSync(join(HANDLER_DIR, f), 'utf8');

const staffCron = Object.entries(CRON_JOBS).filter(([, n]) =>
  n.startsWith('staff.'),
) as [keyof typeof CRON_JOBS, string][];

const handlerFiles = readdirSync(HANDLER_DIR)
  .filter((f) => /^staff-.+\.job\.ts$/.test(f))
  .sort();

const stubFiles = handlerFiles.filter((f) =>
  /return\s+STAFF_JOB_STUB\b/.test(read(f)),
);

function allModuleSources(): string {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.module.ts'))
        out.push(readFileSync(full, 'utf8'));
    }
  };
  walk(SRC);
  return out.join('\n');
}

type Runner = { run: () => Promise<unknown> };
type JobClass = new (s: StaffSettingsService) => Runner;

describe('staff.* cron jobs: every registered job has a handler (derived, no hand list)', () => {
  it('finds the staff jobs (guards the discovery itself)', () => {
    expect(staffCron.length).toBeGreaterThan(0);
    expect(handlerFiles.length).toBeGreaterThan(0);
  });

  it.each(staffCron)('CRON_JOBS.%s: has a handler file', (_key, name) => {
    expect(handlerFiles).toContain(handlerFile(name));
  });

  it('has no handler file without a CRON_JOBS entry', () => {
    const expected = new Set(staffCron.map(([, n]) => handlerFile(n)));
    expect(handlerFiles.filter((f) => !expected.has(f))).toEqual([]);
  });

  it.each(staffCron)(
    'CRON_JOBS.%s: the cron processor routes it to a handler',
    (key) => {
      const processor = readFileSync(
        join(HANDLER_DIR, '..', 'cron.processor.ts'),
        'utf8',
      );
      expect(processor).toMatch(
        new RegExp(
          `case CRON_JOBS\\.${key}:\\s*return this\\.\\w+\\?\\.run\\(`,
        ),
      );
    },
  );

  it.each(staffCron)(
    'CRON_JOBS.%s: the handler class is provided by a module',
    (_key, name) => {
      const cls = /export class (\w+)/.exec(read(handlerFile(name)))?.[1];
      expect(cls).toBeDefined();
      expect(allModuleSources()).toMatch(new RegExp(`\\b${cls}\\b`));
    },
  );
});

describe('staff.* stub jobs (a handler that returns STAFF_JOB_STUB; found in code)', () => {
  if (stubFiles.length === 0) {
    it('no stub is left: every staff job is built', () => {
      expect(stubFiles).toEqual([]);
    });
    return;
  }

  describe.each(stubFiles)('%s', (file) => {
    const load = (): Promise<JobClass> => {
      const mod = jest.requireActual<Record<string, unknown>>(
        `./${file.replace(/\.ts$/, '')}`,
      );
      const cls = Object.values(mod).find(
        (v) => typeof v === 'function' && /Job$/.test(v.name),
      );
      return Promise.resolve(cls as JobClass);
    };

    it('switch off (the default): returns at once, no work', async () => {
      const Job = await load();
      await expect(new Job(settings()).run()).resolves.toEqual({
        skipped: 'off',
      });
    });

    it('switch on: still a stub that does nothing until its task fills it', async () => {
      const Job = await load();
      const allOn = Object.fromEntries(STAFF_SWITCH_KEYS.map((k) => [k, true]));
      await expect(new Job(settings(allOn)).run()).resolves.toEqual({
        skipped: 'not built yet',
      });
    });
  });

  // Built jobs have their own specs (e.g. staff-rating-jobs.spec.ts,
  // staff-appeals-jobs.spec.ts, staff-ai-qa-nightly.job.spec.ts).
});

describe('staff.retention', () => {
  it('both journals switched off (the default): no query at all', async () => {
    const job = new StaffRetentionJob(settings(), noDb);
    await expect(job.run()).resolves.toEqual({ skipped: 'off' });
  });

  it('on: deletes in batches of 500 by created_at until a short batch, per journal', async () => {
    const counts = [STAFF_RETENTION_BATCH, 3, 0];
    const $executeRaw = jest.fn(() => Promise.resolve(counts.shift() ?? 0));
    const job = new StaffRetentionJob(
      settings({ 'staff.lease_enabled': true }),
      { $executeRaw } as unknown as PrismaService,
    );
    await expect(job.run(new Date('2026-10-27T03:00:00Z'))).resolves.toEqual({
      signals: STAFF_RETENTION_BATCH + 3,
      leaseEvents: 0,
    });
    expect($executeRaw).toHaveBeenCalledTimes(3);
    const sql = (
      $executeRaw.mock.calls as unknown as [
        TemplateStringsArray,
        ...unknown[],
      ][]
    ).map((c) => c[0].join('?'));
    expect(sql[0]).toContain('DELETE FROM "staff_quality_signals"');
    expect(sql[2]).toContain('DELETE FROM "work_lease_events"');
    // 120 days for the signals, 90 for the lease events.
    const firstCut = ($executeRaw.mock.calls[0] as unknown[])[1] as Date;
    expect(firstCut.toISOString()).toBe('2026-06-29T03:00:00.000Z');
    const leaseCut = ($executeRaw.mock.calls[2] as unknown[])[1] as Date;
    expect(leaseCut.toISOString()).toBe('2026-07-29T03:00:00.000Z');
  });
});
