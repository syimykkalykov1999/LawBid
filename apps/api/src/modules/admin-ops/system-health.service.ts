import { Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { IncidentsService } from '../../common/ops/status/incidents.service';
import { StatusProbesService } from '../../common/ops/status/status-probes.service';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { AwsOpsService } from '../../common/ops/aws-ops.service';
import { OpsStateService } from '../../common/ops/ops-state.service';
import { SecretRotationService } from '../../common/ops/secret-rotation.service';
import { MessageBodyCipher } from '../../common/secrets/message-body-cipher';
import { SecretsService } from '../../common/secrets/secrets.service';
import {
  MESSAGE_KID_ROW_ALARM,
  MessageReencryptJob,
} from '../../jobs/handlers/message-reencrypt.job';
import {
  OBSERVED_QUEUES,
  SLOW_LANE_QUEUES,
} from '../../jobs/handlers/ops-metrics.job';
import { PartitionService } from '../../partitioning/partition.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import { S3StorageService } from '../files/storage/s3-storage.service';
import { DRILL_STALE_DAYS, RestoreDrillService } from './restore-drill.service';
import type {
  HealthItemDto,
  HealthStatus,
  SystemHealthDto,
} from './admin-ops.dto';
import { bullOptions } from '../../redis/redis-connection';

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
    private readonly cipher: MessageBodyCipher,
    private readonly reencrypt: MessageReencryptJob,
    // Owner 2026-10-22: the status board's extra probes and incident list.
    @Optional() private readonly probes?: StatusProbesService,
    @Optional() private readonly incidents?: IncidentsService,
    // WP-G: monthly AWS Backup restore test.
    @Optional() private readonly drill?: RestoreDrillService,
    // Owner 2026-10-24: «a table passed 50 million rows» signal.
    @Optional() private readonly partitions?: PartitionService,
    // Owner 2026-10-25: last / next rotation per rotated secret.
    @Optional() private readonly rotation?: SecretRotationService,
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
      this.safe('message_keys', () => this.messageKeys()),
      this.safe('restore_drill', () => this.restoreDrill(now)),
      this.safe('table_growth', () => this.tableGrowth()),
    ]);
    if (this.rotation?.enabled) {
      items.push(
        await this.safe('secret_rotation', () => this.secretRotation(now)),
      );
    }
    const extra = this.probes ? await this.probes.extra() : [];
    items.push(...extra.filter((e) => !items.some((i) => i.key === e.key)));
    const incidents = this.incidents
      ? (await this.incidents.recent(24, now).catch(() => [])).map((i) => ({
          id: i.id,
          component: i.component,
          openedAt: i.openedAt.toISOString(),
          closedAt: i.closedAt?.toISOString() ?? null,
          detail: i.detail,
        }))
      : [];
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
      incidents,
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

  /**
   * Owner 2026-10-22 (SECURITY_TODO «Re-encryption job»): which message
   * key is active, which retired kids still have rows, and how far the
   * `messages.reencrypt` pass got. Grey without keys (local dev).
   */
  private async messageKeys(): Promise<Omit<HealthItemDto, 'key'>> {
    if (!this.cipher.enabled) {
      return { status: 'grey', detail: { enabled: false } };
    }
    const activeKid = this.cipher.activeKid;
    const retiredKids = this.cipher.kids.filter((k) => k !== activeKid);
    const state = await this.reencrypt.state();
    const current =
      state && state.fingerprint === this.reencrypt.fingerprint()
        ? state
        : null;
    const stuck = current
      ? Object.values(current.byKid).reduce((n, k) => n + k.failed, 0)
      : 0;
    // S3-2: one random-IV AES-GCM key must not seal without limit.
    const kidRows = current?.kidRows ?? {};
    const overKid = Object.entries(kidRows).find(
      ([, n]) => n >= MESSAGE_KID_ROW_ALARM,
    );
    const alarm = overKid
      ? `Под ключом «${overKid[0]}» уже ${overKid[1].toLocaleString('ru-RU')} сообщений (предел 1 млрд). Выпустите новый ключ (kid) и сделайте его активным; ключи меняют раз в год.`
      : null;
    const status: HealthStatus = alarm
      ? 'red'
      : !current
        ? retiredKids.length > 0
          ? 'yellow'
          : 'green'
        : stuck > 0
          ? 'red'
          : current.phase === 'done'
            ? 'green'
            : 'yellow';
    return {
      status,
      detail: {
        enabled: true,
        activeKid,
        retiredKids,
        phase: current?.phase ?? null,
        scanned: current?.scanned ?? 0,
        rewritten: current?.rewritten ?? 0,
        failed: current?.failed ?? 0,
        byKid: current?.byKid ?? {},
        /** Sealed message bodies per key id (exact after a finished pass). */
        kidRows,
        kidRowAlarmAt: MESSAGE_KID_ROW_ALARM,
        alarm,
        stores: current?.stores ?? null,
        startedAt: current?.startedAt ?? null,
        updatedAt: current?.updatedAt ?? null,
        finishedAt: current?.finishedAt ?? null,
        /** Retired kids with no stuck rows after a finished pass may leave
         * MESSAGE_ENC_KEYS. */
        removableKids:
          current?.phase === 'done'
            ? retiredKids.filter((k) => (current.byKid[k]?.failed ?? 0) === 0)
            : [],
      },
    };
  }

  /**
   * Owner 2026-10-25 (docs/runbooks/secrets-rotation.md): when each
   * automatically rotated secret was last rotated and when the next one is
   * due. Red = a rotation failed, yellow = overdue or the hourly check is
   * silent. Only present while rotation is switched on.
   */
  private async secretRotation(now: Date): Promise<Omit<HealthItemDto, 'key'>> {
    const rows = await this.rotation!.rows(now);
    const status: HealthStatus = rows.some((r) => r.state === 'failed')
      ? 'red'
      : rows.some((r) => r.state === 'overdue' || r.state === 'unknown')
        ? 'yellow'
        : 'green';
    return { status, detail: { secrets: rows } };
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
    // Owner 2026-10-25: the nightly bloat job. Wasted space over the line on
    // a big hot table = yellow (the runbook pg-repack.md says what to do);
    // the reading is optional, never turns the light red.
    let bloat: Awaited<ReturnType<OpsStateService['bloat']>> = null;
    try {
      bloat = await this.state.bloat();
    } catch {
      bloat = null;
    }
    const bloatOver = bloat?.over ?? [];
    return {
      status: latencyMs > slowMs || bloatOver.length > 0 ? 'yellow' : 'green',
      detail: {
        latencyMs,
        slowMs,
        ...(bloat
          ? { bloatOver, bloatCheckedAt: bloat.at, bloatSource: bloat.source }
          : {}),
      },
    };
  }

  /**
   * Owner 2026-10-24: yellow when a table that is NOT partitioned holds 50
   * million rows or more (time to run «Разделить таблицу по месяцам» on the
   * «Масштаб» page). Estimates from pg_class, free to read. Grey when the
   * probe is not available (tests, local).
   */
  private async tableGrowth(): Promise<Omit<HealthItemDto, 'key'>> {
    if (!this.partitions) return { status: 'grey', detail: {} };
    try {
      const g = await this.partitions.growthSignal();
      return {
        status: g.over.length > 0 ? 'yellow' : 'green',
        detail: { over: g.over, top: g.top, thresholdRows: 50_000_000 },
      };
    } catch {
      return { status: 'grey', detail: {} };
    }
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
    const awsOn = !!creds || !!this.config.get<string>('S3_BUCKET_MEDIA');
    // Owner 2026-10-24: R2 (public media) is checked too when it has keys.
    const r2Bucket = await this.storage.publicStoreBucket();
    if (!awsOn && !r2Bucket) {
      return { status: 'grey', detail: { configured: false } };
    }
    const detail: Record<string, unknown> = {};
    let ok = true;
    if (awsOn) {
      const started = Date.now();
      try {
        // A missing key answers null: reaching the bucket is what counts.
        await withTimeout(
          this.storage.head(this.storage.bucket('media'), 'ops/health-probe'),
          5_000,
        );
        detail.latencyMs = Date.now() - started;
      } catch (e) {
        ok = false;
        detail.error = (e as Error).message;
      }
    }
    if (r2Bucket) {
      const started = Date.now();
      try {
        await withTimeout(
          this.storage.head(r2Bucket, 'ops/health-probe'),
          5_000,
        );
        detail.r2LatencyMs = Date.now() - started;
      } catch (e) {
        ok = false;
        detail.r2Error = (e as Error).message;
      }
    }
    return { status: ok ? 'green' : 'red', detail };
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
        (name) => new Queue(name, bullOptions(name, url)),
      );
    }
    return this.queues;
  }

  private async queueItem(now: Date): Promise<Omit<HealthItemDto, 'key'>> {
    let waiting = 0;
    let failed = 0;
    let oldestSec = 0;
    let slowOldestSec = 0;
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
        const age = Math.floor((now.getTime() - oldest.timestamp) / 1000);
        // Long lanes (heavy cron, deletions, fan-outs) may wait for a while.
        if (SLOW_LANE_QUEUES.includes(q.name)) {
          slowOldestSec = Math.max(slowOldestSec, age);
        } else {
          oldestSec = Math.max(oldestSec, age);
        }
      }
      if (await q.isPaused()) paused.push(q.name);
    }
    const status: HealthStatus =
      oldestSec > 300
        ? 'red'
        : oldestSec > 60 || dlq > 0 || waiting > 1000 || slowOldestSec > 3600
          ? 'yellow'
          : 'green';
    return {
      status,
      detail: { waiting, failed, oldestSec, slowOldestSec, dlq, paused },
    };
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

  /**
   * WP-G: the monthly restore test. Green = the last restore completed and
   * is younger than DRILL_STALE_DAYS; yellow = overdue; red = the last
   * restore failed; grey = not on AWS / no run yet (nothing to judge).
   */
  private async restoreDrill(now: Date): Promise<Omit<HealthItemDto, 'key'>> {
    if (!this.drill) return { status: 'grey', detail: { state: 'unknown' } };
    const r = await withTimeout(this.drill.last(now), 5_000);
    const status: HealthStatus =
      r.state === 'unknown' || r.state === 'never'
        ? 'grey'
        : r.state === 'failed'
          ? 'red'
          : r.lastOkDaysAgo !== null && r.lastOkDaysAgo > DRILL_STALE_DAYS
            ? 'yellow'
            : 'green';
    return { status, detail: { ...r, staleAfterDays: DRILL_STALE_DAYS } };
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
