import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
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

    for (;;) {
      const [row] = await this.prisma.$queryRaw<BatchRow[]>(Prisma.sql`
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
        SELECT (SELECT max(user_id) FROM batch)::STRING AS last_id,
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
}
