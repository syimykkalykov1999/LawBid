import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { AwsCapacityService } from '../../common/ops/aws-capacity.service';
import { AwsOpsService } from '../../common/ops/aws-ops.service';
import { OpsStateService } from '../../common/ops/ops-state.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Owner 2026-10-05 «я не понимаю серверы и базы — пусть система сама»:
 * the reactions an on-call engineer would otherwise do by hand.
 *
 * - `ops.guard` (every minute): probes the database, emits `db_health`
 *   (CloudWatch alarms «база не отвечает» / «база медленная»), pauses the
 *   heavy background work while the database is slow and lets it resume
 *   on its own (ops.auto_pause_heavy_jobs, default on).
 * - `ops.cost-check` (hourly): reads this month's AWS spend from the
 *   budget; at 100 % caps autoscaling at the minimum until the next month
 *   (ops.auto_scale_down_on_budget, default on) and gives it back when the
 *   new month starts.
 * - `ops.backup-check` (daily): reads the newest restorable time of the RDS
 *   database; older than ops.backup_max_age_hours → alert.
 *
 * Alerts are log lines with an `alert` field; infra/modules/monitoring
 * turns them into e-mails with a plain «что делать».
 */
@Injectable()
export class OpsGuardJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly state: OpsStateService,
    private readonly aws: AwsOpsService,
    private readonly settings: AppSettingsService,
    private readonly capacity: AwsCapacityService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OpsGuardJob.name);
  }

  async guard(
    now: Date = new Date(),
  ): Promise<{ ok: boolean; latencyMs: number | null; paused: boolean }> {
    const started = Date.now();
    let ok = true;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (e) {
      ok = false;
      this.logger.error({ err: (e as Error).message }, 'database probe failed');
    }
    const latencyMs = ok ? Date.now() - started : null;
    await this.state.setDbProbe({ ok, latencyMs, at: now.toISOString() });
    this.logger.info(
      { metric: 'db_health', ok: ok ? 1 : 0, latencyMs: latencyMs ?? 0 },
      'database health',
    );

    const [auto, slowMs] = await Promise.all([
      this.settings.boolean('ops.auto_pause_heavy_jobs'),
      this.settings.number('ops.db_slow_ms'),
    ]);
    const slow = !ok || (latencyMs ?? 0) > slowMs;
    if (auto && slow) {
      // Renews the 15-minute auto pause while the database stays slow.
      await this.state.setHeavyPaused(
        true,
        'auto',
        ok ? `db ${latencyMs} ms > ${slowMs} ms` : 'db unreachable',
        now,
      );
      this.logger.warn(
        { alert: 'heavy_jobs_auto_paused', latencyMs },
        'heavy background jobs paused: database is slow',
      );
    } else {
      await this.state.syncQueues();
    }
    return { ok, latencyMs, paused: await this.state.isHeavyPaused() };
  }

  async costCheck(now: Date = new Date()): Promise<unknown> {
    const cost = await this.aws.cost(now);
    if (!cost) return { skipped: 'no budget configured' };
    await this.state.setCost(cost);
    this.logger.info(
      {
        metric: 'aws_cost',
        actualUsd: cost.actualUsd,
        forecastUsd: cost.forecastUsd ?? 0,
        limitUsd: cost.limitUsd,
      },
      'aws spend this month',
    );
    const over = cost.actualUsd >= cost.limitUsd;
    const mode = await this.state.scaleMode();
    if (over) {
      this.logger.warn(
        {
          alert: 'cost_ceiling',
          actualUsd: cost.actualUsd,
          limitUsd: cost.limitUsd,
        },
        'monthly AWS budget reached',
      );
      const auto = await this.settings.boolean('ops.auto_scale_down_on_budget');
      if (auto && this.aws.available && mode?.mode !== 'min') {
        await this.aws.setScale('min');
        await this.state.setScaleMode({
          mode: 'min',
          by: 'auto',
          at: now.toISOString(),
          source: 'budget',
        });
        this.logger.warn(
          { alert: 'cost_scaled_down' },
          'autoscaling capped at the minimum until the next month',
        );
      }
    } else if (
      mode?.mode === 'min' &&
      mode.by === 'auto' &&
      mode.source !== 'economy' &&
      this.aws.available
    ) {
      // A new month (spend reset): give the capacity back.
      await this.aws.setScale('normal');
      await this.state.setScaleMode({
        mode: 'normal',
        by: 'auto',
        at: now.toISOString(),
        source: 'budget',
      });
      this.logger.info(
        'autoscaling ceiling restored (budget back under the limit)',
      );
    }
    return cost;
  }

  /**
   * Daily (S20-5, 2026-10-25): the newest point the RDS database can be
   * restored to (automated backups + WAL, a free DescribeDBInstances call).
   * Replaces the old CockroachDB Cloud poll: the database is RDS, so that
   * call was skipped every hour and the health page never showed a backup.
   */
  async backupCheck(now: Date = new Date()): Promise<unknown> {
    if (!this.capacity.dbInstance) return { skipped: 'database not on AWS' };
    const maxAgeH = await this.settings.number('ops.backup_max_age_hours');
    let newest: Date | null = null;
    try {
      newest = await this.capacity.latestRestorableTime();
    } catch (e) {
      this.logger.warn(
        { alert: 'backup_stale', err: (e as Error).message },
        'backup check failed',
      );
      return { ok: false };
    }
    if (newest) {
      await this.state.setLastBackup({
        at: newest.toISOString(),
        checkedAt: now.toISOString(),
        source: 'rds',
      });
    }
    const ageH = newest
      ? (now.getTime() - newest.getTime()) / 3_600_000
      : Infinity;
    if (ageH > maxAgeH) {
      this.logger.warn(
        {
          alert: 'backup_stale',
          newest: newest?.toISOString() ?? null,
          maxAgeH,
        },
        'no fresh database backup',
      );
      return { ok: false, newest };
    }
    return { ok: true, newest };
  }
}
