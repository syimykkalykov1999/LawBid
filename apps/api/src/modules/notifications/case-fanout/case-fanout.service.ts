import { bullOptions } from '../../../redis/redis-connection';
import {
  Inject,
  Injectable,
  Optional,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NotificationType } from '@prisma/client';
import { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { demoContext } from '../../../common/demo/demo-context';
import { PrismaService } from '../../../prisma/prisma.service';
import { shardCarry, shardKeyOf } from '../../../sharding/shard-context';
import { readsAreSplit } from '../../../sharding/split-reads';
import { NotificationsService } from '../notifications.service';
import { CaseAudienceService } from './case-audience.service';
import {
  rankCandidates,
  selectWave,
  type FanoutStats,
} from './case-fanout.scoring';
import {
  loadFanoutSettings,
  type FanoutSettings,
  type FraudAction,
} from './case-fanout.settings';

export const CASE_FANOUT_QUEUE = 'case-fanout';
export const CASE_FANOUT_JOB = 'case.fanout.wave';
export const CASE_FANOUT_IMPRESSIONS = Symbol('CASE_FANOUT_IMPRESSIONS');
/** At most this many people are ever alerted about one case. */
export const CASE_ALERT_REACH_MAX = 5000;
const EMIT_BATCH = 500;
/** Look-back for "alerts received" and offers (days). */
const LOOKBACK_DAYS = 30;
const BID_LOOKBACK_DAYS = 180;
const DAY_MS = 86_400_000;

const JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 1000 },
} as const;

export interface CaseFanoutJob {
  caseId: string;
  /** 1-based wave number. */
  wave: number;
  /** The time-to-first-bid metric was already logged for this case. */
  firstBidLogged?: boolean;
  demo?: boolean;
  /** Shard context of the enqueuer, `case:<uuid>` (forCase). */
  shardKey?: string;
  /** Algo audit 2026-10-27 (C-1/M-2): `cases.alert_generation` when the
   * job was queued; part of the job id so a re-alert is never swallowed
   * by a stored job of the first round. */
  generation?: number;
  /** Algo audit 2026-10-27: an extra one-off round of the same generation
   * (same dedupe key, so nobody hears twice):
   *  - `urgent_top_up` (CASES C-1): the case became urgent — the attorneys
   *    with «Только срочные» (left out before) are told now;
   *  - `rebroadcast` (CASES M-3): no offers after N hours — whoever in the
   *    audience was not alerted yet (newly verified, over the cap, beyond
   *    the waves) is told. */
  mode?: 'urgent_top_up' | 'rebroadcast';
  /** Part of the job id of an extra round (e.g. `24h`). */
  tag?: string;
}

/**
 * Hook for the experiments module (branch claude/experiments, ALG-A). When
 * it is merged, provide an implementation under CASE_FANOUT_IMPRESSIONS
 * that records "attorney X was shown case Y in wave N" (an impression);
 * until then nothing is bound and this is a no-op.
 */
export interface CaseFanoutImpressionSink {
  log(event: {
    caseId: string;
    wave: number;
    attorneyIds: string[];
    scores: Record<string, number>;
  }): Promise<void> | void;
}

export type WaveOutcome =
  | { done: 'closed' | 'disabled' | 'enough_bids' | 'all_reached' | 'fraud' }
  | {
      done: false | 'last';
      sent: number;
      digested: number;
      newReached: number;
      remaining: number;
    };

/**
 * Owner 2026-10-25: new-case alerts in waves (docs/CASE_FANOUT.md).
 *
 * `start()` is the entry point (called after a case is published); every
 * wave is a BullMQ job (`case-fanout`) that ranks the not-yet-alerted
 * audience, sends the next slice (some places reserved for newcomers),
 * and queues the following wave after X minutes — until the case has K
 * offers, everyone was reached, or the wave limit is hit. Idempotent: a
 * wave job id is per case and wave; a row per person carries the case's
 * dedupe key, so a retried wave sends nothing twice. Without Redis
 * (tests, dev) the first wave runs inline.
 */
@Injectable()
export class CaseFanoutService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private queue?: Queue<CaseFanoutJob>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audience: CaseAudienceService,
    private readonly logger: PinoLogger,
    @Optional() private readonly settings?: AppSettingsService,
    @Optional()
    @Inject(CASE_FANOUT_IMPRESSIONS)
    private readonly impressions?: CaseFanoutImpressionSink,
  ) {
    this.logger.setContext(CaseFanoutService.name);
  }

  onApplicationBootstrap(): void {
    const url = this.config.get<string>('REDIS_URL');
    if (url) {
      this.queue = new Queue(
        CASE_FANOUT_QUEUE,
        bullOptions(CASE_FANOUT_QUEUE, url),
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue?.close();
  }

  /** The dedupe key of a case's alert rows. Generation 0 (the first
   * round) keeps the old key, so rows written before the column existed
   * still count as "already alerted"; a re-alert (C-1: practice / states
   * changed, back from a pause) gets its own key. */
  static key(caseId: string, generation = 0): string {
    return generation > 0
      ? `case_fanout:${caseId}:g${generation}`
      : `case_fanout:${caseId}`;
  }

  static jobId(caseId: string, wave: number, generation = 0): string {
    return generation > 0
      ? `casefanout-${caseId}-g${generation}-w${wave}`
      : `casefanout-${caseId}-w${wave}`;
  }

  /**
   * An extra one-off round (see CaseFanoutJob.mode). Queued with retries
   * when Redis is there (job id per case, generation, mode and tag), else
   * run here. Returns the alerts sent right here (0 when queued).
   */
  async startExtra(
    caseId: string,
    mode: 'urgent_top_up' | 'rebroadcast',
    tag = '',
  ): Promise<number> {
    const s = await loadFanoutSettings(this.settings);
    const kase = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { alert_generation: true },
    });
    if (!kase) return 0;
    const job: CaseFanoutJob = {
      caseId,
      wave: 1,
      generation: kase.alert_generation,
      mode,
      ...(tag ? { tag } : {}),
    };
    if (!this.queue || (!s.enabled && s.queueMode === 'off')) {
      const out = await this.runWave(job);
      return 'sent' in out ? out.sent : 0;
    }
    await this.enqueue(job, 0);
    return 0;
  }

  /** Queues wave 1 (delayed for a suspicious client). Returns the number
   * of alerts sent right here (no Redis, or queue_mode off while the waves
   * are off), 0 when queued. */
  async start(caseId: string): Promise<number> {
    const s = await loadFanoutSettings(this.settings);
    let delayMs = 0;
    if (s.enabled) {
      const g = await this.gate(caseId, s);
      if (g === 'none') return 0;
      if (g === 'small') delayMs = s.fraudDelayMinutes * 60_000;
    }
    const kase = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { alert_generation: true },
    });
    if (!kase) return 0;
    const job: CaseFanoutJob = {
      caseId,
      wave: 1,
      generation: kase.alert_generation,
    };
    // Algo audit 2026-10-27 (H-1): with Redis, the work always goes
    // through the queue (3 attempts, backoff) — also while the waves switch
    // is off: then it is one legacy wave to everyone, run by the worker
    // instead of inside the API request, where a restart or a short DB
    // outage lost the alerts for good. Inline only without Redis (tests,
    // dev) or when the owner set `case_fanout.queue_mode` = off.
    if (!this.queue || (!s.enabled && s.queueMode === 'off')) {
      const out = await this.runWave(job);
      return 'sent' in out ? out.sent : 0;
    }
    await this.enqueue(job, delayMs);
    return 0;
  }

  private async enqueue(job: CaseFanoutJob, delayMs: number): Promise<void> {
    await this.queue?.add(
      CASE_FANOUT_JOB,
      {
        ...job,
        ...(demoContext.isDemo() ? { demo: true } : {}),
        // shard-aware: the job runs in the case's shard context.
        shardKey: shardCarry().shardKey ?? shardKeyOf.case(job.caseId),
      },
      {
        ...JOB_OPTS,
        jobId:
          CaseFanoutService.jobId(job.caseId, job.wave, job.generation ?? 0) +
          (job.mode === 'urgent_top_up'
            ? '-urgent'
            : job.mode === 'rebroadcast'
              ? `-rb${job.tag ?? ''}`
              : ''),
        delay: delayMs,
      },
    );
  }

  /** The client's fraud status → what to do with this case's alerts. */
  private async gate(caseId: string, s: FanoutSettings): Promise<FraudAction> {
    const kase = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { client_id: true },
    });
    if (!kase) return 'none';
    const fraud = await this.prisma.clientFraudProfile.findUnique({
      where: { user_id: kase.client_id },
      select: { status: true },
    });
    if (fraud?.status === 'review') return s.fraudReviewAction;
    if (fraud?.status === 'restricted' || fraud?.status === 'banned') {
      return fraud.status === 'banned' ? 'none' : s.fraudRestrictedAction;
    }
    return 'normal';
  }

  /** Alerts and offers of [ids]: what the scoring and the cap need. */
  async loadStats(ids: string[]): Promise<Map<string, FanoutStats>> {
    const out = new Map<string, FanoutStats>();
    const get = (id: string): FanoutStats => {
      let v = out.get(id);
      if (!v) {
        v = {
          alerts24h: 0,
          alertsTotal: 0,
          bids: 0,
          accepted: 0,
          avgBidHours: null,
        };
        out.set(id, v);
      }
      return v;
    };
    const now = Date.now();
    const types: NotificationType[] = ['new_case', 'new_urgent_case'];
    for (let i = 0; i < ids.length; i += 5000) {
      const part = ids.slice(i, i + 5000);
      const [total, day] = await Promise.all([
        this.prisma.notification.groupBy({
          by: ['user_id'],
          where: {
            user_id: { in: part },
            type: { in: types },
            created_at: { gte: new Date(now - LOOKBACK_DAYS * DAY_MS) },
          },
          _count: { _all: true },
        }),
        this.prisma.notification.groupBy({
          by: ['user_id'],
          where: {
            user_id: { in: part },
            type: { in: types },
            created_at: { gte: new Date(now - DAY_MS) },
          },
          _count: { _all: true },
        }),
      ]);
      for (const r of total) get(r.user_id).alertsTotal = r._count._all;
      for (const r of day) get(r.user_id).alerts24h = r._count._all;
      await this.loadBidStats(part, get, now);
    }
    return out;
  }

  private async loadBidStats(
    ids: string[],
    get: (id: string) => FanoutStats,
    now: number,
  ): Promise<void> {
    const since = new Date(now - BID_LOOKBACK_DAYS * DAY_MS);
    if (readsAreSplit(this.prisma)) {
      // Cases and bids live in other databases: counts only, no speed.
      const [all, won] = await Promise.all([
        this.prisma.bid.groupBy({
          by: ['attorney_id'],
          where: { attorney_id: { in: ids }, created_at: { gte: since } },
          _count: { _all: true },
        }),
        this.prisma.bid.groupBy({
          by: ['attorney_id'],
          where: {
            attorney_id: { in: ids },
            created_at: { gte: since },
            status: 'accepted',
          },
          _count: { _all: true },
        }),
      ]);
      for (const r of all) get(r.attorney_id).bids = r._count._all;
      for (const r of won) get(r.attorney_id).accepted = r._count._all;
      return;
    }
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        bids: number;
        accepted: number;
        avg_hours: number | null;
      }[]
    >`
      SELECT b.attorney_id::TEXT AS id,
             count(*)::INT AS bids,
             (count(*) FILTER (WHERE b.status = 'accepted'))::INT AS accepted,
             (avg(extract(epoch FROM (b.created_at - c.created_at)) / 3600))::FLOAT8
               AS avg_hours
      FROM bids b
      JOIN cases c ON c.id = b.case_id
      WHERE b.attorney_id = ANY(${ids}::UUID[])
        AND b.created_at >= ${since}
      GROUP BY b.attorney_id`;
    for (const r of rows) {
      const s = get(r.id);
      s.bids = r.bids;
      s.accepted = r.accepted;
      s.avgBidHours = r.avg_hours === null ? null : Number(r.avg_hours);
    }
  }

  /** One wave. Safe to run twice: people already alerted are skipped. */
  async runWave(job: CaseFanoutJob): Promise<WaveOutcome> {
    const { caseId, wave } = job;
    const s = await loadFanoutSettings(this.settings);
    const kase = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: {
        status: true,
        deleted_at: true,
        paused_at: true,
        bids_count: true,
        created_at: true,
        alert_generation: true,
      },
    });
    if (!kase || kase.status !== 'open' || kase.deleted_at || kase.paused_at) {
      return { done: 'closed' };
    }
    // A wave queued for an earlier generation (the client changed the
    // practice again before it ran) is superseded by the newer round.
    if (
      job.generation !== undefined &&
      job.generation < kase.alert_generation
    ) {
      return { done: 'closed' };
    }
    // enabled=false: the old behaviour — one wave to everyone.
    const legacy = !s.enabled;
    // Algo audit 2026-10-27 (CASES M-4): the fraud gate holds with the
    // waves off too (a banned client's case reaches nobody); `small` has no
    // meaning without waves and counts as normal there.
    const gated =
      !legacy || s.legacyFraudGate ? await this.gate(caseId, s) : 'normal';
    const g: FraudAction = legacy && gated === 'small' ? 'normal' : gated;
    if (g === 'none') return { done: 'fraud' };
    const small = g === 'small';
    // An extra round never re-logs the time-to-first-offer metric.
    const bidsFirst = job.mode
      ? true
      : await this.firstBidMetric(job, kase.bids_count);
    if (!legacy && s.stopAtBids > 0 && kase.bids_count >= s.stopAtBids) {
      this.logger.info(
        { metric: 'case_fanout_stop', caseId, wave, bids: kase.bids_count },
        'case fan-out stopped: enough offers',
      );
      return { done: 'enough_bids' };
    }

    const aud = await this.audience.forCase(caseId);
    if (!aud.found) return { done: 'closed' };
    const key = CaseFanoutService.key(caseId, kase.alert_generation);
    const ids = aud.candidates.map((c) => c.id);
    const reached = new Set<string>();
    for (let i = 0; i < ids.length; i += 5000) {
      const rows = await this.prisma.notification.findMany({
        where: { dedupe_key: key, user_id: { in: ids.slice(i, i + 5000) } },
        select: { user_id: true },
      });
      for (const r of rows) reached.add(r.user_id);
    }
    // CASES C-1: the urgent top-up is for «Только срочные» people only (the
    // rest already had this case), and only while the case is urgent.
    if (job.mode === 'urgent_top_up' && !aud.urgent) return { done: 'closed' };
    const pool = aud.candidates.filter(
      (c) =>
        !reached.has(c.id) && (job.mode !== 'urgent_top_up' || c.urgentOnly),
    );
    const budget = CASE_ALERT_REACH_MAX - reached.size;
    if (pool.length === 0 || budget <= 0) return { done: 'all_reached' };

    // Switch off = everybody in one wave: no ranking, so no stats queries
    // (two group-bys and a bids join per 5 000 people, review R-32).
    const stats: Map<string, FanoutStats> = legacy
      ? new Map<string, FanoutStats>()
      : await this.loadStats(pool.map((c) => c.id));
    const cap = legacy ? 0 : s.dailyCap;
    const capped =
      cap > 0
        ? pool.filter((c) => (stats.get(c.id)?.alerts24h ?? 0) >= cap)
        : [];
    const cappedIds = new Set(capped.map((c) => c.id));
    const eligible = pool.filter((c) => !cappedIds.has(c.id));

    // Algo audit 2026-10-27 (H-2): an urgent case does not wait for the
    // 10-minute slices — the whole audience in this wave.
    const urgentFast = aud.urgent && s.urgentFast && !small;
    // An extra round (urgent top-up, re-broadcast) is one wave to all left.
    const extra = job.mode !== undefined;
    const size = Math.min(
      budget,
      legacy || urgentFast || extra || (!this.queue && !small)
        ? // No queue (no Redis) cannot run later waves: everyone now.
          CASE_ALERT_REACH_MAX
        : small
          ? s.fraudSmallWaveSize
          : wave === 1
            ? s.firstWaveSize
            : s.waveSize,
    );
    const chosen = legacy
      ? eligible.slice(0, size).map((c) => ({
          id: c.id,
          score: 0,
          isNew: false,
          exposure: 0,
        }))
      : selectWave(
          rankCandidates(caseId, eligible, stats, {
            maxAlerts: s.newMaxAlerts,
            maxBids: s.newMaxBids,
          }),
          size,
          s.newQuotaPercent,
        );
    const type: NotificationType = aud.urgent ? 'new_urgent_case' : 'new_case';
    let sent = 0;
    for (let i = 0; i < chosen.length; i += EMIT_BATCH) {
      sent += await this.notifications.emitMany({
        type,
        recipientIds: chosen.slice(i, i + EMIT_BATCH).map((c) => c.id),
        payload: { caseId },
        dedupeKey: key,
      });
    }
    // Over the daily cap: ONE rolled-up row per person and day, on the
    // first wave only (later waves skip them silently).
    let digested = 0;
    if (wave === 1 && !extra && capped.length > 0) {
      const day = new Date().toISOString().slice(0, 10);
      await this.notifications.emitDigest({
        type,
        recipientIds: capped.map((c) => c.id),
        caseId,
        dedupeKey: `case_fanout_digest:${day}`,
      });
      digested = capped.length;
    }
    await this.impressions?.log({
      caseId,
      wave,
      attorneyIds: chosen.map((c) => c.id),
      scores: Object.fromEntries(chosen.map((c) => [c.id, c.score])),
    });

    const newReached = chosen.filter((c) => c.isNew).length;
    const remaining = eligible.length - chosen.length;
    this.logger.info(
      {
        metric: 'case_fanout_wave',
        caseId,
        wave,
        ...(extra ? { mode: job.mode } : {}),
        audience: aud.candidates.length,
        sent,
        digested,
        newReached,
        newShare: chosen.length ? newReached / chosen.length : 0,
        remaining,
        bidsAtWave: kase.bids_count,
      },
      'case fan-out wave',
    );

    const more =
      !legacy && !small && !extra && remaining > 0 && wave < s.maxWaves;
    if (more && this.queue) {
      await this.enqueue(
        {
          caseId,
          wave: wave + 1,
          firstBidLogged: bidsFirst,
          generation: kase.alert_generation,
        },
        s.waveIntervalMinutes * 60_000,
      );
    }
    return {
      done: more ? false : 'last',
      sent,
      digested,
      newReached,
      remaining,
    };
  }

  /** Logs the time from publishing to the first offer once; returns
   * whether it has been logged (for the next wave's job data). */
  private async firstBidMetric(
    job: CaseFanoutJob,
    bidsCount: number,
  ): Promise<boolean> {
    if (job.firstBidLogged) return true;
    if (bidsCount <= 0) return false;
    const first = await this.prisma.bid.findFirst({
      where: { case_id: job.caseId },
      orderBy: { created_at: 'asc' },
      select: { created_at: true, case: { select: { created_at: true } } },
    });
    if (!first) return false;
    this.logger.info(
      {
        metric: 'case_first_bid',
        caseId: job.caseId,
        seconds: Math.round(
          (first.created_at.getTime() - first.case.created_at.getTime()) / 1000,
        ),
        wave: job.wave,
      },
      'time to first offer',
    );
    return true;
  }
}
