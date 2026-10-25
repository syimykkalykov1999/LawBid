import { forEachDatabase } from '../../src/sharding/for-each-database';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Raw SQL reads in a suite: runs [fn] on every physical database (the pinned
 * shard context decides where `$queryRaw` goes) and joins the rows. One
 * database: a single call, same as before. Suites use it to inspect rows of
 * the sharded families with SQL.
 */
export async function rowsOnAnyDb<T>(
  prisma: PrismaService,
  fn: () => Promise<T[]>,
): Promise<T[]> {
  return (await forEachDatabase(prisma, fn)).flat();
}
