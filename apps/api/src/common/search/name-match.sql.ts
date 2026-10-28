import { Prisma } from '@prisma/client';

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Anything that can run a raw query (PrismaService, its read replica, a
 * transaction client). */
export interface RawQueryDb {
  $queryRaw<T = unknown>(query: Prisma.Sql): PromiseLike<T>;
}

/** Spelling keys of a typed text, computed once per search (not per row). */
export interface NameKeys {
  /** f_name_skel(text) — for the whole-text closeness and ranking. */
  whole: string;
  /** One per typed word (at most 4, each 2+ characters). */
  words: Array<{
    /** f_name_skel(word). */
    skel: string;
    /** f_name_skel(the word with LIKE wildcards escaped). */
    skelLike: string;
    /** f_name_cons(escaped word), or null when the word has fewer than 3
     * consonants (that arm never matched). */
    consLike: string | null;
  }>;
}

/** The words nameMatchSql matches: 2+ characters, at most 4. */
function nameWords(q: string): string[] {
  return q
    .split(/\s+/)
    .map((w) => w.replace(/^[@#]+/, ''))
    .filter((w) => w.length >= 2)
    .slice(0, 4);
}

/**
 * Load test 2026-10-28 (docs/perf/LOCAL_LOAD_TEST_2026-10-28.md, #2): the
 * spelling keys of the typed text, in ONE tiny query with no table. Before,
 * `public.f_name_skel($word)` sat inside the row predicate: a generic
 * (prepared) plan could not fold it, evaluated it for every candidate row
 * and kept the «3+ consonants» arm alive even when it could never match
 * (`LIKE '%l%'` = the whole trigram index, 11.9 s for «law» on 1M users).
 */
export async function nameKeys(db: RawQueryDb, q: string): Promise<NameKeys> {
  const words = nameWords(q);
  const rows = await db.$queryRaw<
    {
      whole: string;
      skel: string | null;
      skel_like: string | null;
      cons_like: string | null;
      use_cons: boolean | null;
    }[]
  >(Prisma.sql`
    SELECT public.f_name_skel(${q}::TEXT) AS whole, k.*
    FROM (SELECT 1) one
    LEFT JOIN LATERAL (
      SELECT t.i, public.f_name_skel(t.w) AS skel,
             public.f_name_skel(t.e) AS skel_like,
             public.f_name_cons(t.e) AS cons_like,
             length(public.f_name_cons(t.w)) >= 3 AS use_cons
      FROM unnest(${words}::TEXT[], ${words.map(escapeLike)}::TEXT[])
        WITH ORDINALITY AS t(w, e, i)) k ON TRUE
    ORDER BY k.i`);
  return {
    whole: rows[0]?.whole ?? '',
    words: rows
      .filter((r) => r.skel !== null)
      .map((r) => ({
        skel: r.skel ?? '',
        skelLike: r.skel_like ?? '',
        consLike: r.use_cons ? (r.cons_like ?? '') : null,
      })),
  };
}

/**
 * Owner 2026-10-18: a name in any alphabet, spelling, word order, with a
 * small typo — «Эмили Браун», "brown emily", «Джон» → "John". Every typed
 * word must appear in the name's spelling skeleton (`f_name_skel`,
 * migration 20261018140000), be close to one of its words, or share its
 * consonants («Рэйчел» = "Rachel", `f_name_cons`); the whole text close to
 * the whole name also counts.
 *
 * Load test 2026-10-28: the user's keys are stored in users.name_skel /
 * users.name_cons (trigger, migration 20261108100000_users_name_keys) and
 * the typed text's keys come from [nameKeys], so the trigram recheck
 * compares plain text (users_name_{skel,cons}_col_trgm_idx). Same values,
 * same operators, same thresholds as the expression form it replaces.
 * [users] is the alias of the `users` row (none = unqualified columns).
 */
export function nameMatchSql(keys: NameKeys, users?: string): Prisma.Sql {
  if (!keys.words.length) return Prisma.sql`FALSE`;
  const col = (c: string) => Prisma.raw(users ? `${users}.${c}` : c);
  const skel = col('name_skel');
  const cons = col('name_cons');
  const each = keys.words.map(
    (k) => Prisma.sql`(${skel} LIKE '%' || ${k.skelLike}::TEXT || '%'
      OR ${k.skel}::TEXT <% ${skel}${
        k.consLike === null
          ? Prisma.empty
          : Prisma.sql`
      OR ${cons} LIKE '%' || ${k.consLike}::TEXT || '%'`
      })`,
  );
  return Prisma.sql`(${skel} IS NOT NULL AND ((${Prisma.join(each, ' AND ')})
    OR ${keys.whole}::TEXT % ${skel}))`;
}

/** The typed words, lower case, ё = е (at most [max]). */
export function typedWords(q: string, max = 6): string[] {
  return q
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/\s+/)
    .map((w) => w.replace(/^[@#]+/, ''))
    .filter(Boolean)
    .slice(0, max);
}

/**
 * Owner 2026-10-18: EVERY word occurs in the text, ignoring case, accents
 * and ё/е (public.f_unaccent) — for chat messages, case titles.
 */
export function allWordsSql(column: Prisma.Sql, words: string[]): Prisma.Sql {
  if (!words.length) return Prisma.sql`FALSE`;
  return Prisma.sql`(${Prisma.join(
    words.map(
      (w) =>
        Prisma.sql`public.f_unaccent(replace(lower(${column}), 'ё', 'е')) LIKE '%' || public.f_unaccent(${escapeLike(w)}) || '%'`,
    ),
    ' AND ',
  )})`;
}
