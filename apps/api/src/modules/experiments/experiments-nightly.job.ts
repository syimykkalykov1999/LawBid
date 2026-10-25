import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ExperimentMetricsService,
  type ExperimentReport,
} from './experiment-metrics.service';
import { ExperimentsService } from './experiments.service';

export interface ExperimentsNightlyResult {
  partitionsCreated: number;
  partitionsDropped: number;
  computed: number;
  stopped: { key: string; reason: string }[];
}

/**
 * `experiments.metrics`, nightly (owner 2026-10-25):
 *  1. keeps the weekly partitions of ranking_events: creates the next weeks,
 *     removes weeks older than `ranking.events_retention_days` (90);
 *  2. stops experiments whose end date has passed;
 *  3. for every running experiment computes the per-variant report (CTR@k,
 *     case → bid → accepted, time to first bid, cases without a bid in 24 h,
 *     new-attorney opportunity, empty searches, reports / errors per 1000
 *     impressions) with confidence intervals and the SRM check, stores it,
 *     and stops the experiment by itself when a guardrail is tripped.
 */
@Injectable()
export class ExperimentsNightlyJob {
  private readonly log = new Logger(ExperimentsNightlyJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly metrics: ExperimentMetricsService,
    private readonly experiments: ExperimentsService,
  ) {}

  async run(): Promise<ExperimentsNightlyResult> {
    const out: ExperimentsNightlyResult = {
      partitionsCreated: 0,
      partitionsDropped: 0,
      computed: 0,
      stopped: [],
    };
    try {
      const created = await this.prisma.$queryRaw<{ n: number }[]>(
        Prisma.sql`SELECT lawbid_ranking_ensure_partitions(4)::int AS n`,
      );
      out.partitionsCreated = Number(created[0]?.n ?? 0);
      const keep = Math.max(
        7,
        Math.round(await this.settings.number('ranking.events_retention_days')),
      );
      const dropped = await this.prisma.$queryRaw<{ n: number }[]>(
        Prisma.sql`SELECT lawbid_ranking_drop_old_partitions(${keep}::int)::int AS n`,
      );
      out.partitionsDropped = Number(dropped[0]?.n ?? 0);
    } catch (e) {
      this.log.error(`ranking_events maintenance failed: ${String(e)}`);
    }

    const running = await this.prisma.experiment.findMany({
      where: { status: 'running' },
    });
    for (const exp of running) {
      try {
        if (exp.end_at && exp.end_at.getTime() <= Date.now()) {
          await this.stop(exp.id, 'Срок теста вышел (дата окончания)', false);
          out.stopped.push({ key: exp.key, reason: 'end_at' });
          continue;
        }
        const report = await this.metrics.compute(exp);
        await this.save(exp.id, report);
        out.computed++;
        if (report.guardrail.tripped) {
          const reason = `Защита: ${report.guardrail.reasons.join('; ')}`.slice(0, 300);
          await this.stop(exp.id, reason, true);
          out.stopped.push({ key: exp.key, reason });
          this.log.warn(`experiment ${exp.key} stopped by guardrail: ${reason}`);
        }
      } catch (e) {
        this.log.error(`experiment ${exp.key} report failed: ${String(e)}`);
      }
    }
    if (out.stopped.length > 0) this.experiments.invalidate();
    return out;
  }

  /** Computes and stores one report now (admin «Обновить»). */
  async computeNow(experimentId: string): Promise<ExperimentReport | null> {
    const exp = await this.prisma.experiment.findUnique({
      where: { id: experimentId },
    });
    if (!exp) return null;
    const report = await this.metrics.compute(exp);
    await this.save(exp.id, report);
    return report;
  }

  private async save(experimentId: string, report: ExperimentReport) {
    await this.prisma.experimentResult.create({
      data: {
        experiment_id: experimentId,
        srm_p: report.srm.p,
        srm_flag: report.srm.flag,
        guardrail_tripped: report.guardrail.tripped,
        payload: report as unknown as Prisma.InputJsonValue,
      },
    });
    // Keep the table small: the last 30 reports of each experiment.
    await this.prisma.$executeRaw(Prisma.sql`
      DELETE FROM experiment_results
       WHERE experiment_id = ${experimentId}::uuid
         AND id NOT IN (
           SELECT id FROM experiment_results
            WHERE experiment_id = ${experimentId}::uuid
            ORDER BY computed_at DESC LIMIT 30)`);
  }

  private async stop(id: string, reason: string, bySystem: boolean) {
    await this.prisma.experiment.updateMany({
      where: { id, status: 'running' },
      data: {
        status: 'stopped',
        stopped_at: new Date(),
        stop_reason: reason,
        stopped_by_system: bySystem,
      },
    });
  }
}
