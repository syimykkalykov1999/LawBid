import { Prisma } from '@prisma/client';
import { parseSearchQuery } from './search-query';

/**
 * The full-text predicate and the rank of [q] on a table whose weighted
 * generated columns are `search_tsv` (english) and `search_tsv_simple`
 * (migration 20261015100000_search_weights). Accents are ignored; the last
 * word is a prefix. [alias] is a table alias written by us, never user input.
 */
export function ftsMatch(alias: string, q: string, prefix = true): Prisma.Sql {
  const parsed = parseSearchQuery(q);
  const tsquery = prefix ? parsed.tsquery : parsed.exact;
  if (!tsquery) return Prisma.sql`FALSE`;
  const a = Prisma.raw(alias);
  return Prisma.sql`(${a}.search_tsv @@ to_tsquery('english', public.f_unaccent(${tsquery}))
      OR ${a}.search_tsv_simple @@ to_tsquery('simple', public.f_unaccent(${tsquery})))`;
}

export function ftsRank(alias: string, q: string): Prisma.Sql {
  const { tsquery } = parseSearchQuery(q);
  if (!tsquery) return Prisma.sql`0`;
  const a = Prisma.raw(alias);
  return Prisma.sql`GREATEST(
      ts_rank(${a}.search_tsv, to_tsquery('english', public.f_unaccent(${tsquery}))),
      ts_rank(${a}.search_tsv_simple, to_tsquery('simple', public.f_unaccent(${tsquery}))))`;
}

/** Typo-tolerant match on a lower-cased title (trigram word similarity). */
export function typoMatch(titleExpr: string, q: string): Prisma.Sql {
  const { plain } = parseSearchQuery(q);
  return Prisma.sql`${plain} <% lower(${Prisma.raw(titleExpr)})`;
}

/** Runs [fn]'s queries with a looser trigram threshold (this transaction only). */
export const TYPO_THRESHOLD = '0.42';
