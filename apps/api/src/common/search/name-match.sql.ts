import { Prisma } from '@prisma/client';

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Owner 2026-10-18: a name in any alphabet, spelling, word order, with a
 * small typo — «Эмили Браун», "brown emily", «Джон» → "John". Every typed
 * word must appear in the name's spelling skeleton (`f_name_skel`,
 * migration 20261018140000), be close to one of its words, or share its
 * consonants («Рэйчел» = "Rachel", `f_name_cons`); the whole text close to
 * the whole name also counts. Uses the users_name_{skel,cons}_trgm_idx.
 */
export function nameMatchSql(
  q: string,
  column: Prisma.Sql = Prisma.sql`full_name_lower`,
): Prisma.Sql {
  const skel = Prisma.sql`public.f_name_skel(${column})`;
  const cons = Prisma.sql`public.f_name_cons(${column})`;
  const words = q
    .split(/\s+/)
    .map((w) => w.replace(/^[@#]+/, ''))
    .filter((w) => w.length >= 2)
    .slice(0, 4);
  if (!words.length) return Prisma.sql`FALSE`;
  const each = words.map(
    (
      w,
    ) => Prisma.sql`(${skel} LIKE '%' || public.f_name_skel(${escapeLike(w)}) || '%'
      OR public.f_name_skel(${w}) <% ${skel}
      OR (length(public.f_name_cons(${w})) >= 3
          AND ${cons} LIKE '%' || public.f_name_cons(${escapeLike(w)}) || '%'))`,
  );
  return Prisma.sql`((${Prisma.join(each, ' AND ')})
    OR public.f_name_skel(${q}) % ${skel})`;
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
