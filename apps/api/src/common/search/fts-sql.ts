import { Prisma } from '@prisma/client';
import { parseSearchQuery } from './search-query';

/**
 * The full-text predicate and the rank of [q] on a table whose weighted
 * generated columns are `search_tsv` (english) and `search_tsv_simple`
 * (migration 20261015100000_search_weights). Accents are ignored; the last
 * word is a prefix. [alias] is a table alias written by us, never user input.
 */
export function ftsMatch(
  alias: string,
  q: string,
  prefix = true,
  practiceIds: string[] = [],
): Prisma.Sql {
  const parsed = parseSearchQuery(q);
  const tsquery = prefix ? parsed.tsquery : parsed.exact;
  if (!tsquery) return Prisma.sql`FALSE`;
  const a = Prisma.raw(alias);
  // Owner 2026-10-15: a query in any language also finds rows filed under
  // the practice it names in another language (practiceIdsFor).
  // Owner 2026-10-15: also the topic its own words name (inferred_practice_id).
  const byPractice = practiceIds.length
    ? Prisma.sql`OR ${a}.practice_area_id = ANY(${practiceIds}::UUID[])
        OR ${a}.inferred_practice_id = ANY(${practiceIds}::UUID[])`
    : Prisma.empty;
  return Prisma.sql`(${a}.search_tsv @@ to_tsquery('english', public.f_unaccent(${tsquery}))
      OR ${a}.search_tsv_simple @@ to_tsquery('simple', public.f_unaccent(${tsquery})) ${byPractice})`;
}

/** Owner 2026-10-15: how much a word in the title (A) and in the text (C)
 * counts; the admin edits both (`search.weight_title` / `_text`). */
export type TextWeights = { title: number; text: number };
export const DEFAULT_TEXT_WEIGHTS: TextWeights = { title: 1, text: 0.2 };

export function ftsRank(
  alias: string,
  q: string,
  w: TextWeights = DEFAULT_TEXT_WEIGHTS,
): Prisma.Sql {
  const { tsquery } = parseSearchQuery(q);
  if (!tsquery) return Prisma.sql`0`;
  const a = Prisma.raw(alias);
  // ts_rank's weight array is {D, C, B, A}.
  const arr = `{0.1, ${num(w.text)}, 0.4, ${num(w.title)}}`;
  return Prisma.sql`GREATEST(
      ts_rank(${arr}::float4[], ${a}.search_tsv, to_tsquery('english', public.f_unaccent(${tsquery}))),
      ts_rank(${arr}::float4[], ${a}.search_tsv_simple, to_tsquery('simple', public.f_unaccent(${tsquery}))))`;
}

/** A finite, non-negative number for the weight array (never NaN). */
function num(x: number): number {
  return Number.isFinite(x) && x >= 0 ? Math.min(x, 1) : 0;
}

/** Typo-tolerant match on a lower-cased title (trigram word similarity). */
export function typoMatch(titleExpr: string, q: string): Prisma.Sql {
  const { plain } = parseSearchQuery(q);
  return Prisma.sql`${plain} <% lower(${Prisma.raw(titleExpr)})`;
}

/** Runs [fn]'s queries with a looser trigram threshold (this transaction only). */
export const TYPO_THRESHOLD = '0.42';
