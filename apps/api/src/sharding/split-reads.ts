import { ROUTING } from '../prisma/prisma.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Shard-ready step 6/8: some reads were written as ONE SQL statement that
 * joins sharded tables (cases, bids, messages ...) with global ones (users,
 * profiles, licences, blocks, practice areas). That cannot run when the two
 * families live on different databases. Such a read keeps its single
 * statement while there is one physical database (fast, unchanged) and uses
 * a second, query-per-family implementation otherwise:
 *
 *   if (readsAreSplit(this.prisma)) return this.decideSplit(...);
 *   ...the original single statement...
 *
 * `SHARD_SPLIT_READS=on` forces the split implementation on one database,
 * so the e2e suites can prove both implementations give the same answers.
 */
export function readsAreSplit(
  prisma: PrismaService,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if ((env.SHARD_SPLIT_READS ?? '').trim().toLowerCase() === 'on') return true;
  const routing = (prisma as unknown as Record<symbol, unknown>)[ROUTING] as
    { shardDatabaseKeys(): string[] } | undefined;
  return (routing?.shardDatabaseKeys().length ?? 0) > 0;
}
