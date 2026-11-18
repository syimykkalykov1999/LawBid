import type { PrismaService } from './prisma.service';

/**
 * Verify 17.11 (batch 9, KNOWN_ERRORS): the client of the PRIMARY database,
 * where every global-family table lives (firms, client_profiles,
 * subscriptions, assistant seats …). A `$transaction` of the plain service
 * runs on the database of the shard context, so raw SQL inside it — a
 * `SELECT … FOR UPDATE` on a global table, an advisory lock — reached the
 * shard's empty copy in the two-database mode (a firm "did not exist", a
 * lock locked nothing). Transactions that lock global rows run here.
 * A test double without `global()` is used as it is.
 */
export function primaryClient(prisma: PrismaService): PrismaService {
  const p = prisma as PrismaService & { global?: () => PrismaService };
  return typeof p.global === 'function' ? p.global() : prisma;
}
