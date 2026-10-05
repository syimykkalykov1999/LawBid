import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { AwsOpsService } from '../../common/ops/aws-ops.service';
import { OpsStateService } from '../../common/ops/ops-state.service';
import { SecretsService } from '../../common/secrets/secrets.service';
import { OBSERVED_QUEUES } from '../../jobs/handlers/ops-metrics.job';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import { S3StorageService } from '../files/storage/s3-storage.service';
import type {
  HealthItemDto,
  HealthStatus,
  SystemHealthDto,
} from './admin-ops.dto';

const PROBE_TIMEOUT_MS = 3_000;
const DLQ = 'stripe-webhooks-dlq';

function withTimeout<T>(p: Promise<T>, ms = PROBE_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`no answer in ${ms} ms`)), ms).unref(),
    ),
  ]);
}

function ageSec(iso: string | undefined | null, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t)
    ? null
    : Math.max(0, Math.round((now.getTime() - t) / 1000));
}

/**
 * Owner 2026-10-05: «Здоровье системы» — one traffic light per part of the
 * system, computed here so the admin only words it. Every probe has a
 * short timeout and its own try/catch: one broken part never hides the
 * others (a dead Redis shows red Redis, not an error page).
 */
@Injectable()
export class SystemHealthService implements OnModuleDestroy {
  private queues?: Queue[];

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
    private readonly state: OpsStateService,
    private readonly aws: AwsOpsService,
    private readonly settings: AppSettingsService,
    private readonly secrets: SecretsService,
    private readonly flags: FeatureFlagsService,
    private readonly storage: S3StorageService,
  ) {}

  async report(now: Date = new Date()): Promise<SystemHealthDto> {
    const items = await Promise.all([
      Promise.resolve(this.api()),
      this.safe('worker', () => this.worker(now)),
      this.safe('database', () => this.database()),
      this.safe('redis', () => this.redisItem()),
      this.safe('storage', () => this.storageItem()),
      this.safe('video', () => this.video()),
      this.safe('queues', () => this.queueItem(now)),
      this.safe('backup', () => this.backup(now)),
      this.safe('cost', () => this.cost()),
    ]);
    const [
      heavyPause,
      scaleMode,
      autoPause,
      autoScale,
      dbSlowMs,
      backupMaxAgeHours,
    ] = await Promise.all([
      this.state.heavyPause().catch(() => null),
      this.state.scaleMode().catch(() => null),
      this.settings.boolean('ops.auto_pause_heavy_jobs'),
      this.settings.boolean('ops.auto_scale_down_on_budget'),
      this.settings.number('ops.db_slow_ms'),
      this.settings.number('ops.backup_max_age_hours'),
    ]);
    const overall = items.some((i) => i.status === 'red')
      ? 'red'
      : items.some((i) => i.status === 'yellow') ||
          heavyPause ||
          scaleMode?.mode === 'min'
        ? 'yellow'
        : 'green';
    return {
      overall,
      generatedAt: now.toISOString(),
      items,
      heavyPause,
      scaleMode,
      actions: { onAws: this.aws.available, budget: this.aws.budgetAvailable },
      settings: {
        autoPauseHeavyJobs: autoPause,
        autoScaleDownOnBudget: autoScale,
        dbSlowMs,
        backupMaxAgeHours,
      },
    };
  }

  private async safe(
    key: string,
    fn: () => Promise<Omit<HealthItemDto, 'key'>>,
  ): Promise<HealthItemDto> {
    try {
      return { key, ...(await fn()) };
    } catch (e) {
      return { key, status: 'red', detail: { error: (e as Error).message } };
    }
  }

  private api(): HealthItemDto {
    const mem = process.memoryUsage();
    return {
      key: 'api',
      status: 'green',
      detail: {
        uptimeSec: Math.round(process.uptime()),
        memoryMb: Math.round(mem.rss / 1024 / 1024),
        version:
          this.config.get<string>('APP_VERSION') ??
          this.config.get<string>('GIT_SHA') ??
          null,
      },
    };
  }

  private async worker(now: Date): Promise<Omit<HealthItemDto, 'key'>> {
    const hb = await this.state.workerHeartbeat();
    const age = ageSec(hb?.at, now);
    const status: HealthStatus =
      age === null
        ? 'red'
        : age <= 90
          ? 'green'
          : age <= 180
            ? 'yellow'
            : 'red';
    return { status, detail: { lastBeatSec: age, mode: hb?.mode ?? null } };
  }

  private async database(): Promise<Omit<HealthItemDto, 'key'>> {
    const slowMs = await this.settings.number('ops.db_slow_ms');
    const started = Date.now();
    await withTimeout(this.prisma.$queryRaw`SELECT 1`);
    const latencyMs = Date.now() - started;
    return {
      status: latencyMs > slowMs ? 'yellow' : 'green',
      detail: { latencyMs, slowMs },
    };
  }

  private async redisItem(): Promise<Omit<HealthItemDto, 'key'>> {
    const started = Date.now();
    await withTimeout(this.redis.ping());
    const latencyMs = Date.now() - started;
    const info = await withTimeout(this.redis.info('memory'));
    const field = (name: string) => {
      const m = new RegExp(`^${name}:(\\d+)`, 'm').exec(info);
      return m ? Number(m[1]) : 0;
    };
    const used = field('used_memory');
    const max = field('maxmemory');
    const usedPct = max > 0 ? Math.round((used / max) * 100) : null;
    const status: HealthStatus =
      usedPct !== null && usedPct >= 95
        ? 'red'
        : (usedPct !== null && usedPct >= 80) || latencyMs > 200
          ? 'yellow'
          : 'green';
    return {
      status,
      detail: { latencyMs, usedMb: Math.round(used / 1024 / 1024), usedPct },
    };
  }

  private async storageItem(): Promise<Omit<HealthItemDto, 'key'>> {
    const creds = await this.secrets.get('storage');
    if (!creds && !this.config.get<string>('S3_BUCKET_MEDIA')) {
      return { status: 'grey', detail: { configured: false } };
    }
    const started = Date.now();
    // A missing key answers null: reaching the bucket is what counts.
    await withTimeout(
      this.storage.head(this.storage.bucket('media'), 'ops/health-probe'),
      5_000,
    );
    return { status: 'green', detail: { latencyMs: Date.now() - started } };
  }

  private async video(): Promise<Omit<HealthItemDto, 'key'>> {
    const enabled = await this.flags.isEnabled('video_posts', false);
    const keys = !!(await this.secrets.get('bunny_stream'));
    if (!enabled) return { status: 'grey', detail: { enabled, keys } };
    return { status: keys ? 'green' : 'red', detail: { enabled, keys } };
  }

  private open(): Queue[] {
    if (!this.queues) {
      const url = this.config.getOrThrow<string>('REDIS_URL');
      this.queues = OBSERVED_QUEUES.map(
        (name) => new Queue(name, { connection: { url } }),
      );
    }
    return this.queues;
  }

  private async queueItem(now: Date): Promise<Omit<HealthItemDto, 'key'>> {
    let waiting = 0;
    let failed = 0;
    let oldestSec = 0;
    let dlq = 0;
    const paused: string[] = [];
    for (const q of this.open()) {
      const c = await withTimeout(q.getJobCounts('waiting', 'failed'));
      if (q.name === DLQ) {
        dlq = c.waiting ?? 0;
        continue;
      }
      waiting += c.waiting ?? 0;
      failed += c.failed ?? 0;
      const [oldest] = await withTimeout(q.getWaiting(0, 0));
      if (oldest) {
        oldestSec = Math.max(
          oldestSec,
          Math.floor((now.getTime() - oldest.timestamp) / 1000),
        );
      }
      if (await q.isPaused()) paused.push(q.name);
    }
    const status: HealthStatus =
      oldestSec > 300
        ? 'red'
        : oldestSec > 60 || dlq > 0 || waiting > 1000
          ? 'yellow'
          : 'green';
    return { status, detail: { waiting, failed, oldestSec, dlq, paused } };
  }

  private async backup(now: Date): Promise<Omit<HealthItemDto, 'key'>> {
    const maxH = await this.settings.number('ops.backup_max_age_hours');
    const b = await this.state.lastBackup();
    const creds = await this.secrets.get('cockroach_cloud');
    if (!b) {
      return {
        status: creds ? 'yellow' : 'grey',
        detail: { configured: !!creds, ageHours: null, maxHours: maxH },
      };
    }
    const age = ageSec(b.at, now);
    const ageHours = age === null ? null : Math.round((age / 3600) * 10) / 10;
    const status: HealthStatus =
      ageHours === null
        ? 'yellow'
        : ageHours <= maxH
          ? 'green'
          : ageHours <= maxH * 2
            ? 'yellow'
            : 'red';
    return {
      status,
      detail: {
        configured: !!creds,
        at: b.at,
        ageHours,
        maxHours: maxH,
        checkedAt: b.checkedAt,
      },
    };
  }

  private async cost(): Promise<Omit<HealthItemDto, 'key'>> {
    let c = await this.state.cost();
    if (!c && this.aws.budgetAvailable) {
      c = await withTimeout(this.aws.cost(), 5_000);
      if (c) await this.state.setCost(c);
    }
    if (!c)
      return {
        status: 'grey',
        detail: { configured: this.aws.budgetAvailable },
      };
    const forecast = c.forecastUsd ?? c.actualUsd;
    const status: HealthStatus =
      c.actualUsd >= c.limitUsd
        ? 'red'
        : forecast > c.limitUsd
          ? 'yellow'
          : 'green';
    return { status, detail: { ...c, configured: true } };
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all((this.queues ?? []).map((q) => q.close()));
  }
}
