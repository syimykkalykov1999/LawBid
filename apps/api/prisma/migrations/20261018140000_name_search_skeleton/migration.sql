-- Owner 2026-10-18: people search across alphabets and spellings —
-- «Эмили» finds "Emily", «Юлия» "Yulia", «Джон» "John", «Ричард» "Richard",
-- «Саша» "Sasha". f_name_skel(text) is a "spelling skeleton":
--   1. lower case, no accents, ё = е;
--   2. Cyrillic sounds with several Latin letters: дж → j, щ → ш, ц → ts,
--      ю → iu, я → ia;
--   3. Latin digraphs to one letter: ph → f, ch → ч, sh → ш, zh → ж,
--      kh → (dropped, like х and h — "Khan" = «Хан», "Harris" = «Харрис»);
--   4. the other Cyrillic letters (Russian, Ukrainian, Kyrgyz) in Latin,
--      ь ъ dropped;
--   5. letters that differ between spellings: y/j → i, w → u, q/c → k,
--      x → ks, h dropped;
--   6. a doubled letter once ("Anna" = «Ана», «Мария» = "Maria").
-- The same rules live in the app (apps/mobile/lib/core/text/search_fold.dart)
-- for the lists it filters itself; both have the same test vectors. Partial
-- expression index (raw SQL, like users_full_name_trgm_idx: Prisma ignores
-- it in its diff).
CREATE OR REPLACE FUNCTION public.f_name_skel(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$
  SELECT regexp_replace(
    replace(
      replace(
        translate(
          translate(
            replace(replace(replace(replace(replace(
              replace(replace(replace(replace(replace(
                lower(public.f_unaccent(replace(replace($1, 'ё', 'е'), 'Ё', 'Е'))),
                'дж', 'j'), 'щ', 'ш'), 'ц', 'ts'), 'ю', 'iu'), 'я', 'ia'),
              'ph', 'f'), 'ch', 'ч'), 'sh', 'ш'), 'zh', 'ж'), 'kh', ''),
            'абвгдезийклмнопрстуфыэіїєңөүґхьъ',
            'abvgdeziiklmnoprstufieiienoug'),
          'yjwqc', 'iiukk'),
        'x', 'ks'),
      'h', ''),
    '(.)\1+', '\1', 'g')
  $$;

CREATE INDEX IF NOT EXISTS users_name_skel_trgm_idx ON public.users
  USING gin (public.f_name_skel(full_name_lower) public.gin_trgm_ops)
  WHERE (full_name_lower IS NOT NULL);

-- The consonants of the skeleton: English names are often written by how
-- they sound («Рэйчел» = "Rachel", «Бенжамин» = "Benjamin") — vowels differ,
-- consonants rarely; the hissing sounds are one (ч ш ж z → s: «Шарлотта» =
-- "Charlotte", «Изабелла» = "Isabella", «Голдштейн» = "Goldstein").
-- Matched only for a typed word with 3+ consonants.
CREATE OR REPLACE FUNCTION public.f_name_cons(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$
  SELECT regexp_replace(
    translate(regexp_replace(public.f_name_skel($1), '[aeiou]', '', 'g'),
              'чшжz', 'ssss'),
    '(.)\1+', '\1', 'g')
  $$;

CREATE INDEX IF NOT EXISTS users_name_cons_trgm_idx ON public.users
  USING gin (public.f_name_cons(full_name_lower) public.gin_trgm_ops)
  WHERE (full_name_lower IS NOT NULL);
