import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  StaffDigestDto,
  StaffDigestListDto,
  StaffDigestNumbersDto,
} from './staff-home.dto';
import { isoDay, lastWeekStart, returnedPct } from './staff-digest.logic';
import { personName } from './staff-today.logic';

const DAY_MS = 86_400_000;

type Named = { first_name: string | null; last_name: string | null };

/**
 * Staff package T10: the weekly «5 чисел» for the owner. Counted ONCE a week
 * from the small nightly tables (daily stats, rating snapshots, piecework
 * days, complaints), stored in `staff_digests` (one row a week — a re-run
 * finds it and sends nothing again). The sending (push + e-mail through the
 * on-call channel, PushQueueService.enqueueOpsAlert) is done by the
 * `staff.weekly-digest` job from the result of {@link prepare}.
 */
@Injectable()
export class StaffDigestService {
  constructor(private readonly prisma: PrismaService) {}

  /** The numbers of the week starting [from] (Monday, UTC). */
  async compose(from: Date): Promise<StaffDigestNumbersDto> {
    const to = new Date(from.getTime() + 7 * DAY_MS);
    const [stats, appeals, ratings, extremes, pay] = await Promise.all([
      this.prisma.staffDailyStat.aggregate({
        where: { day: { gte: from, lt: to } },
        _sum: { decided: true, reopened: true },
      }),
      this.prisma.adminAppeal.count({
        where: { created_at: { gte: from, lt: to } },
      }),
      this.prisma.$queryRaw<Array<{ status: string; c: bigint }>>`
        SELECT s.status, count(*) AS c FROM staff_rating_snapshots s
        WHERE s.snapshot_date = (SELECT MAX(snapshot_date) FROM staff_rating_snapshots)
        GROUP BY s.status`,
      this.prisma.$queryRaw<Array<Named & { bucket: string }>>`
        (SELECT 'worst' AS bucket, u.first_name, u.last_name
           FROM staff_rating_snapshots s JOIN users u ON u.id = s.admin_id
          WHERE s.snapshot_date = (SELECT MAX(snapshot_date) FROM staff_rating_snapshots)
            AND s.status IN ('red', 'yellow')
          ORDER BY (s.status = 'red') DESC, s.rating ASC NULLS LAST, s.admin_id LIMIT 1)
        UNION ALL
        (SELECT 'best' AS bucket, u.first_name, u.last_name
           FROM staff_rating_snapshots s JOIN users u ON u.id = s.admin_id
          WHERE s.snapshot_date = (SELECT MAX(snapshot_date) FROM staff_rating_snapshots)
            AND s.status = 'green'
          ORDER BY s.rating DESC, s.admin_id LIMIT 1)`,
      this.prisma.staffPieceworkDay.aggregate({
        where: { day: { gte: from, lt: to }, status: 'accrued' },
        _sum: { amount_cents: true },
      }),
    ]);
    const decided = stats._sum.decided ?? 0;
    const count = (st: string[]) =>
      ratings
        .filter((r) => st.includes(r.status))
        .reduce((a, r) => a + Number(r.c), 0);
    const name = (b: string) => {
      const r = extremes.find((e) => e.bucket === b);
      return r ? personName(r.first_name, r.last_name) : null;
    };
    return {
      decisions: decided,
      returnedPct: returnedPct(decided, stats._sum.reopened ?? 0),
      appeals,
      worstCount: count(['red', 'yellow']),
      bestCount: count(['green']),
      worstName: name('worst'),
      bestName: name('best'),
      pieceworkCents: pay._sum.amount_cents ?? 0,
      currency: 'usd',
    };
  }

  /**
   * Compose last week's digest and store it. Returns the new digest to send,
   * or null when that week already has a row (a repeat run sends nothing).
   */
  async prepare(
    now = new Date(),
  ): Promise<{ week: string; numbers: StaffDigestNumbersDto } | null> {
    const from = lastWeekStart(now);
    const week = isoDay(from);
    if (
      await this.prisma.staffDigest.findUnique({ where: { week_start: from } })
    ) {
      return null;
    }
    const numbers = await this.compose(from);
    const created = await this.prisma.staffDigest.createMany({
      data: [
        {
          week_start: from,
          payload: numbers as unknown as Prisma.InputJsonValue,
        },
      ],
      skipDuplicates: true,
    });
    return created.count === 0 ? null : { week, numbers };
  }

  /** Who gets the digest: every active super admin (the owner). */
  async recipients(): Promise<Array<{ id: string; email: string | null }>> {
    const owners = await this.prisma.adminProfile.findMany({
      where: { admin_role: 'super_admin', user: { status: 'active' } },
      select: { user: { select: { id: true, email: true } } },
    });
    return owners.map((o) => o.user);
  }

  /** The last 8 digests, newest first. */
  async list(): Promise<StaffDigestListDto> {
    const rows = await this.prisma.staffDigest.findMany({
      orderBy: { week_start: 'desc' },
      take: 8,
    });
    return {
      items: rows.map((r): StaffDigestDto => ({
        weekStart: isoDay(r.week_start),
        numbers: r.payload as unknown as StaffDigestNumbersDto,
        createdAt: r.created_at.toISOString(),
      })),
    };
  }
}
