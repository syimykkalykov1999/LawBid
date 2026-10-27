import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { DeletionStepsService } from '../../modules/privacy/deletion-steps.service';
import { ErasureLedgerService } from '../../modules/privacy/erasure-ledger.service';
import { OpenSearchClient } from '../../modules/search/engine/opensearch.client';
import { SearchIndexerService } from '../../modules/search/search-indexer.service';
import { withJobLock } from './job-lock';

/** How far back "anonymized but maybe still indexed" is checked. */
const LOOKBACK_DAYS = 30;
const PAGE = 500;

export interface PrivacyReconcileResult {
  ledger: { synced: number; failed: number; pending: number };
  search: {
    checked: number;
    removed: number;
    failed: number;
    skipped: number;
  };
  failedSteps: number;
}

/**
 * Owner 2026-10-25 (privacy round 13, S13-1/S13-10/S13-11): the nightly
 * `privacy.reconcile`, the "verify with a periodic reconciliation" half of
 * a deletion:
 * 1. every erasure-ledger row gets its object in the private bucket;
 * 2. every person anonymized in the last 30 days is removed from the search
 *    engine again (a delete is idempotent) and the `search` step of their
 *    `deletion_steps` records the result — an event parked by the indexer
 *    after its retries can never leave a person visible; engine off =
 *    `skipped` (Postgres search reads live rows, which are anonymized);
 * 3. failed vendor steps are counted and logged as `alert:
 *    deletion_step_failed` so the retry list is visible.
 */
@Injectable()
export class PrivacyReconcileJob {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly ledger: ErasureLedgerService,
    private readonly steps: DeletionStepsService,
    private readonly client: OpenSearchClient,
    private readonly indexer: SearchIndexerService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PrivacyReconcileJob.name);
  }

  run(now: Date = new Date()): Promise<PrivacyReconcileResult | null> {
    return withJobLock(this.redis, 'privacy.reconcile', 20 * 60_000, () =>
      this.execute(now),
    );
  }

  async execute(now: Date): Promise<PrivacyReconcileResult> {
    const ledger = await this.ledger.syncPending();
    const search = await this.reconcileSearch(now);
    const failedSteps = (await this.steps.failed(1000)).length;
    if (failedSteps > 0 || ledger.failed > 0 || search.failed > 0) {
      this.logger.warn(
        { alert: 'deletion_step_failed', failedSteps, ledger, search },
        'privacy reconcile found work that did not finish',
      );
    }
    return { ledger, search, failedSteps };
  }

  private async reconcileSearch(
    now: Date,
  ): Promise<PrivacyReconcileResult['search']> {
    const out = { checked: 0, removed: 0, failed: 0, skipped: 0 };
    const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
    const recent = await this.prisma.user.findMany({
      where: { anonymized_at: { gt: since } },
      select: { id: true },
      orderBy: { anonymized_at: 'desc' },
      take: 5000,
    });
    if (recent.length === 0) return out;
    const done = new Set<string>();
    for (let i = 0; i < recent.length; i += PAGE) {
      const rows = await this.prisma.deletionStep.findMany({
        where: {
          step: 'search',
          status: { in: ['ok', 'skipped'] },
          user_id: { in: recent.slice(i, i + PAGE).map((u) => u.id) },
        },
        select: { user_id: true },
      });
      for (const r of rows) done.add(r.user_id);
    }
    const todo = recent.map((u) => u.id).filter((id) => !done.has(id));
    if (todo.length === 0) return out;
    const engineOn = await this.indexer.engineOn();
    if (!engineOn || !(await this.client.isConfigured())) {
      for (const id of todo) {
        await this.steps.record(
          id,
          'search',
          'skipped',
          'search engine off: Postgres search reads the anonymized rows',
        );
        out.skipped += 1;
      }
      return out;
    }
    for (let i = 0; i < todo.length; i += PAGE) {
      const ids = todo.slice(i, i + PAGE);
      out.checked += ids.length;
      try {
        const res = await this.client.bulk(
          ids.map((id) => ({ entity: 'person' as const, id, doc: null })),
        );
        const bad = new Map(res.failed.map((f) => [f.id, f.reason]));
        for (const id of ids) {
          const reason = bad.get(id);
          if (reason) {
            out.failed += 1;
            await this.steps.record(id, 'search', 'failed', reason);
          } else {
            out.removed += 1;
            await this.steps.record(id, 'search', 'ok', 'removed from index');
          }
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'bulk failed';
        out.failed += ids.length;
        for (const id of ids) {
          await this.steps.record(id, 'search', 'failed', reason);
        }
      }
    }
    return out;
  }
}
