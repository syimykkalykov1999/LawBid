SET LOCAL lock_timeout = '5s';

-- Load test 2026-10-28 (docs/perf/LOCAL_LOAD_TEST_2026-10-28.md, #2): people
-- search by name rechecked every trigram-index candidate by recomputing
-- f_name_skel()/f_name_cons() on users.full_name_lower — a chain of regexps
-- and an unaccent() call through a non-inlinable SQL function, ~60 µs per row
-- and several times per row (one per OR arm, no common-subexpression reuse).
-- A query word whose trigrams are common («will», «visa») made 100k rechecks
-- = 2-12 s. The keys are now stored once per user and kept current by a
-- trigger; search compares the stored text (same values, same operators).
--
-- Same expressions as before: full_name_lower is the generated column
-- lower(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')); generated
-- columns are computed after BEFORE triggers, so the trigger spells it out.
ALTER TABLE "users" ADD COLUMN "name_skel" TEXT, ADD COLUMN "name_cons" TEXT;

CREATE OR REPLACE FUNCTION public.users_name_keys() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  full_lower TEXT := lower((COALESCE(NEW.first_name, '') || ' ') || COALESCE(NEW.last_name, ''));
BEGIN
  NEW.name_skel := public.f_name_skel(full_lower);
  NEW.name_cons := public.f_name_cons(full_lower);
  RETURN NEW;
END
$$;

CREATE TRIGGER users_name_keys_trg
  BEFORE INSERT OR UPDATE OF first_name, last_name ON "users"
  FOR EACH ROW EXECUTE FUNCTION public.users_name_keys();

-- Existing rows. Production has few users before launch (milliseconds); the
-- 1M-user load-test copy takes ~60 s. Touches only the two new columns, so
-- no other trigger (search outbox) fires.
UPDATE "users"
SET name_skel = public.f_name_skel(full_name_lower),
    name_cons = public.f_name_cons(full_name_lower)
WHERE full_name_lower IS NOT NULL;
