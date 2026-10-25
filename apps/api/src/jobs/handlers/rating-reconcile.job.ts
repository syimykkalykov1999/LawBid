import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { forEachDatabase } from '../../sharding/for-each-database';
import { readsAreSplit } from '../../sharding/split-reads';
import { RATING_AVG_SQL } from '../../modules/reviews/review-rating';

export const RATING_RECONCILE_BATCH = 1000;

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

interface BatchRow {
  last_id: string | null;
  scanned: bigint;
  fixed: bigint;
}

export interface RatingReconcileResult {
  scanned: number;
  fixed: number;
}

/**
 * docs/03 §7.5: "Ночная джоба сверяет счётчики с реальными данными и
 * исправляет расхождения." Recomputes rating_avg / rating_count of every
 * attorney from the published reviews with the same SQL expression the
 * write path uses (review-rating.ts), and rewrites only rows that differ.
 * Walks attorney_profiles by primary key in fixed batches, one statement
 * each (short implicit transactions, docs/02 §1.1). Idempotent.
 */
@Injectable()
export class RatingReconcileJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RatingReconcileJob.name);
  }

  async run(
    batchSize: number = RATING_RECONCILE_BATCH,
  ): Promise<RatingReconcileResult> {
    let cursor = ZERO_UUID;
    let scanned = 0;
    let fixed = 0;

    const split = readsAreSplit(this.prisma);
    for (;;) {
      const [row] = split
        ? await this.splitBatch(cursor, batchSize)
        : await this.prisma.$queryRaw<BatchRow[]>(Prisma.sql`
        WITH batch AS (
          SELECT user_id, rating_avg, rating_count
          FROM attorney_profiles
          WHERE user_id > ${cursor}::UUID
          ORDER BY user_id
          LIMIT ${batchSize}
        ),
        actual AS (
          SELECT b.user_id,
                 ${RATING_AVG_SQL}::DECIMAL(3, 2) AS avg,
                 count(r.id)::INT8 AS cnt
          FROM batch AS b
          LEFT JOIN reviews AS r
            ON r.attorney_id = b.user_id AND r.status = 'published'
          GROUP BY b.user_id
        ),
        drift AS (
          SELECT a.user_id, a.avg, a.cnt
          FROM actual AS a JOIN batch AS b ON b.user_id = a.user_id
          WHERE b.rating_avg <> a.avg OR b.rating_count <> a.cnt
        ),
        fixed AS (
          UPDATE attorney_profiles AS ap
          SET rating_avg = d.avg, rating_count = d.cnt, updated_at = now()
          FROM drift AS d
          WHERE ap.user_id = d.user_id
          RETURNING ap.user_id
        )
        SELECT (SELECT user_id FROM batch ORDER BY user_id DESC LIMIT 1)::TEXT AS last_id,
               (SELECT count(*) FROM batch) AS scanned,
               (SELECT count(*) FROM fixed) AS fixed`);

      const batchScanned = Number(row?.scanned ?? 0);
      scanned += batchScanned;
      fixed += Number(row?.fixed ?? 0);
      if (batchScanned < batchSize || !row?.last_id) break;
      cursor = row.last_id;
    }

    if (fixed > 0) {
      this.logger.warn({ scanned, fixed }, 'attorney rating drift corrected');
    } else {
      this.logger.info({ scanned, fixed }, 'attorney ratings consistent');
    }
    return { scanned, fixed };
  }

  /**
   * The same batch when reviews and attorney_profiles live on different
   * databases (shard-ready step 8): the batch of profiles is read on the
   * global side, the rating sums and counts per attorney are taken on every
   * database, and the rows that differ are rewritten on the global side with
   * the same SQL rounding (avg over ints = sum / count, exactly).
   */
  private async splitBatch(
    cursor: string,
    batchSize: number,
  ): Promise<BatchRow[]> {
    const global = this.prisma.global();
    const batch = await global.$queryRaw<
      { user_id: string; rating_avg: Prisma.Decimal; rating_count: number }[]
    >`SELECT user_id::TEXT AS user_id, rating_avg, rating_count
      FROM attorney_profiles
      WHERE user_id > ${cursor}::UUID
      ORDER BY user_id
      LIMIT ${batchSize}`;
    if (batch.length === 0) return [{ last_id: null, scanned: 0n, fixed: 0n }];
    const ids = batch.map((b) => b.user_id);
    const parts = await forEachDatabase(
      this.prisma,
      () =>
        this.prisma.$queryRaw<
          { attorney_id: string; sum: bigint | number; cnt: bigint | number }[]
        >`SELECT attorney_id::TEXT AS attorney_id, sum(rating) AS sum,
               count(id) AS cnt
        FROM reviews
        WHERE attorney_id = ANY(${ids}::UUID[]) AND status = 'published'
        GROUP BY attorney_id`,
    );
    const sums = new Map<string, { sum: number; cnt: number }>();
    for (const r of parts.flat()) {
      const cur = sums.get(r.attorney_id) ?? { sum: 0, cnt: 0 };
      cur.sum += Number(r.sum);
      cur.cnt += Number(r.cnt);
      sums.set(r.attorney_id, cur);
    }
    const sumList = ids.map((id) => sums.get(id)?.sum ?? 0);
    const cntList = ids.map((id) => sums.get(id)?.cnt ?? 0);
    const fixed = await global.$executeRaw`
      UPDATE attorney_profiles AS ap
      SET rating_avg = COALESCE(round(t.s::DECIMAL / NULLIF(t.c, 0), 2), 0),
          rating_count = t.c, updated_at = now()
      FROM unnest(${ids}::UUID[], ${sumList}::INT8[], ${cntList}::INT8[])
        AS t(id, s, c)
      WHERE ap.user_id = t.id
        AND (ap.rating_avg <> COALESCE(round(t.s::DECIMAL / NULLIF(t.c, 0), 2), 0)
             OR ap.rating_count <> t.c)`;
    return [
      {
        last_id: ids[ids.length - 1],
        scanned: BigInt(ids.length),
        fixed: BigInt(fixed),
      },
    ];
  }
}
