-- Search-ready (owner 2026-10-24, docs/architecture/SEARCH_READY.md).
--
-- A transactional outbox for the search engine. Triggers write one row per
-- change of a searchable entity IN THE SAME TRANSACTION as the change, from
-- every code path (services, admin, raw SQL). They write nothing at all
-- while app_config `search.engine` is absent or 'postgres' (the default):
-- the whole cost of "engine off" is one primary-key read of app_config per
-- changed row, and the table stays empty. The indexer rebuilds the document
-- from the current row, so an event only says WHAT changed (idempotent).

CREATE TABLE "search_outbox" (
  "id"              BIGSERIAL PRIMARY KEY,
  "entity"          TEXT NOT NULL,
  "entity_id"       UUID NOT NULL,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "attempts"        INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "last_error"      TEXT,
  "failed_at"       TIMESTAMPTZ
);

-- Rows the indexer can take now (failed ones are parked and pruned later).
CREATE INDEX "search_outbox_due_idx"
  ON "search_outbox" ("next_attempt_at", "id") WHERE "failed_at" IS NULL;

-- Reindex progress and the mapping version the engine was filled with.
CREATE TABLE "search_index_state" (
  "key"        TEXT PRIMARY KEY,
  "value"      JSONB NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The switch the triggers look at.
CREATE FUNCTION search_outbox_on() RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT value #>> '{}' FROM app_config WHERE key = 'search.engine'),
    'postgres') <> 'postgres'
$$;

-- One small trigger function per (table, id column). [entity] is what the
-- indexer rebuilds; [id column] is the row (or its parent) that changed.
-- UPDATE triggers list the searchable columns only, so counters such as
-- like_count or bids_count never fire them.
DO $$
DECLARE
  m RECORD;
  fn TEXT;
BEGIN
  FOR m IN SELECT * FROM (VALUES
    ('users',                  'id',          'person',   'first_name, last_name, role, status, deleted_at'),
    ('attorney_profiles',      'user_id',     'person',   'username_lower, verification_status, rating_avg, languages'),
    ('client_profiles',        'user_id',     'person',   'username_lower, state_code'),
    ('attorney_practice_areas','attorney_id', 'person',   ''),
    ('attorney_licenses',      'attorney_id', 'person',   'state_code, license_status'),
    ('cases',                  'id',          'case',     'title, description, status, deleted_at, primary_state_code, city, practice_area_id, inferred_practice_id'),
    ('case_states',            'case_id',     'case',     ''),
    ('posts',                  'id',          'post',     'title, body, status, deleted_at, archived_at, content_class, kind'),
    ('post_tags',              'post_id',     'post',     ''),
    ('tags',                   'id',          'tag',      ''),
    ('legal_questions',        'id',          'question', 'title, body, status, deleted_at, practice_area_id'),
    ('legal_answers',          'question_id', 'question', 'body, status, deleted_at')
  ) AS t(tbl, idcol, entity, cols)
  LOOP
    fn := format('search_outbox_%s_%s', m.tbl, m.idcol);
    EXECUTE format($f$
      CREATE FUNCTION %I() RETURNS TRIGGER LANGUAGE plpgsql AS $b$
      DECLARE v UUID;
      BEGIN
        IF TG_OP = 'DELETE' THEN v := OLD.%I; ELSE v := NEW.%I; END IF;
        INSERT INTO search_outbox (entity, entity_id) VALUES (%L, v);
        RETURN NULL;
      END $b$
    $f$, fn, m.idcol, m.idcol, m.entity);
    EXECUTE format(
      'CREATE TRIGGER search_outbox_trg AFTER INSERT %s OR DELETE ON %I FOR EACH ROW WHEN (search_outbox_on()) EXECUTE FUNCTION %I()',
      CASE WHEN m.cols = '' THEN '' ELSE 'OR UPDATE OF ' || m.cols END,
      m.tbl, fn);
  END LOOP;
END $$;
