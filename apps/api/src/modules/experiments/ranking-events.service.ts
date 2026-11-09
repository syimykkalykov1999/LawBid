import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import type Redis from 'ioredis';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { inImpressionSample } from './experiment-math';
import { type Assignment, ExperimentsService } from './experiments.service';

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

/** `ranking.events_mode`: «Выкл» / «Вкл» / «Авто (по сигналу)». */
export type RankingEventsMode = 'off' | 'on' | 'auto';

/** Rows wait in memory at most this long / this many before one batch insert. */
const FLUSH_MS = 2000;
const FLUSH_ROWS = 200;
/** Beyond this the oldest waiting rows are dropped: the log never hurts the app. */
const MAX_BUFFER = 5000;
const SETTINGS_TTL_MS = 15_000;
/** Where a person saw each item last (for the click's place): this long. */
const POSITIONS_TTL_SEC = 30 * 60;
const MAX_LIST = 100;

/** One ranked page as it was served. */
export interface ServedList {
  userId: string | null | undefined;
  surface: string;
  /** In the order shown. */
  itemIds: readonly string[];
  /** How many items came before this page (0 = first page). */
  offset?: number;
  assignment?: Assignment | null;
  formulaVersion?: string | null;
  /** The 0..1 features the formula saw per item (offline replay). */
  features?: ReadonlyMap<string, Record<string, number>> | null;
}

interface Seen {
  s: string;
  l: string;
  p: number;
  f: string | null;
  e: string | null;
  v: string | null;
}

export const positionsKey = (userId: string): string => `rk:pos:${userId}`;

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
  private cfg: {
    at: number;
    mode: RankingEventsMode;
    running: boolean;
    sample: number;
  } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    @Optional() private readonly experiments?: ExperimentsService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  /** Re-reads the mode next time (after an admin start / stop on this pod). */
  invalidate(): void {
    this.cfg = null;
  }

  /** Whether impressions / clicks of this person are kept right now. */
  async keepsImpressionsOf(
    userId: string | null | undefined,
  ): Promise<boolean> {
    try {
      const cfg = await this.config();
      if (cfg.mode === 'off') return false;
      if (cfg.mode === 'auto' && !cfg.running) return false;
      return !userId || inImpressionSample(userId, cfg.sample);
    } catch {
      return false;
    }
  }

  /**
   * A ranked page was served: one impression per item at its 1-based place,
   * tied by one list id, tagged with the viewer's variant. The places are
   * remembered (Redis, 30 min) so the person's next open of an item counts
   * as a click on that place. Never throws, never waits for the database.
   */
  async logList(list: ServedList): Promise<void> {
    try {
      const userId = list.userId ?? null;
      if (!userId || list.itemIds.length === 0) return;
      if (!(await this.keepsImpressionsOf(userId))) return;
      const listId = randomBytes(9).toString('base64url');
      const offset = Math.max(0, list.offset ?? 0);
      const a = list.assignment ?? null;
      const seen: string[] = [];
      for (const [i, itemId] of list.itemIds.slice(0, MAX_LIST).entries()) {
        const position = offset + i + 1;
        await this.add('impression', {
          userId,
          surface: list.surface,
          itemId,
          listId,
          position,
          formulaVersion: list.formulaVersion ?? null,
          experimentKey: a?.experimentKey ?? null,
          variant: a?.variant ?? null,
          features: list.features?.get(itemId) ?? null,
        });
        const v: Seen = {
          s: list.surface,
          l: listId,
          p: position,
          f: list.formulaVersion ?? null,
          e: a?.experimentKey ?? null,
          v: a?.variant ?? null,
        };
        seen.push(itemId, JSON.stringify(v));
      }
      if (this.redis && seen.length > 0) {
        const key = positionsKey(userId);
        await this.redis
          .multi()
          .hset(key, ...seen)
          .expire(key, POSITIONS_TTL_SEC)
          .exec();
      }
    } catch (err) {
      this.log.warn(`ranking list skipped: ${String(err)}`);
    }
  }

  /**
   * The person opened [itemIds] (a case, a post, a profile, a search
   * result). Only an item they were served in a ranked list counts, as a
   * click on that list's place; once per served place.
   */
  async logClicks(
    userId: string | null | undefined,
    itemIds: readonly string[],
  ): Promise<void> {
    try {
      if (!userId || !this.redis || itemIds.length === 0) return;
      if (!(await this.keepsImpressionsOf(userId))) return;
      const ids = [...new Set(itemIds)].slice(0, MAX_LIST);
      const key = positionsKey(userId);
      const raw = await this.redis.hmget(key, ...ids);
      const hit: string[] = [];
      for (const [i, r] of raw.entries()) {
        if (!r) continue;
        const v = JSON.parse(r) as Seen;
        hit.push(ids[i]);
        await this.add('click', {
          userId,
          surface: v.s,
          itemId: ids[i],
          listId: v.l,
          position: v.p,
          formulaVersion: v.f,
          experimentKey: v.e,
          variant: v.v,
        });
      }
      if (hit.length > 0) await this.redis.hdel(key, ...hit);
    } catch (err) {
      this.log.warn(`ranking click skipped: ${String(err)}`);
    }
  }

  /**
   * An outcome (bid, accept, report, search, case_posted...): one row per
   * running experiment the unit is in (the unit's variant, no new
   * exposure), or one untagged row when it is in none.
   */
  async logUserAction(
    kind: Exclude<RankingEventKind, 'impression' | 'click'>,
    e: Omit<RankingEventInput, 'experimentKey' | 'variant'> & {
      /** Whose variant tags the row; default the user (a case id for case tests). */
      unitId?: string | null;
    },
  ): Promise<void> {
    try {
      const unit = e.unitId ?? e.userId;
      const tags =
        unit && this.experiments
          ? await this.experiments.assignAll(unit, { expose: false })
          : [];
      if (tags.length === 0) {
        await this.add(kind, e);
        return;
      }
      for (const t of tags) {
        await this.add(kind, {
          ...e,
          experimentKey: t.experimentKey,
          variant: t.variant,
        });
      }
    } catch (err) {
      this.log.warn(`ranking action skipped: ${String(err)}`);
    }
  }

  async logImpression(e: RankingEventInput): Promise<void> {
    await this.add('impression', e);
  }

  async logAction(kind: RankingEventKind, e: RankingEventInput): Promise<void> {
    await this.add(kind, e);
  }

  private async config(): Promise<{
    mode: RankingEventsMode;
    running: boolean;
    sample: number;
  }> {
    const now = Date.now();
    if (this.cfg && now - this.cfg.at < SETTINGS_TTL_MS) return this.cfg;
    try {
      const [rawMode, sample] = await Promise.all([
        this.settings.string('ranking.events_mode'),
        this.settings.number('ranking.impression_sample_percent'),
      ]);
      const mode: RankingEventsMode =
        rawMode === 'on' || rawMode === 'off' ? rawMode : 'auto';
      // «Авто»: the signal is "at least one experiment is running".
      const running =
        mode === 'auto'
          ? (await this.prisma.experiment.count({
              where: { status: 'running' },
            })) > 0
          : false;
      this.cfg = { at: now, mode, running, sample };
    } catch {
      this.cfg = this.cfg ?? {
        at: now,
        mode: 'auto',
        running: false,
        sample: 10,
      };
    }
    return this.cfg;
  }

  private async add(
    kind: RankingEventKind,
    e: RankingEventInput,
  ): Promise<void> {
    try {
      const cfg = await this.config();
      if (cfg.mode === 'off') return;
      if (SAMPLED_KINDS.has(kind)) {
        // «Авто» without a running experiment: the high-volume kinds wait.
        if (cfg.mode === 'auto' && !cfg.running) return;
        if (e.userId && !inImpressionSample(e.userId, cfg.sample)) return;
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
      this.log.warn(
        `ranking events batch lost (${rows.length}): ${String(err)}`,
      );
      return 0;
    } finally {
      this.flushing = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.flush();
  }
}
