import { Prisma } from '@prisma/client';

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Anything that can run a raw query (PrismaService, its read replica, a
 * transaction client). */
export interface RawQueryDb {
  $queryRaw<T = unknown>(query: Prisma.Sql): PromiseLike<T>;
}

/**
 * Owner 2026-10-28 (phone test: «jah» found «Syimyk Kalykov»): how loose a
 * name match may be, by how much was typed. Like Instagram / Telegram
 * people search: short text matches only the start of a name word; the
 * spelling skeleton, consonants and trigram closeness (typo tolerance) only
 * for 4+ letters and only above a minimum closeness.
 */
export const NAME_MATCH = {
  /** Plain «contains» (inside a word) from this many letters. */
  containsMinLetters: 3,
  /** Typo / sound-alike arms from this many letters (word and text). */
  fuzzyMinLetters: 4,
  /** word_similarity(typed word skeleton, name skeleton) for a typo. */
  wordSimMin: 0.5,
  /** Closeness the consonant arm («Рэйчел» = "Rachel") still needs. */
  consSimMin: 0.3,
  /** similarity(whole typed skeleton, whole name skeleton). */
  wholeSimMin: 0.45,
} as const;

/** Letters and digits in [s] (spaces, @, dots and dashes do not count). */
export function letterCount(s: string): number {
  return s.replace(/[^\p{L}\p{N}]/gu, '').length;
}

/** Spelling keys of a typed text, computed once per search (not per row). */
export interface NameKeys {
  /** f_name_skel(text) — for the whole-text closeness and ranking. */
  whole: string;
  /** The text has [NAME_MATCH.fuzzyMinLetters]+ letters: typo arms allowed. */
  fuzzy: boolean;
  /** One per typed word (at most 4, each 2+ characters). */
  words: Array<{
    /** f_name_skel(word). */
    skel: string;
    /** f_name_skel(the word with LIKE wildcards escaped). */
    skelLike: string;
    /** f_name_cons(escaped word), or null when the word has fewer than 3
     * consonants or fewer than 4 letters (the arm is off). */
    consLike: string | null;
    /** The word, lower case, LIKE wildcards escaped. */
    rawLike: string;
    /** Letters in the word. */
    letters: number;
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
  const typed = rows.filter((r) => r.skel !== null);
  return {
    whole: rows[0]?.whole ?? '',
    fuzzy: letterCount(q) >= NAME_MATCH.fuzzyMinLetters,
    words: typed.map((r, i) => {
      const w = words[i] ?? '';
      const letters = letterCount(w);
      return {
        skel: r.skel ?? '',
        skelLike: r.skel_like ?? '',
        consLike:
          r.use_cons && letters >= NAME_MATCH.fuzzyMinLetters
            ? (r.cons_like ?? '')
            : null,
        rawLike: escapeLike(w.toLowerCase().replace(/ё/g, 'е')),
        letters,
      };
    }),
  };
}

/**
 * "[col] has a word starting with [like]" (an escaped LIKE needle). Both
 * patterns are anchored at a word start, so pg_trgm takes the word-start
 * trigrams from them and the GIN index serves even a 2-letter needle (an
 * unanchored `'%ab%'` has no trigram and reads the whole index).
 */
export function wordStartSql(col: Prisma.Sql, like: string): Prisma.Sql {
  return Prisma.sql`(${col} LIKE ${`${like}%`} OR ${col} LIKE ${`% ${like}%`})`;
}

/**
 * Owner 2026-10-18: a name in any alphabet, spelling, word order, with a
 * small typo — «Эмили Браун», "brown emily", «Джон» → "John". Every typed
 * word must
 *  - (1–2 letters) start a word of the name as typed; or
 *  - (3+ letters) start a word of the name's spelling skeleton
 *    (`f_name_skel`, migration 20261018140000) — across alphabets, any
 *    word order — or occur inside the plain lower-case name; or
 *  - (4+ letters) be close to a word of the skeleton (typo,
 *    word_similarity ≥ [NAME_MATCH.wordSimMin]) or start a word of the
 *    name's consonants («Рэйчел» = "Rachel", `f_name_cons`, 3+ consonants)
 *    while still [NAME_MATCH.consSimMin] close;
 * or (4+ letters) the whole text is close to the whole name.
 *
 * Owner 2026-10-28: «jah» found «Syimyk Kalykov» — short text never goes
 * through the loose arms any more.
 *
 * Load test 2026-10-28: the user's keys are stored in users.name_skel /
 * users.name_cons (trigger, migration 20261108100000_users_name_keys) and
 * the typed text's keys come from [nameKeys], so every arm compares stored
 * text with a parameter, served by users_name_{skel,cons}_col_trgm_idx /
 * users_full_name_trgm_idx. [users] is the alias of the `users` row (none =
 * unqualified columns).
 */
export function nameMatchSql(keys: NameKeys, users?: string): Prisma.Sql {
  return nameSql(keys, users, true);
}

/**
 * Owner 2026-10-28 («sima kalykov» showed two «Syimyk Kalykov» chats next
 * to «Sima Kalykov»): the strong match only — every typed word starts a
 * word of the name (any alphabet) or, from 3 letters, sits inside it; no
 * typo arms. Every name list (people, chats, followers, notifications;
 * the app's `rankNames` the same) shows the typo matches ([nameMatchSql])
 * only when no row matched strongly: in SQL a row stays when it is strong,
 * or loose while `bool_or(strong) OVER ()` is false.
 */
export function nameStrictSql(keys: NameKeys, users?: string): Prisma.Sql {
  return nameSql(keys, users, false);
}

function nameSql(
  keys: NameKeys,
  users: string | undefined,
  loose: boolean,
): Prisma.Sql {
  if (!keys.words.length) return Prisma.sql`FALSE`;
  const col = (c: string) => Prisma.raw(users ? `${users}.${c}` : c);
  const skel = col('name_skel');
  const cons = col('name_cons');
  const full = col('full_name_lower');
  const each = keys.words.map((k) => {
    // 1–2 letters: the start of a word as typed only; from 3 letters
    // also across alphabets (skeleton) and inside a word.
    const arms: Prisma.Sql[] =
      k.letters >= NAME_MATCH.containsMinLetters
        ? [
            wordStartSql(skel, k.skelLike),
            Prisma.sql`${full} LIKE ${`%${k.rawLike}%`}`,
          ]
        : [wordStartSql(full, k.rawLike)];
    if (loose && k.letters >= NAME_MATCH.fuzzyMinLetters) {
      arms.push(Prisma.sql`(${k.skel}::TEXT <% ${skel}
        AND word_similarity(${k.skel}::TEXT, ${skel}) >= ${NAME_MATCH.wordSimMin}::FLOAT8)`);
      if (k.consLike !== null) {
        arms.push(Prisma.sql`(${wordStartSql(cons, k.consLike)}
        AND word_similarity(${k.skel}::TEXT, ${skel}) >= ${NAME_MATCH.consSimMin}::FLOAT8)`);
      }
    }
    return Prisma.sql`(${Prisma.join(arms, ' OR ')})`;
  });
  const whole =
    loose && keys.fuzzy
      ? Prisma.sql`
    OR (${keys.whole}::TEXT % ${skel}
        AND similarity(${keys.whole}::TEXT, ${skel}) >= ${NAME_MATCH.wholeSimMin}::FLOAT8)`
      : Prisma.empty;
  return Prisma.sql`(${skel} IS NOT NULL AND ((${Prisma.join(each, ' AND ')})${whole}))`;
}

/** Person tiers, best first (owner 2026-10-28, Instagram/Telegram order). */
export const PERSON_TIER = {
  /** @username or full name equals the text. */
  exact: 0,
  /** The username, the name or one of its words (last name) starts with
   * the text. */
  prefix: 1,
  /** Every typed word starts a word of the name or the username, any
   * order ("kalykov syimyk"). */
  wordStart: 2,
  /** The text sits inside the username or the name (3+ letters). */
  contains: 3,
  /** The same, across alphabets / spellings: every typed word starts a
   * word of the spelling skeleton («калык» → "Kalykov"). */
  translit: 4,
  /** Typo / sound-alike (4+ letters, minimum closeness). */
  fuzzy: 5,
  /** Not the name: an attorney of the typed topic or state. */
  topic: 6,
  /** Matched nothing: dropped. */
  none: 9,
} as const;

/**
 * The person's tier for the normalized (lower-case) text [q]: a CASE over
 * stored columns and parameters only. [uname] = lower-case @username,
 * [users] = alias of the `users` row, [topic] = "an attorney of the typed
 * topic/state" (FALSE for clients). Rows with [PERSON_TIER.none] are
 * dropped by the caller.
 */
export function personTierSql(
  q: string,
  keys: NameKeys,
  uname: Prisma.Sql,
  users: string,
  topic: Prisma.Sql,
): Prisma.Sql {
  const fname = Prisma.raw(`${users}.full_name_lower`);
  const skel = Prisma.raw(`${users}.name_skel`);
  const like = escapeLike(q);
  const letters = letterCount(q);
  const T = Object.fromEntries(
    Object.entries(PERSON_TIER).map(([k, v]) => [k, Prisma.raw(String(v))]),
  ) as Record<keyof typeof PERSON_TIER, Prisma.Sql>;
  // Words of the name and of the handle ("syimyk.kalykov" → two words).
  const allWords = Prisma.sql`(' ' || COALESCE(${fname}, '') || ' ' || translate(COALESCE(${uname}, ''), '._-', '   '))`;
  const wordStart = keys.words.length
    ? Prisma.join(
        keys.words.map(
          (k) => Prisma.sql`${allWords} LIKE ${`% ${k.rawLike}%`}`,
        ),
        ' AND ',
      )
    : Prisma.sql`FALSE`;
  const translit =
    keys.words.length && letters >= NAME_MATCH.containsMinLetters
      ? Prisma.join(
          keys.words.map((k) => wordStartSql(skel, k.skelLike)),
          ' AND ',
        )
      : Prisma.sql`FALSE`;
  const contains =
    letters >= NAME_MATCH.containsMinLetters
      ? Prisma.sql`WHEN ${uname} LIKE ${`%${like}%`} OR ${fname} LIKE ${`%${like}%`} THEN ${T.contains}`
      : Prisma.empty;
  const fuzzy = keys.fuzzy
    ? Prisma.sql`WHEN ${nameMatchSql(keys, users)}
        OR (${uname} % ${q} AND similarity(${uname}, ${q}) >= ${NAME_MATCH.wholeSimMin}::FLOAT8)
        THEN ${T.fuzzy}`
    : Prisma.empty;
  return Prisma.sql`(CASE
    WHEN ${uname} = ${q} OR ${fname} = ${q} THEN ${T.exact}
    WHEN ${uname} LIKE ${`${like}%`} OR ${wordStartSql(fname, like)} THEN ${T.prefix}
    WHEN ${wordStart} THEN ${T.wordStart}
    ${contains}
    WHEN ${skel} IS NOT NULL AND ${translit} THEN ${T.translit}
    ${fuzzy}
    WHEN ${topic} THEN ${T.topic}
    ELSE ${T.none} END)::INT`;
}

/**
 * "[q] starts a word of [text]" ignoring case and punctuation — a practice
 * name in any language: «развод» in «Развод и раздел имущества», but «jah»
 * NOT in «Kejahatan Berat» (owner 2026-10-28). Fewer than
 * [NAME_MATCH.containsMinLetters] letters never match.
 */
export function startsAWord(text: string, q: string): boolean {
  if (letterCount(q) < NAME_MATCH.containsMinLetters) return false;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  const needle = norm(q);
  return needle.length > 0 && ` ${norm(text)}`.includes(` ${needle}`);
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
