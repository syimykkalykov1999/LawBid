import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { parseVariants } from './experiment-definition';
import { assignVariant, type VariantWeight } from './experiment-math';

interface RunningExperiment {
  id: string;
  key: string;
  variants: VariantWeight[];
  trafficPercent: number;
  startAt: number | null;
  endAt: number | null;
}

export interface Assignment {
  experimentKey: string;
  variant: string;
}

/** Definitions are re-read at most this often per process: a stop applies within it. */
const DEFINITIONS_TTL_MS = 15_000;
const EXPOSURE_FLUSH_MS = 3000;
const EXPOSURE_BATCH = 500;
/** Units remembered as already stored; cleared when it grows past this. */
const SEEN_MAX = 100_000;

/**
 * Server API for other services (owner 2026-10-25):
 *
 *   const v = await experiments.variant(user.id, 'case_feed_v2');
 *   // null = not in the experiment (or it is stopped): behave as before.
 *   // 'control' | 'new_formula' | ...: apply that variant.
 *
 * Assignment is a pure hash of (unit, key): no database read per call, the
 * same unit always gets the same answer, and a stop or rollback simply
 * returns null for everyone. The unit is usually a user id, but any stable
 * id works (a case id, for experiments on cases). The first time a unit is
 * given a variant it is recorded in experiment_exposures (batched,
 * idempotent) so the nightly report can check the split (SRM).
 */
@Injectable()
export class ExperimentsService implements OnModuleDestroy {
  private readonly log = new Logger(ExperimentsService.name);
  private defs: { at: number; byKey: Map<string, RunningExperiment> } | null =
    null;
  private loading: Promise<Map<string, RunningExperiment>> | null = null;
  private readonly seen = new Set<string>();
  private pending: { experiment_id: string; unit_id: string; variant: string }[] =
    [];
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** The variant key for this unit, or null when it is not in the experiment. */
  async variant(unitId: string, key: string): Promise<string | null> {
    return (await this.assign(unitId, key))?.variant ?? null;
  }

  /** Like [variant], with the experiment key to put on logged events. */
  async assign(unitId: string, key: string): Promise<Assignment | null> {
    try {
      const exp = (await this.definitions()).get(key);
      if (!exp) return null;
      const now = Date.now();
      if (exp.startAt !== null && now < exp.startAt) return null;
      if (exp.endAt !== null && now >= exp.endAt) return null;
      const v = assignVariant(unitId, exp.key, exp.variants, exp.trafficPercent);
      if (v === null) return null;
      this.noteExposure(exp.id, unitId, v);
      return { experimentKey: exp.key, variant: v };
    } catch (e) {
      // An experiment must never break the request it is attached to.
      this.log.warn(`variant(${key}) failed, using default: ${String(e)}`);
      return null;
    }
  }

  /** Drops the cached definitions (after an admin start / stop on this pod). */
  invalidate(): void {
    this.defs = null;
  }

  private async definitions(): Promise<Map<string, RunningExperiment>> {
    const now = Date.now();
    if (this.defs && now - this.defs.at < DEFINITIONS_TTL_MS) {
      return this.defs.byKey;
    }
    if (!this.loading) {
      this.loading = this.prisma.experiment
        .findMany({ where: { status: 'running' } })
        .then((rows) => {
          const byKey = new Map<string, RunningExperiment>();
          for (const r of rows) {
            byKey.set(r.key, {
              id: r.id,
              key: r.key,
              variants: parseVariants(r.variants),
              trafficPercent: r.traffic_percent,
              startAt: r.start_at ? r.start_at.getTime() : null,
              endAt: r.end_at ? r.end_at.getTime() : null,
            });
          }
          this.defs = { at: Date.now(), byKey };
          return byKey;
        })
        .finally(() => {
          this.loading = null;
        });
    }
    try {
      return await this.loading;
    } catch (e) {
      // Database trouble: keep serving the last known definitions.
      if (this.defs) return this.defs.byKey;
      throw e;
    }
  }

  private noteExposure(experimentId: string, unitId: string, variant: string) {
    const k = `${experimentId}:${unitId}`;
    if (this.seen.has(k)) return;
    if (this.seen.size >= SEEN_MAX) this.seen.clear();
    this.seen.add(k);
    this.pending.push({
      experiment_id: experimentId,
      unit_id: unitId.slice(0, 64),
      variant,
    });
    if (this.pending.length >= EXPOSURE_BATCH) void this.flushExposures();
    else if (!this.timer) {
      this.timer = setTimeout(() => void this.flushExposures(), EXPOSURE_FLUSH_MS);
      this.timer.unref?.();
    }
  }

  async flushExposures(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending.length === 0) return;
    const rows = this.pending;
    this.pending = [];
    try {
      await this.prisma.experimentExposure.createMany({
        data: rows,
        skipDuplicates: true,
      });
    } catch (e) {
      this.log.warn(`exposures batch lost (${rows.length}): ${String(e)}`);
      // They will be written the next time these units are assigned.
      for (const r of rows) this.seen.delete(`${r.experiment_id}:${r.unit_id}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.flushExposures();
  }
}
