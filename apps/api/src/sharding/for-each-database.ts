import { PRIMARY_DB } from './shard-router';
import { shardContext } from './shard-context';
import { routingOf } from '../prisma/prisma.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Shard-ready step 8: runs [fn] once on every physical database that holds
 * logical shards, with the shard context pinned to that database, and
 * returns the answers in database order. Meant for sweeps and "everything
 * of this attorney" operations that name no case or user (a job that
 * withdraws all active bids of an attorney, a cleanup, a recount).
 *
 * With one physical database (or none known, as in unit tests) it just runs
 * [fn] once, in the caller's context: no behaviour change.
 */
export async function forEachDatabase<T>(
  prisma: PrismaService,
  fn: (database: string) => Promise<T>,
  opts: { withPrimary?: boolean } = {},
): Promise<T[]> {
  const shardKeys = routingOf(prisma)?.router.physicalKeys() ?? [];
  // `withPrimary`: tables written in EVERY database, the primary included
  // even when it holds no shard any more (the username registry: people's
  // rows on the primary, channels' with their owner).
  const keys =
    opts.withPrimary && shardKeys.length > 0 && !shardKeys.includes(PRIMARY_DB)
      ? [PRIMARY_DB, ...shardKeys]
      : shardKeys;
  if (keys.length === 0 || (keys.length === 1 && keys[0] === PRIMARY_DB)) {
    return [await fn(PRIMARY_DB)];
  }
  const out: T[] = [];
  for (const key of keys) {
    out.push(await shardContext.runOnPhysical(key, () => fn(key)));
  }
  return out;
}
