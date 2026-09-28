import { Prisma } from '@prisma/client';

/**
 * docs/03 §7.5: `attorney_profiles.rating_avg` / `rating_count` are a plain
 * average / count over the attorney's `published` reviews, recalculated
 * in the SAME transaction as every create/edit/hide/remove.
 *
 * One statement, and the exact same SQL expression the nightly
 * reconciliation job (jobs/handlers/rating-reconcile.job.ts) compares
 * against — computing the average in SQL on both sides means the job never
 * "fixes" a value only because JS and SQL round differently.
 */
export const RATING_AVG_SQL = Prisma.sql`COALESCE(round(avg(r.rating)::DECIMAL, 2), 0)`;

export interface RatingTotals {
  ratingAvg: number;
  ratingCount: number;
}

export async function recalcAttorneyRating(
  tx: Prisma.TransactionClient,
  attorneyId: string,
): Promise<RatingTotals> {
  const rows = await tx.$queryRaw<
    { rating_avg: Prisma.Decimal | string; rating_count: bigint | number }[]
  >(Prisma.sql`
    UPDATE attorney_profiles AS ap
    SET (rating_avg, rating_count, updated_at) = (
      SELECT ${RATING_AVG_SQL}, count(r.id), now()
      FROM reviews AS r
      WHERE r.attorney_id = ${attorneyId}::UUID AND r.status = 'published'
    )
    WHERE ap.user_id = ${attorneyId}::UUID
    RETURNING ap.rating_avg, ap.rating_count`);
  const row = rows[0];
  if (!row) return { ratingAvg: 0, ratingCount: 0 };
  return {
    ratingAvg: Number(row.rating_avg.toString()),
    ratingCount: Number(row.rating_count),
  };
}

/** §7.4: the average is shown rounded to one decimal (4.5). */
export function displayRating(avg: number): number {
  return Math.round(avg * 10) / 10;
}
