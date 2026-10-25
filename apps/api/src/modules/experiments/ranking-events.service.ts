import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { inImpressionSample } from './experiment-math';

/** What can be recorded. Impressions and clicks are sampled by user. */
export const RANKING_EVENT_KINDS = [
  'impression',
  'click',
  'bid',
  'accept',
  'reply',
  'report',
  'error',
  'search',
  'case_posted',
] as const;
export type RankingEventKind = (typeof RANKING_EVENT_KINDS)[number];

const SAMPLED_KINDS: ReadonlySet<RankingEventKind> = new Set([
  'impression',
  'click',
]);

export interface RankingEventInput {
  userId: string | null;
  surface: string;
  itemId?: string | null;
  /** One rendered list: ties its impressions together for the replay. */
  listId?: string | null;
  /** 1-based place in the list. */
  position?: number | null;
  formulaVersion?: string | null;
  experimentKey?: string | null;
  variant?: string | null;
  /** search: number of results. */
  value?: number | null;
  /** impression: the 0..1 features the formula saw (offline replay). */
  features?: Record<string, number> | null;
}

/** Rows wait in memory at most this long / this many before one batch insert. */
const FLUSH_MS = 2000;
const FLUSH_ROWS = 200;
/** Beyond this the oldest waiting rows are dropped: the log never hurts the app. */
const MAX_BUFFER = 5000;
const SETTINGS_TTL_MS = 15_000;

/**
 * The ranking events log (owner 2026-10-25). `logImpression` / `logAction`
 * never throw and never wait for the database: rows are buffered and written
 * in one batch insert. Impressions and clicks are kept for a stable share of
 * users (setting `ranking.impression_sample_percent`) so the volume stays
 * cheap and click-through rates stay unbiased; bids, accepts, replies,
 * reports, errors, searches and posted cases are always kept.
 */
@Injectable()
export class RankingEventsService implements OnModuleDestroy {
  private readonly log = new Logger(RankingEventsService.name);
  private buf: Prisma.RankingEventCreateManyInput[] = [];
  private timer: NodeJS.Timeout | null = null;
  private flushing = false;
  private dropped = 0;
  private cfg: { at: number; enabled: boolean; sample: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
  ) {}

  async logImpression(e: RankingEventInput): Promise<void> {
    await this.add('impression', e);
  }

  async logAction(kind: RankingEventKind, e: RankingEventInput): Promise<void> {
    await this.add(kind, e);
  }

  private async config(): Promise<{ enabled: boolean; sample: number }> {
    const now = Date.now();
    if (this.cfg && now - this.cfg.at < SETTINGS_TTL_MS) return this.cfg;
    try {
      const [enabled, sample] = await Promise.all([
        this.settings.boolean('ranking.events_enabled'),
        this.settings.number('ranking.impression_sample_percent'),
      ]);
      this.cfg = { at: now, enabled, sample };
    } catch {
      this.cfg = this.cfg ?? { at: now, enabled: true, sample: 10 };
    }
    return this.cfg;
  }

  private async add(
    kind: RankingEventKind,
    e: RankingEventInput,
  ): Promise<void> {
    try {
      const cfg = await this.config();
      if (!cfg.enabled) return;
      if (
        SAMPLED_KINDS.has(kind) &&
        e.userId &&
        !inImpressionSample(e.userId, cfg.sample)
      ) {
        return;
      }
      if (this.buf.length >= MAX_BUFFER) {
        this.buf.shift();
        this.dropped++;
      }
      this.buf.push({
        kind,
        user_id: e.userId ?? null,
        surface: e.surface.slice(0, 40),
        item_id: e.itemId?.slice(0, 64) ?? null,
        list_id: e.listId?.slice(0, 32) ?? null,
        position: e.position ?? null,
        formula_version: e.formulaVersion?.slice(0, 32) ?? null,
        experiment_key: e.experimentKey?.slice(0, 64) ?? null,
        variant: e.variant?.slice(0, 32) ?? null,
        value: e.value ?? null,
        features: e.features ?? undefined,
      });
      if (this.buf.length >= FLUSH_ROWS) void this.flush();
      else if (!this.timer) {
        this.timer = setTimeout(() => void this.flush(), FLUSH_MS);
        this.timer.unref?.();
      }
    } catch (err) {
      this.log.warn(`ranking event skipped: ${String(err)}`);
    }
  }

  /** Writes what is waiting. Safe to call at any time. */
  async flush(): Promise<number> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.flushing || this.buf.length === 0) return 0;
    this.flushing = true;
    const rows = this.buf;
    this.buf = [];
    try {
      const r = await this.prisma.rankingEvent.createMany({ data: rows });
      if (this.dropped > 0) {
        this.log.warn(`ranking events dropped under load: ${this.dropped}`);
        this.dropped = 0;
      }
      return r.count;
    } catch (err) {
      this.log.warn(`ranking events batch lost (${rows.length}): ${String(err)}`);
      return 0;
    } finally {
      this.flushing = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.flush();
  }
}
