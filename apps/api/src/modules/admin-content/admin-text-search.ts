import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/** How many of the newest matches a text search keeps (cursor paging then
 * walks inside them). A search that needs more than this is too broad. */
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
 * Owner 2026-10-23 (admin economy pass): ids of the newest posts whose title
 * contains [q] (trigram index `posts_title_trgm_idx`) or whose text has every
 * word of [q] as a word-prefix (the GIN index `posts_search_tsv_simple_idx`).
 * The old `title ILIKE OR body ILIKE` could use no index and read every post:
 * 90 ms at 300 000 posts, seconds at millions. A word that is rare answers
 * in about a millisecond; a word in every post costs what the scan cost.
 */
export async function postIdsMatching(
  prisma: PrismaService,
  q: string,
): Promise<string[]> {
  const words = searchWords(q);
  // `:*` on each word: a prefix match («immigr» finds «immigration»).
  const prefixQuery = words.map((w) => `${w}:*`).join(' & ');
  const text = words.length
    ? Prisma.sql`search_tsv_simple @@ to_tsquery('simple', f_unaccent(${prefixQuery}))`
    : Prisma.sql`FALSE`;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM posts
    WHERE lower(title) LIKE ${likePattern(q)} OR ${text}
    ORDER BY created_at DESC, id DESC
    LIMIT ${ADMIN_TEXT_SEARCH_MAX}`;
  return rows.map((r) => r.id);
}

/** Ids of the newest cases whose title contains [q] (`cases_title_trgm_idx`). */
export async function caseIdsByTitle(
  prisma: PrismaService,
  q: string,
): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM cases
    WHERE lower(title) LIKE ${likePattern(q)}
    ORDER BY created_at DESC, id DESC
    LIMIT ${ADMIN_TEXT_SEARCH_MAX}`;
  return rows.map((r) => r.id);
}
