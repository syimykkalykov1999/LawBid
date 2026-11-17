import { Prisma } from '../generated/prisma/client';

/**
 * DB scale batch B: retention by whole month for the monthly-partitioned
 * tables (idea of pg_partman's `retention`: drop the child table whose whole
 * range is past the retention instead of deleting its rows one by one; code
 * our own, the SQL is in migration
 * 20261212120000_retention_partition_drop_counter_base). Before this,
 * PARTITION_RETENTION_MONTHS was empty and the drop path was never used.
 *
 * The SQL function drops AT MOST ONE month per call (one short transaction
 * each) and only a month whose upper bound is at or before [before], with no
 * row of a held person, while no online conversion of the table is
 * unfinished; post views of a dropped month go to posts.view_count_base in
 * the same transaction. Returns the dropped partition names.
 */
export const MONTH_RETENTION_FUNCTIONS = {
  post_view_events: 'lawbid_drop_expired_post_view_events_month',
  auth_events: 'lawbid_drop_expired_auth_events_month',
} as const;

export type MonthRetentionTable = keyof typeof MONTH_RETENTION_FUNCTIONS;

export interface MonthRetentionDb {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
}

export async function dropExpiredMonths(
  db: MonthRetentionDb,
  table: MonthRetentionTable,
  before: Date,
  heldUserIds: string[],
  lockTimeoutMs: number,
): Promise<string[]> {
  const fn = MONTH_RETENTION_FUNCTIONS[table];
  const dropped: string[] = [];
  for (;;) {
    // The function name comes from the constant above, never from input.
    const rows = await db.$queryRaw<{ name: string | null }[]>(
      Prisma.sql`SELECT ${Prisma.raw(fn)}(${before}::TIMESTAMPTZ,
        ${heldUserIds}::UUID[], ${Math.max(1, Math.floor(lockTimeoutMs))}::INT) AS name`,
    );
    const name = rows[0]?.name ?? null;
    if (!name) return dropped;
    dropped.push(name);
  }
}
