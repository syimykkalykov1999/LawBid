-- S7-5: repeated updates of one row collapse into one pending outbox event.
-- A "pending" event is one nobody has claimed yet (attempts = 0, not parked).
-- The indexer rebuilds the whole document from the current row, so one
-- pending event per (entity, entity_id) says everything. An event that
-- arrives while the previous one is being processed (attempts > 0) is a new
-- row, so a change made during indexing is never lost.

-- Existing duplicates first (keep the oldest pending one).
DELETE FROM search_outbox a
USING search_outbox b
WHERE a.failed_at IS NULL AND a.attempts = 0
  AND b.failed_at IS NULL AND b.attempts = 0
  AND a.entity = b.entity AND a.entity_id = b.entity_id
  AND a.id > b.id;

CREATE UNIQUE INDEX "search_outbox_pending_uq"
  ON "search_outbox" ("entity", "entity_id")
  WHERE "failed_at" IS NULL AND "attempts" = 0;

-- Same trigger functions as 20261024160000, now with ON CONFLICT DO NOTHING.
DO $$
DECLARE
  m RECORD;
  fn TEXT;
BEGIN
  FOR m IN SELECT * FROM (VALUES
    ('users',                  'id',          'person'),
    ('attorney_profiles',      'user_id',     'person'),
    ('client_profiles',        'user_id',     'person'),
    ('attorney_practice_areas','attorney_id', 'person'),
    ('attorney_licenses',      'attorney_id', 'person'),
    ('cases',                  'id',          'case'),
    ('case_states',            'case_id',     'case'),
    ('posts',                  'id',          'post'),
    ('post_tags',              'post_id',     'post'),
    ('tags',                   'id',          'tag'),
    ('legal_questions',        'id',          'question'),
    ('legal_answers',          'question_id', 'question')
  ) AS t(tbl, idcol, entity)
  LOOP
    fn := format('search_outbox_%s_%s', m.tbl, m.idcol);
    EXECUTE format($f$
      CREATE OR REPLACE FUNCTION %I() RETURNS TRIGGER LANGUAGE plpgsql AS $b$
      DECLARE v UUID;
      BEGIN
        IF TG_OP = 'DELETE' THEN v := OLD.%I; ELSE v := NEW.%I; END IF;
        INSERT INTO search_outbox (entity, entity_id) VALUES (%L, v)
        ON CONFLICT (entity, entity_id)
          WHERE failed_at IS NULL AND attempts = 0 DO NOTHING;
        RETURN NULL;
      END $b$
    $f$, fn, m.idcol, m.idcol, m.entity);
  END LOOP;
END $$;
