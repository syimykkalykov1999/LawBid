/* eslint-disable @typescript-eslint/require-await -- async mocks mirror the real signatures */
import type { PinoLogger } from 'nestjs-pino';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { AwsOpsService } from '../../common/ops/aws-ops.service';
import type { OpsStateService } from '../../common/ops/ops-state.service';
import type { SecretsService } from '../../common/secrets/secrets.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { OpsGuardJob, newestOf } from './ops-guard.job';

function setup(
  over: {
    dbFails?: boolean;
    dbDelayMs?: number;
    settings?: Record<string, unknown>;
    cost?: {
      actualUsd: number;
      forecastUsd: number | null;
      limitUsd: number;
    } | null;
    scaleMode?: { mode: 'min' | 'normal'; by: 'owner' | 'auto' } | null;
    awsAvailable?: boolean;
    creds?: Record<string, string> | null;
  } = {},
) {
  const prisma = {
    $queryRaw: jest.fn(async () => {
      if (over.dbDelayMs)
        await new Promise((r) => setTimeout(r, over.dbDelayMs));
      if (over.dbFails) throw new Error('connection refused');
      return [{ '?column?': 1 }];
    }),
  };
  const state = {
    setDbProbe: jest.fn(),
    setHeavyPaused: jest.fn(),
    syncQueues: jest.fn(),
    isHeavyPaused: jest.fn(async () => false),
    setCost: jest.fn(),
    scaleMode: jest.fn(async () => over.scaleMode ?? null),
    setScaleMode: jest.fn(),
    setLastBackup: jest.fn(),
  };
  const aws = {
    cost: jest.fn(async () =>
      over.cost === undefined
        ? null
        : over.cost && { ...over.cost, checkedAt: 'x' },
    ),
    available: over.awsAvailable ?? true,
    setScale: jest.fn(),
  };
  const values: Record<string, unknown> = {
    'ops.auto_pause_heavy_jobs': true,
    'ops.db_slow_ms': 800,
    'ops.auto_scale_down_on_budget': true,
    'ops.backup_max_age_hours': 26,
    ...over.settings,
  };
  const settings = {
    boolean: jest.fn(async (k: string) => values[k] as boolean),
    number: jest.fn(async (k: string) => values[k] as number),
  };
  const secrets = {
    get: jest.fn(async () =>
      over.creds === undefined ? null : over.creds && { fields: over.creds },
    ),
  };
  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const job = new OpsGuardJob(
    prisma as unknown as PrismaService,
    state as unknown as OpsStateService,
    aws as unknown as AwsOpsService,
    settings as unknown as AppSettingsService,
    secrets as unknown as SecretsService,
    logger as unknown as PinoLogger,
  );
  return { job, state, aws, logger };
}

describe('OpsGuardJob.guard', () => {
  it('healthy database: emits db_health, re-syncs queues, no pause', async () => {
    const { job, state, logger } = setup();
    const r = await job.guard();
    expect(r.ok).toBe(true);
    expect(state.setHeavyPaused).not.toHaveBeenCalled();
    expect(state.syncQueues).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ metric: 'db_health', ok: 1 }),
      'database health',
    );
  });

  it('unreachable database: pauses heavy jobs automatically', async () => {
    const { job, state, logger } = setup({ dbFails: true });
    const r = await job.guard();
    expect(r.ok).toBe(false);
    expect(state.setHeavyPaused).toHaveBeenCalledWith(
      true,
      'auto',
      'db unreachable',
      expect.any(Date),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ ok: 0 }),
      'database health',
    );
  });

  it('slow database: pauses; switch off: does not', async () => {
    const slow = setup({ dbDelayMs: 30, settings: { 'ops.db_slow_ms': 5 } });
    await slow.job.guard();
    expect(slow.state.setHeavyPaused).toHaveBeenCalledWith(
      true,
      'auto',
      expect.stringMatching(/^db \d+ ms > 5 ms$/),
      expect.any(Date),
    );

    const off = setup({
      dbFails: true,
      settings: { 'ops.auto_pause_heavy_jobs': false },
    });
    await off.job.guard();
    expect(off.state.setHeavyPaused).not.toHaveBeenCalled();
  });
});

describe('OpsGuardJob.costCheck', () => {
  it('no budget configured: skips', async () => {
    const { job, aws } = setup();
    expect(await job.costCheck()).toEqual({ skipped: 'no budget configured' });
    expect(aws.setScale).not.toHaveBeenCalled();
  });

  it('budget reached: caps autoscaling at the minimum once', async () => {
    const { job, aws, state, logger } = setup({
      cost: { actualUsd: 201, forecastUsd: 260, limitUsd: 200 },
    });
    await job.costCheck();
    expect(aws.setScale).toHaveBeenCalledWith('min');
    expect(state.setScaleMode).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'min', by: 'auto' }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ alert: 'cost_ceiling' }),
      expect.any(String),
    );

    const again = setup({
      cost: { actualUsd: 230, forecastUsd: 260, limitUsd: 200 },
      scaleMode: { mode: 'min', by: 'auto' },
    });
    await again.job.costCheck();
    expect(again.aws.setScale).not.toHaveBeenCalled();
  });

  it('budget reached but the switch is off: only alerts', async () => {
    const { job, aws, logger } = setup({
      cost: { actualUsd: 201, forecastUsd: null, limitUsd: 200 },
      settings: { 'ops.auto_scale_down_on_budget': false },
    });
    await job.costCheck();
    expect(aws.setScale).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ alert: 'cost_ceiling' }),
      expect.any(String),
    );
  });

  it('new month under budget: gives back an automatic cap, keeps an owner cap', async () => {
    const auto = setup({
      cost: { actualUsd: 3, forecastUsd: 150, limitUsd: 200 },
      scaleMode: { mode: 'min', by: 'auto' },
    });
    await auto.job.costCheck();
    expect(auto.aws.setScale).toHaveBeenCalledWith('normal');

    const owner = setup({
      cost: { actualUsd: 3, forecastUsd: 150, limitUsd: 200 },
      scaleMode: { mode: 'min', by: 'owner' },
    });
    await owner.job.costCheck();
    expect(owner.aws.setScale).not.toHaveBeenCalled();
  });
});

describe('OpsGuardJob.backupCheck', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });
  const creds = {
    apiKey: 'k'.repeat(30),
    clusterId: '00000000-0000-0000-0000-000000000000',
  };

  it('no key: skips', async () => {
    const { job } = setup();
    expect(await job.backupCheck()).toEqual({
      skipped: 'no CockroachDB Cloud key',
    });
  });

  it('fresh backup: stored, no alert; stale: alert', async () => {
    const now = new Date('2026-10-05T12:00:00Z');
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        backups: [
          { as_of_time: '2026-10-05T10:00:00Z' },
          { as_of_time: '2026-10-04T10:00:00Z' },
        ],
      }),
    })) as unknown as typeof fetch;
    const fresh = setup({ creds });
    expect(await fresh.job.backupCheck(now)).toEqual(
      expect.objectContaining({ ok: true }),
    );
    expect(fresh.state.setLastBackup).toHaveBeenCalledWith(
      expect.objectContaining({ at: '2026-10-05T10:00:00.000Z' }),
    );
    expect(fresh.logger.warn).not.toHaveBeenCalled();

    const stale = setup({ creds, settings: { 'ops.backup_max_age_hours': 1 } });
    expect(await stale.job.backupCheck(now)).toEqual(
      expect.objectContaining({ ok: false }),
    );
    expect(stale.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ alert: 'backup_stale' }),
      expect.any(String),
    );
  });

  it('cloud API error: alert, no crash', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 401,
    })) as unknown as typeof fetch;
    const { job, logger } = setup({ creds });
    expect(await job.backupCheck()).toEqual({ ok: false });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ alert: 'backup_stale' }),
      'backup check failed',
    );
  });
});

describe('newestOf', () => {
  it('takes the newest time whatever the field name and order', () => {
    expect(
      newestOf([
        { created_at: '2026-10-01T00:00:00Z' },
        { completed_at: '2026-10-03T00:00:00Z' },
        { as_of_time: 'garbage' },
      ])?.toISOString(),
    ).toBe('2026-10-03T00:00:00.000Z');
    expect(newestOf([])).toBeNull();
  });
});
