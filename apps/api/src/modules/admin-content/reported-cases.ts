import type { PrismaService } from '../../prisma/prisma.service';

/** Upper bound of reported case ids a «Только с жалобами» filter looks at. */
export const REPORTED_CASES_MAX = 5000;

/**
 * Case ids with an open report (bounded) — the «Только с жалобами» filter
 * of the admin cases list, and (row 180 follow-up B7) of its CSV, so the
 * file is what the list shows.
 */
export async function openReportedCaseIds(
  prisma: Pick<PrismaService, 'report'>,
): Promise<string[]> {
  const rows = await prisma.report.findMany({
    where: { target_type: 'case', status: 'open' },
    select: { target_id: true },
    distinct: ['target_id'],
    take: REPORTED_CASES_MAX,
  });
  return rows.map((r) => r.target_id);
}
