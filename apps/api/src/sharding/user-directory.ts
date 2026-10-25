import type { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { delSafe, mgetSafe } from '../redis/redis-cluster-safe';
import type { PrismaService } from '../prisma/prisma.service';
import { withDeleted } from '../prisma/soft-delete.extension';
import { ghostRow } from './ghost-row';

/**
 * Shard-ready step 6 (docs/architecture/SHARDING_READY.md §3, §7): the user
 * directory.
 *
 * `User` is a GLOBAL-family model (one primary database); cases, bids,
 * messages, posts, comments, notifications are sharded and may live on other
 * databases. A Prisma `include: { client: true }` on a sharded row therefore
 * becomes a cross-database join the day the families are split. The pattern
 * that replaces it:
 *
 *   1. query the sharded rows (no user relation in the query),
 *   2. ask the directory for all the users in ONE batch,
 *   3. stitch them back under the same keys the include used.
 *
 * so the JSON the API returns is byte-identical.
 *
 * Two ways in:
 *  - `select(ids, select)`: any `Prisma.UserSelect` (the exact projection the
 *    old include had). DataLoader-style: ids asked for in the same tick,
 *    with the same projection, from any number of call sites, become ONE
 *    `findMany ... id IN (...)` query. Never cached: it can return anything.
 *  - `cards(ids)`: the PUBLIC profile fields only ({@link USER_CARD_SELECT}),
 *    additionally cached in Redis for a few seconds when the cache is on
 *    (see {@link userCardCacheTtlSeconds}). Nothing private (email, phone,
 *    password, tokens, settings) is ever put in Redis.
 *
 * Soft-deleted users are returned too, exactly like a to-one Prisma include
 * (Prisma cannot filter a to-one include; callers check `deleted_at`).
 *
 * There is deliberately NO per-request memo: a request that updates a user
 * and then reads it back would see the old value. Batching per tick removes
 * the N+1 without that risk.
 */

/** The public profile fields every list needs next to a name. */
export const USER_CARD_SELECT = {
  id: true,
  role: true,
  status: true,
  first_name: true,
  last_name: true,
  avatar_file_id: true,
  client_profile: { select: { username: true } },
  attorney_profile: {
    select: {
      username: true,
      trust_badge: true,
      verification_status: true,
    },
  },
} satisfies Prisma.UserSelect;

export type UserCard = Prisma.UserGetPayload<{
  select: typeof USER_CARD_SELECT;
}>;

const CACHE_PREFIX = 'lawbid:user-card:v1:';

/**
 * Seconds a card stays in Redis. `USER_DIRECTORY_CACHE_TTL_SECONDS` wins
 * (0 = off); otherwise OFF while there is one physical database (the join
 * is cheap and no behaviour may change), 10 s once several exist.
 */
export function userCardCacheTtlSeconds(
  physicalDatabases: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.USER_DIRECTORY_CACHE_TTL_SECONDS;
  if (raw !== undefined && raw.trim() !== '') {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }
  return physicalDatabases > 1 ? 10 : 0;
}

interface Batch {
  readonly select: Prisma.UserSelect;
  readonly ids: Set<string>;
  readonly waiters: Array<{
    resolve: (m: Map<string, unknown>) => void;
    reject: (e: unknown) => void;
    ids: readonly string[];
  }>;
}

export class UserDirectory {
  private batches = new Map<string, Batch>();
  private redis: Pick<Redis, 'mget' | 'set' | 'del'> | null = null;
  private ttlSeconds: number | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Called once by the Nest provider; unit tests run without Redis. */
  attachCache(
    redis: Pick<Redis, 'mget' | 'set' | 'del'> | null,
    ttlSeconds: number,
  ): void {
    this.redis = redis;
    this.ttlSeconds = ttlSeconds;
  }

  /** Users by id with exactly `select`. Missing ids are absent. */
  select<S extends Prisma.UserSelect>(
    ids: ReadonlyArray<string | null | undefined>,
    select: S,
  ): Promise<Map<string, Prisma.UserGetPayload<{ select: S }>>> {
    const unique = [...new Set(ids.filter((i): i is string => !!i))];
    if (unique.length === 0) {
      return Promise.resolve(
        new Map<string, Prisma.UserGetPayload<{ select: S }>>(),
      );
    }
    const key = JSON.stringify(select);
    let batch = this.batches.get(key);
    if (!batch) {
      batch = { select, ids: new Set(), waiters: [] };
      this.batches.set(key, batch);
      // DataLoader: collect everything asked in this tick, query once.
      queueMicrotask(() => void this.flush(key));
    }
    for (const id of unique) batch.ids.add(id);
    return new Promise((resolve, reject) => {
      batch.waiters.push({
        resolve: resolve as (m: Map<string, unknown>) => void,
        reject,
        ids: unique,
      });
    });
  }

  /** One user, or null. */
  async one<S extends Prisma.UserSelect>(
    id: string | null | undefined,
    select: S,
  ): Promise<Prisma.UserGetPayload<{ select: S }> | null> {
    if (!id) return null;
    return (await this.select([id], select)).get(id) ?? null;
  }

  /** Public cards (cached when the cache is on). */
  async cards(
    ids: ReadonlyArray<string | null | undefined>,
  ): Promise<Map<string, UserCard>> {
    const unique = [...new Set(ids.filter((i): i is string => !!i))];
    const out = new Map<string, UserCard>();
    if (unique.length === 0) return out;
    const ttl = this.cacheTtl();
    const missing: string[] = [];
    if (ttl > 0 && this.redis) {
      try {
        const hits = await mgetSafe(
          this.redis as unknown as Redis,
          unique.map((i) => CACHE_PREFIX + i),
        );
        unique.forEach((id, i) => {
          const raw = hits[i];
          if (raw) out.set(id, JSON.parse(raw) as UserCard);
          else missing.push(id);
        });
      } catch {
        // A cache outage is a slower request, never a failed one.
        out.clear();
        missing.splice(0, missing.length, ...unique);
      }
    } else {
      missing.push(...unique);
    }
    if (missing.length === 0) return out;
    const fresh = await this.select(missing, USER_CARD_SELECT);
    for (const [id, card] of fresh) out.set(id, card);
    if (ttl > 0 && this.redis) {
      await Promise.all(
        [...fresh].map(([id, card]) =>
          this.redis!.set(
            CACHE_PREFIX + id,
            JSON.stringify(card),
            'EX',
            ttl,
          ).catch(() => undefined),
        ),
      );
    }
    return out;
  }

  /** Call after changing a user's name / avatar / username / badge. */
  async invalidate(...ids: string[]): Promise<void> {
    if (!this.redis || ids.length === 0) return;
    await delSafe(
      this.redis as unknown as Redis,
      ids.map((i) => CACHE_PREFIX + i),
    ).catch(() => undefined);
  }

  private cacheTtl(): number {
    if (this.ttlSeconds !== null) return this.ttlSeconds;
    return userCardCacheTtlSeconds(1);
  }

  private async flush(key: string): Promise<void> {
    const batch = this.batches.get(key);
    if (!batch) return;
    this.batches.delete(key);
    try {
      const select = batch.select.id
        ? batch.select
        : { ...batch.select, id: true };
      const rows = (await this.prisma.user.findMany({
        where: withDeleted({ id: { in: [...batch.ids] } }),
        select,
      })) as unknown as Array<{ id: string }>;
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const w of batch.waiters) {
        const m = new Map<string, unknown>();
        for (const id of w.ids) {
          const r = byId.get(id);
          if (r) m.set(id, batch.select.id ? r : stripId(r));
        }
        w.resolve(m);
      }
    } catch (e) {
      for (const w of batch.waiters) w.reject(e);
    }
  }
}

function stripId<T extends { id: string }>(row: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = row;
  void _id;
  return rest;
}

const perPrisma = new WeakMap<object, UserDirectory>();

/**
 * The directory of a PrismaService (one per service instance), so a call
 * site needs nothing but the `this.prisma` it already has:
 * `const users = await userDirectory(this.prisma).select(ids, SELECT)`.
 */
export function userDirectory(prisma: PrismaService): UserDirectory {
  let d = perPrisma.get(prisma);
  if (!d) {
    d = new UserDirectory(prisma);
    perPrisma.set(prisma, d);
  }
  return d;
}

/**
 * Stitches users onto rows, replacing `include: { client: { select } }`:
 *
 *   const rows = await this.prisma.case.findMany({ where });
 *   return attachUsers(this.prisma, rows, 'client_id', 'client', SELECT);
 *
 * Same key order as Prisma would return is not guaranteed by JSON anyway;
 * the keys and values are the same.
 */
export async function attachUsers<
  R extends Record<string, unknown>,
  K extends string,
  S extends Prisma.UserSelect,
>(
  prisma: PrismaService,
  rows: readonly R[],
  idField: keyof R & string,
  as: K,
  select: S,
): Promise<
  Array<R & { [P in K]: Prisma.UserGetPayload<{ select: S }> | null }>
> {
  const users = await userDirectory(prisma).select(
    rows.map((r) => r[idField] as string | null),
    select,
  );
  // Step 9: an id whose user is gone (no foreign key any more) becomes a
  // ghost (selected fields null), not null: the old include never returned
  // null for a required relation. A null id stays null.
  return rows.map((r) => {
    const id = r[idField] as string | null | undefined;
    return {
      ...r,
      [as]: id ? (users.get(id) ?? ghostRow(select)) : null,
    };
  }) as unknown as Array<
    R & { [P in K]: Prisma.UserGetPayload<{ select: S }> | null }
  >;
}
