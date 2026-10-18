import { Prisma } from '@prisma/client';

export interface BudgetFilterInput {
  minCents?: number;
  maxCents?: number;
  unknown?: boolean;
  percent?: boolean;
  /** Whole percent: only percent budgets up to it (budget_percent_bps). */
  percentMax?: number;
}

/**
 * Owner 2026-10-18: the cases budget filter. The selected options are
 * OR-ed — "amount in range OR percent OR clarify later" — so choosing
 * several shows the cases of any of them. One option alone is exactly what
 * it was before. Empty when nothing is selected.
 */
export function budgetFilterSql(f: BudgetFilterInput): Prisma.Sql {
  const options: Prisma.Sql[] = [];
  const range: Prisma.Sql[] = [];
  if (f.minCents !== undefined) {
    range.push(Prisma.sql`c.budget_cents >= ${f.minCents}`);
  }
  if (f.maxCents !== undefined) {
    range.push(Prisma.sql`c.budget_cents <= ${f.maxCents}`);
  }
  if (range.length) options.push(Prisma.sql`(${Prisma.join(range, ' AND ')})`);
  if (f.unknown) options.push(Prisma.sql`c.budget_mode = 'clarify_later'`);
  if (f.percent) {
    options.push(
      f.percentMax === undefined
        ? Prisma.sql`c.budget_mode = 'percent'`
        : Prisma.sql`(c.budget_mode = 'percent' AND c.budget_percent_bps <= ${Math.round(f.percentMax * 100)})`,
    );
  }
  return options.length
    ? Prisma.sql`AND (${Prisma.join(options, ' OR ')})`
    : Prisma.empty;
}
