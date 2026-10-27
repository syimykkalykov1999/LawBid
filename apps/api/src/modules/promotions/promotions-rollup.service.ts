import { Injectable, Optional } from '@nestjs/common';
import { AdminSummaryService } from '../../common/admin-summary/admin-summary.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  billingOf,
  BILLING_MODELS,
  type BillingModel,
} from './promotions.settings';

export const PROMOTIONS_BY_MODEL_KEY = 'promotions.by_model';
const DAY_MS = 86_400_000;
/** Recounted at most this often (the cron runs every two minutes). */
const REFRESH_EVERY_MS = 6 * 3_600_000;

export interface ModelRollup {
  billing: BillingModel;
  count: number;
  soldCents: number;
  refundedCents: number;
  delivered: number;
}

/**
 * Owner 2026-10-27: the money numbers by way to pay (views, people, taps,
 * real actions), last 30 days. Counted ONCE in the background by the
 * `admin.summaries` cron and stored in Redis; the admin screen only reads
 * the stored value, so opening it never runs a query on the promotions table.
 */
@Injectable()
export class PromotionsRollupService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly summary?: AdminSummaryService,
  ) {}

  /** What is stored now (never computes). */
  async read(): Promise<{ rows: ModelRollup[]; at: string | null }> {
    const hit = await this.summary?.peek<ModelRollup[]>(
      PROMOTIONS_BY_MODEL_KEY,
    );
    return { rows: hit?.data ?? [], at: hit?.computedAt ?? null };
  }

  /** Cron step: recount when nothing is stored or it is older than 6 hours. */
  async refreshIfStale(): Promise<void> {
    if (!this.summary) return;
    const hit = await this.summary.peek(PROMOTIONS_BY_MODEL_KEY);
    if (hit && Date.now() - Date.parse(hit.computedAt) < REFRESH_EVERY_MS) {
      return;
    }
    await this.summary.refresh(PROMOTIONS_BY_MODEL_KEY, () => this.compute());
  }

  async compute(now = new Date()): Promise<ModelRollup[]> {
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const groups = await this.prisma.casePromotion.groupBy({
      by: ['billing'],
      where: {
        created_at: { gte: since },
        status: { in: ['active', 'finished', 'refunded'] },
      },
      _count: { _all: true },
      _sum: {
        total_cents: true,
        refunded_cents: true,
        impressions: true,
        reach: true,
        clicks: true,
        actions: true,
      },
    });
    const byModel = new Map<BillingModel, ModelRollup>(
      BILLING_MODELS.map((m) => [
        m,
        { billing: m, count: 0, soldCents: 0, refundedCents: 0, delivered: 0 },
      ]),
    );
    for (const g of groups) {
      const m = billingOf(g.billing);
      const row = byModel.get(m)!;
      row.count += g._count._all;
      row.soldCents += g._sum.total_cents ?? 0;
      row.refundedCents += g._sum.refunded_cents ?? 0;
      row.delivered += g._sum[m] ?? 0;
    }
    return [...byModel.values()];
  }
}
