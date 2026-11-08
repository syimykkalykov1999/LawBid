import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { Queue } from 'bullmq';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CACHE_CLIENT } from '../../redis/redis.constants';
import { shardContext } from '../../sharding/shard-context';
import { forEachDatabase } from '../../sharding/for-each-database';
import { FeatureFlagsService } from '../feature-flags/feature-flags.public';
import { bullOptions } from '../../redis/redis-connection';
import { CRON_JOBS, cronLaneOf } from '../../jobs/jobs.constants';
import {
  openItemScore,
  QA_GRAVITY,
  QA_WEIGHTS,
  QA_WINDOW_DAYS,
  qaFeatures,
  type QaAnswerFact,
  type QaAttorneyEntry,
  type QaFeatures,
  qaScore,
} from './qa-ranking';

/** Feature flag: off = the snapshot is not read (today's ranking). */
export const QA_RANKING_FLAG = 'recommendations_qa_ranking';
/** Redis hot copy: one hash per kind, kept two nights (a missed run). The
 * {qa} hash tag keeps every key in one cluster slot (one pipeline). */
export const QA_REDIS_PREFIX = 'reco:qa:{qa}:';
export const QA_REDIS_TTL_SEC = 2 * 24 * 3600;
/** Per topic: this many attorneys / questions / cases are kept. */
export const QA_TOPIC_TOP = 50;
/** Open questions / cases this fresh are candidates for an attorney. */
export const QA_OPEN_QUESTION_DAYS = 60;
export const QA_OPEN_CASE_DAYS = 30;
/** A question takes at most this many answers (LegalQaService.MAX_ANSWERS). */
const QUESTION_CAPACITY = 10;
/** A case with this many offers has little room left. */
const CASE_CAPACITY = 8;

export type QaTopicKind = 'topic_attorneys' | 'topic_questions' | 'topic_cases';

export interface RankedId {
  id: string;
  /** 0..1, higher first. */
  s: number;
}

export interface QaSnapshotMeta {
  at: string;
  durationMs: number;
  attorneys: number;
  questions: number;
  cases: number;
}

interface AnswerRow {
  attorney_id: string;
  created_at: Date;
  likes: number;
  is_best: boolean;
  category: string | null;
}

interface OpenRow {
  id: string;
  created_at: Date;
  taken: number;
  category: string | null;
}

/**
 * R-401 (owner 2026-11-04): the nightly Q&A ranking snapshot
 * (docs/architecture/QA_RECOMMENDATIONS_2026-11-04.md). `rebuild()` runs
 * from the cron job `reco.qa-snapshot` (and from the admin's «Пересчитать
 * сейчас»): it reads every published answer of the last 90 days once,
 * scores each attorney (qa-ranking.ts), lists the open questions and cases
 * per practice category, and writes the result to the `reco_qa_snapshots`
 * table and a Redis hot copy. The read paths (people / cases ranking, the
 * attorney's recommended questions) only read the snapshot: Redis first,
 * the table when Redis lost it, nothing (= today's behaviour) when both are
 * empty or the flag is off.
 */
@Injectable()
export class QaSnapshotService {
  private readonly log = new Logger(QaSnapshotService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CACHE_CLIENT) private readonly redis: Redis,
    @Optional() private readonly settings?: AppSettingsService,
    @Optional() private readonly flags?: FeatureFlagsService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  /** The flag (default on: an empty snapshot changes nothing). */
  async enabled(): Promise<boolean> {
    if (!this.flags) return true;
    try {
      return await this.flags.isEnabled(QA_RANKING_FLAG, true);
    } catch {
      return true;
    }
  }

  // --- the nightly build -------------------------------------------------

  async rebuild(now: Date = new Date()): Promise<QaSnapshotMeta> {
    const started = Date.now();
    const gravity =
      (await this.settings?.number('reco.qa.gravity')) ?? QA_GRAVITY;
    const weights = {
      answers:
        (await this.settings?.number('reco.qa.answers')) ?? QA_WEIGHTS.answers,
      likes: (await this.settings?.number('reco.qa.likes')) ?? QA_WEIGHTS.likes,
      best: (await this.settings?.number('reco.qa.best')) ?? QA_WEIGHTS.best,
    };
    // Shard-ready: legal_* (content family) and cases (case family) live on
    // the shard databases, so the sweep runs once per physical database
    // and the parts are merged; the snapshot itself is global (primary).
    const parts = await forEachDatabase(this.prisma, () =>
      Promise.all([
        this.prisma.$queryRaw<AnswerRow[]>`
          SELECT a.attorney_id::TEXT AS attorney_id, a.created_at,
            a.like_count::INT AS likes, a.is_best,
            COALESCE(pa.parent_id, pa.id)::TEXT AS category
          FROM legal_answers a
          JOIN legal_questions q ON q.id = a.question_id AND q.deleted_at IS NULL
          LEFT JOIN practice_areas pa ON pa.id = q.practice_area_id
          WHERE a.status = 'published' AND a.deleted_at IS NULL
            AND a.created_at > ${now}::TIMESTAMPTZ - make_interval(days => ${QA_WINDOW_DAYS}::INT)
          LIMIT 200000`,
        this.prisma.$queryRaw<OpenRow[]>`
          SELECT q.id::TEXT AS id, q.created_at, q.answer_count::INT AS taken,
            COALESCE(pa.parent_id, pa.id)::TEXT AS category
          FROM legal_questions q
          LEFT JOIN practice_areas pa ON pa.id = q.practice_area_id
          WHERE q.status = 'published' AND q.deleted_at IS NULL
            AND q.closed_at IS NULL AND q.answer_count < ${QUESTION_CAPACITY}
            AND q.created_at > ${now}::TIMESTAMPTZ - make_interval(days => ${QA_OPEN_QUESTION_DAYS}::INT)
          ORDER BY q.created_at DESC
          LIMIT 5000`,
        this.prisma.$queryRaw<OpenRow[]>`
          SELECT c.id::TEXT AS id, c.created_at, c.bids_count::INT AS taken,
            COALESCE(pa.parent_id, pa.id)::TEXT AS category
          FROM cases c
          JOIN practice_areas pa ON pa.id = c.practice_area_id
          WHERE c.status = 'open' AND c.deleted_at IS NULL AND c.paused_at IS NULL
            AND c.created_at > ${now}::TIMESTAMPTZ - make_interval(days => ${QA_OPEN_CASE_DAYS}::INT)
          ORDER BY c.created_at DESC
          LIMIT 5000`,
      ]),
    );
    const answers = parts.flatMap((p) => p[0]);
    const questions = parts.flatMap((p) => p[1]);
    const cases = parts.flatMap((p) => p[2]);
    const nowMs = now.getTime();
    const attorneys = buildAttorneyEntries(answers, nowMs, gravity, weights);
    const topicAttorneys = topLists(
      [...attorneys].flatMap(([id, e]) =>
        Object.entries(e.topics).map(([cat, share]) => ({
          cat,
          id,
          s: e.score * (0.5 + 0.5 * share),
        })),
      ),
    );
    const topicQuestions = topLists(
      questions
        .filter((r) => r.category)
        .map((r) => ({
          cat: r.category!,
          id: r.id,
          s: openItemScore(
            new Date(r.created_at),
            Number(r.taken),
            QUESTION_CAPACITY,
            nowMs,
            gravity,
          ),
        })),
    );
    const topicCases = topLists(
      cases
        .filter((r) => r.category)
        .map((r) => ({
          cat: r.category!,
          id: r.id,
          s: openItemScore(
            new Date(r.created_at),
            Number(r.taken),
            CASE_CAPACITY,
            nowMs,
            gravity,
          ),
        })),
    );
    const meta: QaSnapshotMeta = {
      at: now.toISOString(),
      durationMs: 0,
      attorneys: attorneys.size,
      questions: questions.length,
      cases: cases.length,
    };
    const rows = [
      ...[...attorneys].map(([key, e]) => ({
        kind: 'attorney',
        key,
        payload: e,
      })),
      ...rowsOf('topic_attorneys', topicAttorneys),
      ...rowsOf('topic_questions', topicQuestions),
      ...rowsOf('topic_cases', topicCases),
    ];
    meta.durationMs = Date.now() - started;
    rows.push({ kind: 'meta', key: 'last_run', payload: meta });
    // Raw SQL on purpose: the table has no Prisma delegate in the shared
    // local client (schema change without a regenerate on this Mac); one
    // transaction, the old snapshot replaced whole. A plain row delete, not
    // TRUNCATE: the production role lawbid_app holds SELECT / INSERT /
    // UPDATE / DELETE only (no TRUNCATE privilege), so the nightly job
    // failed on prod with 42501 «permission denied for table
    // reco_qa_snapshots» (05.11-08.11) while CI (superuser) stayed green.
    // A few thousand rows; inside the same transaction just as atomic.
    await shardContext.runOnPrimary(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`DELETE FROM reco_qa_snapshots`;
        for (let i = 0; i < rows.length; i += 1000) {
          const chunk = rows.slice(i, i + 1000);
          await tx.$executeRaw`
            INSERT INTO reco_qa_snapshots (kind, key, payload, computed_at)
            SELECT * FROM unnest(
              ${chunk.map((r) => r.kind)}::TEXT[],
              ${chunk.map((r) => r.key)}::TEXT[],
              ${chunk.map((r) => JSON.stringify(r.payload))}::JSONB[],
              ${chunk.map(() => now)}::TIMESTAMPTZ[])`;
        }
      }),
    );
    await this.writeHot(rows);
    this.log.log(
      `Q&A snapshot: ${meta.attorneys} attorneys, ${meta.questions} questions, ${meta.cases} cases in ${meta.durationMs} ms`,
    );
    return meta;
  }

  /** Redis: one hash per kind (HMGET on read), two nights of life. */
  private async writeHot(
    rows: { kind: string; key: string; payload: object }[],
  ): Promise<void> {
    try {
      const byKind = new Map<string, Record<string, string>>();
      for (const r of rows) {
        const h = byKind.get(r.kind) ?? {};
        h[r.key] = JSON.stringify(r.payload);
        byKind.set(r.kind, h);
      }
      const p = this.redis.pipeline();
      for (const kind of [
        'attorney',
        'topic_attorneys',
        'topic_questions',
        'topic_cases',
        'meta',
      ]) {
        const key = QA_REDIS_PREFIX + kind;
        p.del(key);
        const h = byKind.get(kind);
        if (h && Object.keys(h).length > 0) {
          p.hset(key, h);
          p.expire(key, QA_REDIS_TTL_SEC);
        }
      }
      await p.exec();
    } catch (err) {
      // The table is the truth; the hot copy is a convenience.
      this.log.warn(`Q&A snapshot hot copy failed: ${String(err)}`);
    }
  }

  /** Admin «Пересчитать сейчас»: the cron job queued once, now. */
  async enqueueRebuild(): Promise<void> {
    const url = this.config?.get<string>('REDIS_URL');
    if (!url) throw new Error('REDIS_URL is not set');
    const lane = cronLaneOf(CRON_JOBS.recoQaSnapshot);
    const queue = new Queue(lane, bullOptions(lane, url));
    try {
      await queue.add(
        CRON_JOBS.recoQaSnapshot,
        {},
        {
          jobId: `${CRON_JOBS.recoQaSnapshot}:manual:${Date.now()}`,
          removeOnComplete: true,
          removeOnFail: 20,
        },
      );
    } finally {
      await queue.close();
    }
  }

  // --- the read paths ----------------------------------------------------

  /** The last run (null before the first). */
  async lastRun(): Promise<QaSnapshotMeta | null> {
    const got = await this.read<QaSnapshotMeta>('meta', ['last_run']);
    return got.get('last_run') ?? null;
  }

  /** Snapshot entries of the given attorneys (missing = never answered). */
  async attorneyScores(ids: string[]): Promise<Map<string, QaAttorneyEntry>> {
    if (ids.length === 0 || !(await this.enabled())) return new Map();
    return this.read<QaAttorneyEntry>('attorney', ids);
  }

  /** Ranked ids of [kind] over the given topics, merged (best score wins),
   * best first. Empty without a snapshot. */
  async topicList(kind: QaTopicKind, topics: string[]): Promise<RankedId[]> {
    if (topics.length === 0 || !(await this.enabled())) return [];
    const lists = await this.read<RankedId[]>(kind, topics);
    const best = new Map<string, number>();
    for (const list of lists.values()) {
      for (const r of list) {
        if ((best.get(r.id) ?? -1) < r.s) best.set(r.id, r.s);
      }
    }
    return [...best]
      .map(([id, s]) => ({ id, s }))
      .sort((a, b) => b.s - a.s || (a.id < b.id ? -1 : 1));
  }

  /** Redis hash first; the table when the hash is gone; {} when both are. */
  private async read<T>(kind: string, keys: string[]): Promise<Map<string, T>> {
    const out = new Map<string, T>();
    const uniq = [...new Set(keys)];
    try {
      const hot = await this.redis.hmget(QA_REDIS_PREFIX + kind, ...uniq);
      let any = false;
      hot.forEach((v, i) => {
        if (v !== null) {
          any = true;
          out.set(uniq[i], JSON.parse(v) as T);
        }
      });
      // The hash exists but none of the keys are there: a true miss (the
      // attorney never answered), not a lost copy.
      if (any || (await this.redis.exists(QA_REDIS_PREFIX + kind)) === 1) {
        return out;
      }
    } catch (err) {
      this.log.warn(`Q&A snapshot hot read failed: ${String(err)}`);
    }
    try {
      const rows = await shardContext.runOnPrimary(
        () =>
          this.prisma.$queryRaw<{ key: string; payload: T }[]>`
          SELECT key, payload FROM reco_qa_snapshots
          WHERE kind = ${kind} AND key = ANY(${uniq}::TEXT[])`,
      );
      for (const r of rows) out.set(r.key, r.payload);
    } catch (err) {
      this.log.warn(`Q&A snapshot read failed: ${String(err)}`);
    }
    return out;
  }
}

/** Per attorney: the facts → features → score and topics. */
export function buildAttorneyEntries(
  rows: readonly AnswerRow[],
  now: number,
  gravity: number,
  weights: QaFeatures,
): Map<string, QaAttorneyEntry> {
  const facts = new Map<string, QaAnswerFact[]>();
  for (const r of rows) {
    const list = facts.get(r.attorney_id) ?? [];
    list.push({
      createdAt: new Date(r.created_at),
      likes: Number(r.likes),
      best: !!r.is_best,
      category: r.category,
    });
    facts.set(r.attorney_id, list);
  }
  const out = new Map<string, QaAttorneyEntry>();
  for (const [id, list] of facts) {
    const { features, topics } = qaFeatures(list, now, gravity);
    out.set(id, {
      score: qaScore(features, weights),
      topics,
      counts: {
        answers: list.length,
        likes: list.reduce((s, f) => s + f.likes, 0),
        best: list.filter((f) => f.best).length,
      },
    });
  }
  return out;
}

/** Group by topic, keep the QA_TOPIC_TOP best of each. */
function topLists(
  items: { cat: string; id: string; s: number }[],
): Map<string, RankedId[]> {
  const by = new Map<string, RankedId[]>();
  for (const it of items) {
    const list = by.get(it.cat) ?? [];
    list.push({ id: it.id, s: round(it.s) });
    by.set(it.cat, list);
  }
  for (const [cat, list] of by) {
    list.sort((a, b) => b.s - a.s || (a.id < b.id ? -1 : 1));
    by.set(cat, list.slice(0, QA_TOPIC_TOP));
  }
  return by;
}

function rowsOf(
  kind: QaTopicKind,
  lists: Map<string, RankedId[]>,
): { kind: string; key: string; payload: object }[] {
  return [...lists].map(([key, list]) => ({ kind, key, payload: list }));
}

const round = (x: number): number => Math.round(x * 10000) / 10000;
