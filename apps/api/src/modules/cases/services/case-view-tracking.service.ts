import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../../redis/redis.constants';

const SEEN_KEY = (caseId: string): string => `cv:seen:${caseId}`;
const PENDING_KEY = 'cv:pending';
const FLUSH_INTERVAL_MS = 15_000;
/** Fields drained per Lua call / rows per UPDATE (bounded work per step). */
const FLUSH_BATCH = 500;
/** Dedup memory bound: a case's "seen" set expires this long after its last
 * new viewer. Open cases are archived after 30 + 14 idle days (§10.2), so
 * the window outlives any case that can still be in the feed. */
const SEEN_TTL_SECONDS = 60 * 24 * 3600;

/** Atomic (single Lua call, so no race with a concurrent HINCRBY on the
 * same fields): read a batch of pending deltas and clear them in one
 * step. Returns the values in ARGV order (nil for a field already gone). */
const DRAIN_BATCH = `
local vals = redis.call('HMGET', KEYS[1], unpack(ARGV))
redis.call('HDEL', KEYS[1], unpack(ARGV))
return vals`;

/**
 * docs/04_CASES_BIDS.md §4.3: "Счётчик просмотров: +1 не чаще раза на
 * пару (адвокат, кейс), дедупликация в Redis, запись в БД пакетно
 * воркером."
 *
 * - Dedup is permanent per (attorney, case) pair: a Redis SET per case
 *   (`cv:seen:<caseId>`) holding the attorney ids already counted.
 *   `SADD` returning 1 is the "first time" signal.
 * - The DB write is batched: a first view only increments a Redis hash
 *   (`cv:pending`, field = caseId, value = pending delta), never runs a
 *   write query itself. `flushPending()` periodically drains that hash
 *   into one multi-row `UPDATE ... FROM (unnest(...))` per flush.
 * - Draining a field is a single Lua call (GET+DEL), so a `recordView`
 *   racing the flush either lands before the drain (counted this flush)
 *   or after (starts a fresh pending delta) — never lost, never double
 *   counted.
 */
@Injectable()
export class CaseViewTrackingService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CaseViewTrackingService.name);
  }

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      this.flushPending().catch((error: unknown) => {
        this.logger.error(
          { err: error instanceof Error ? error.message : String(error) },
          'case view flush failed',
        );
      });
    }, FLUSH_INTERVAL_MS);
    // Never keeps the process alive by itself (tests, CLI scripts).
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Records one attorney's view of one case if it is the first for this
   * pair. Returns whether it counted (mostly for tests). Caller must have
   * already checked visibility (CaseAccessPolicy) — this does not. */
  async recordView(attorneyId: string, caseId: string): Promise<boolean> {
    const key = SEEN_KEY(caseId);
    const added = await this.redis.sadd(key, attorneyId);
    if (added !== 1) return false;
    await this.redis
      .multi()
      .expire(key, SEEN_TTL_SECONDS)
      .hincrby(PENDING_KEY, caseId, 1)
      .exec();
    return true;
  }

  /** Batch worker (docs/04 §4.3): drains `cv:pending` and applies every
   * case's delta to `cases.view_count` in one statement. Safe to call
   * concurrently or re-enter (idempotent by construction: each field is
   * drained at most once per call, and a delta already applied is gone
   * from the hash). */
  async flushPending(): Promise<{ casesUpdated: number }> {
    let casesUpdated = 0;
    let cursor = '0';
    do {
      // HSCAN, not HKEYS: never blocks Redis on a large pending hash.
      const [next, flat] = await this.redis.hscan(
        PENDING_KEY,
        cursor,
        'COUNT',
        FLUSH_BATCH,
      );
      cursor = next;
      const fields = flat.filter((_, i) => i % 2 === 0);
      for (let i = 0; i < fields.length; i += FLUSH_BATCH) {
        casesUpdated += await this.drainAndApply(
          fields.slice(i, i + FLUSH_BATCH),
        );
      }
    } while (cursor !== '0');
    return { casesUpdated };
  }

  private async drainAndApply(caseIds: string[]): Promise<number> {
    if (caseIds.length === 0) return 0;
    const raw = (await this.redis.eval(
      DRAIN_BATCH,
      1,
      PENDING_KEY,
      ...caseIds,
    )) as (string | null)[];

    const ids: string[] = [];
    const deltas: number[] = [];
    caseIds.forEach((caseId, i) => {
      const delta = raw[i] ? Number(raw[i]) : 0;
      if (delta > 0) {
        ids.push(caseId);
        deltas.push(delta);
      }
    });
    if (ids.length === 0) return 0;

    try {
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE cases AS c SET view_count = c.view_count + v.delta
        FROM (
          SELECT unnest(${ids}::UUID[]) AS id, unnest(${deltas}::INT[]) AS delta
        ) AS v
        WHERE c.id = v.id`);
    } catch (error) {
      // Put the drained deltas back so the next flush retries them
      // instead of silently losing views.
      const restore = this.redis.multi();
      ids.forEach((id, i) => restore.hincrby(PENDING_KEY, id, deltas[i]));
      await restore.exec();
      throw error;
    }
    return ids.length;
  }
}
