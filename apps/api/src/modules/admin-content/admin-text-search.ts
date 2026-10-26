import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/** A search that matches more rows than this is "common": the index no
 * longer helps and the plain newest-first walk (which stops at the first
 * page of matches) is the right plan. */
export const ADMIN_TEXT_SEARCH_MAX = 300;

/** Words of [q] that can go into a `tsquery` prefix match: letters and
 * digits only, at most 6 words. */
export function searchWords(q: string): string[] {
  return (
    q
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.slice(0, 6) ?? []
  );
}

/** `%…%` pattern for LIKE with the wildcards of [q] escaped. */
export function likePattern(q: string): string {
  return `%${q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Owner 2026-10-23 (admin economy pass): ids of EVERY post whose title
 * contains [q] (trigram index `posts_title_trgm_idx`) or whose text has all
 * the words of [q] as word-prefixes (GIN `posts_search_tsv_simple_idx`) —
 * or `null` when more than {@link ADMIN_TEXT_SEARCH_MAX} posts match.
 *
 * The old `title ILIKE OR body ILIKE` could use no index and read every post
 * (90 ms at 300 000 posts, seconds at millions). A specific word now costs a
 * millisecond or two through the indexes; a word that is in a third of all
 * posts returns `null`, and the caller keeps the plain newest-first scan,
 * which finds a first page of such matches almost at once. The probe is a
 * `LIMIT 301` without sorting, so it never costs more than the index lookup.
 */
export async function postIdsMatching(
  prisma: PrismaService,
  q: string,
): Promise<string[] | null> {
  const words = searchWords(q);
  // `:*` on each word: a prefix match («immigr» finds «immigration»).
  const prefixQuery = words.map((w) => `${w}:*`).join(' & ');
  const text = words.length
    ? Prisma.sql`search_tsv_simple @@ to_tsquery('simple', f_unaccent(${prefixQuery}))`
    : Prisma.sql`FALSE`;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM posts
    WHERE lower(title) LIKE ${likePattern(q)} OR ${text}
    LIMIT ${ADMIN_TEXT_SEARCH_MAX + 1}`;
  return rows.length > ADMIN_TEXT_SEARCH_MAX ? null : rows.map((r) => r.id);
}

/** Like {@link postIdsMatching} for case titles (`cases_title_trgm_idx`). */
export async function caseIdsByTitle(
  prisma: PrismaService,
  q: string,
): Promise<string[] | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM cases
    WHERE lower(title) LIKE ${likePattern(q)}
    LIMIT ${ADMIN_TEXT_SEARCH_MAX + 1}`;
  return rows.length > ADMIN_TEXT_SEARCH_MAX ? null : rows.map((r) => r.id);
}
