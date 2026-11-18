SET LOCAL lock_timeout = '5s';

-- CONTENT_MEDIA_VERIFY 17.11 №7, step 1 (expand): the drawn signature picture
-- moves from bytea to the private documents bucket; the row keeps its key
-- (apps/api/src/modules/files/signature-image.ts). Nullable, no default, no
-- table rewrite: instant and N-1 safe (the previous release ignores it).
ALTER TABLE "case_signatures" ADD COLUMN "image_key" VARCHAR(255);

-- A signature stays evidence (20261020150200_case_signatures_immutable): the
-- only change allowed is the picture moving to storage — set image_key once
-- (from NULL) and/or empty image_png once a key is there; every other column
-- must stay exactly as written. The cascade rule for DELETE is unchanged.
CREATE OR REPLACE FUNCTION case_signatures_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - 'image_key' - 'image_png')
         = (to_jsonb(OLD) - 'image_key' - 'image_png')
       AND NEW.image_key IS NOT NULL
       AND (OLD.image_key IS NULL OR NEW.image_key = OLD.image_key)
       AND (NEW.image_png IS NOT DISTINCT FROM OLD.image_png OR NEW.image_png IS NULL)
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'case_signatures rows are immutable';
  END IF;
  IF EXISTS (SELECT 1 FROM case_sign_requests WHERE id = OLD.request_id) THEN
    RAISE EXCEPTION 'case_signatures rows are deleted only with their request';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
